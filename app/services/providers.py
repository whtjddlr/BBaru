from __future__ import annotations

import asyncio
import csv
import json
import math
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote, urlencode

import httpx

from app.config import Settings
from app.models import (
    GatewayFetchResponse,
    LiveBundleResponse,
    LiveEndpointInfo,
    Scenario,
    TransitRouteCandidate,
    TransitRouteLeg,
    TransitRouteResponse,
)
from app.services.mock_data import SCENARIOS


SIGNAL_DIRECTION_KEYS = ("st", "nt", "et", "wt", "ne", "nw", "se", "sw")
SUBWAY_ID_TO_LINE_NAME = {
    "1001": "1호선",
    "1002": "2호선",
    "1003": "3호선",
    "1004": "4호선",
    "1005": "5호선",
    "1006": "6호선",
    "1007": "7호선",
    "1008": "8호선",
    "1009": "9호선",
}
LINE_NAME_TO_SUBWAY_IDS = {
    line_name: {subway_id}
    for subway_id, line_name in SUBWAY_ID_TO_LINE_NAME.items()
}
LINE_NAME_TO_CSV_CODE = {
    "1호선": "1",
    "2호선": "2",
    "3호선": "3",
    "4호선": "4",
    "5호선": "5",
    "6호선": "6",
    "7호선": "7",
    "8호선": "8",
    "9호선": "9",
}
SUBWAY_DIRECTION_LABELS = {
    "UP": "상행",
    "DOWN": "하행",
    "IN": "내선",
    "OUT": "외선",
}


TMAP_SCENARIO_ROUTE_LOOKUPS: dict[str, dict[str, Any]] = {
    "seoul-live-default": {
        "name": "Gangnam to Jongno",
        "start_x": 127.02914,
        "start_y": 37.49886,
        "end_x": 126.98311,
        "end_y": 37.57124,
        "count": 1,
    },
    "jamsil-to-coex": {
        "name": "Jamsil to COEX",
        "start_x": 127.10227,
        "start_y": 37.51216,
        "end_x": 127.05974,
        "end_y": 37.51141,
        "count": 1,
    },
    "hongdae-to-deoksugung": {
        "name": "Hongdae to Deoksugung",
        "start_x": 126.92332,
        "start_y": 37.55803,
        "end_x": 126.97341,
        "end_y": 37.56868,
        "count": 1,
    },
    "yeouido-to-gwanghwamun": {
        "name": "Yeouido to Gwanghwamun",
        "start_x": 126.92462,
        "start_y": 37.52208,
        "end_x": 126.97699,
        "end_y": 37.57586,
        "count": 1,
    },
    "sadang-to-seoul-station": {
        "name": "Sadang to Seoul Station",
        "start_x": 126.98195,
        "start_y": 37.47618,
        "end_x": 126.96876,
        "end_y": 37.55512,
        "count": 1,
    },
    "seongsu-to-sports-complex": {
        "name": "Seongsu to Sports Complex",
        "start_x": 127.05688,
        "start_y": 37.54496,
        "end_x": 127.07262,
        "end_y": 37.51493,
        "count": 1,
    },
}


def _payload_items(payload: dict[str, Any]) -> list[dict[str, Any]]:
    items = payload.get("body", {}).get("items", {}).get("item", [])
    if isinstance(items, dict):
        return [items]
    return items


def _xml_to_dict(element: ET.Element) -> Any:
    children = list(element)
    if not children:
        return (element.text or "").strip()

    grouped: dict[str, list[Any]] = {}
    for child in children:
        grouped.setdefault(child.tag, []).append(_xml_to_dict(child))

    result: dict[str, Any] = {}
    for key, values in grouped.items():
        result[key] = values[0] if len(values) == 1 else values
    return result


def _coerce_int(value: Any, default: int = 0) -> int:
    try:
        text = str(value).strip()
        if not text:
            return default
        return int(float(text))
    except (TypeError, ValueError):
        return default


def _coerce_float(value: Any, default: float = 0.0) -> float:
    try:
        text = str(value).strip()
        if not text:
            return default
        return float(text)
    except (TypeError, ValueError):
        return default


def _first_non_empty(*values: Any) -> str | None:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return None


def _remaining_cs_to_seconds(value: Any) -> int | None:
    text = str(value or "").strip()
    if not text:
        return None
    raw = _coerce_float(text, default=-1)
    if raw < 0:
        return None
    return int(round(raw / 100 if raw > 300 else raw))


def _walk_nodes(node: Any) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []
    if isinstance(node, dict):
        nodes.append(node)
        for value in node.values():
            nodes.extend(_walk_nodes(value))
    elif isinstance(node, list):
        for item in node:
            nodes.extend(_walk_nodes(item))
    return nodes


def _find_first_key(payload: Any, *keys: str) -> Any:
    wanted = {key.lower() for key in keys}
    for node in _walk_nodes(payload):
        for key, value in node.items():
            if key.lower() in wanted and value not in ("", None, [], {}):
                return value
    return None


def _map_congestion_text(text: str | None) -> float | None:
    if not text:
        return None

    normalized = text.strip().lower()
    mapping = {
        "여유": 0.18,
        "원활": 0.22,
        "보통": 0.42,
        "약간 붐빔": 0.58,
        "약간붐빔": 0.58,
        "붐빔": 0.72,
        "혼잡": 0.84,
        "서행": 0.56,
        "정체": 0.82,
        "crowded": 0.74,
        "normal": 0.42,
        "smooth": 0.24,
    }
    for key, score in mapping.items():
        if key in normalized:
            return score
    return None


def _citydata_summary(payload: Any) -> tuple[dict[str, Any] | None, float | None, str | None]:
    if not isinstance(payload, dict):
        return None, None, None

    top_level_keys = list(payload.keys())[:20]
    area_name = _first_non_empty(_find_first_key(payload, "AREA_NM", "area_name", "AREA_NAME"))
    congestion_label = _first_non_empty(
        _find_first_key(payload, "AREA_CONGEST_LVL", "area_congest_lvl"),
        _find_first_key(payload, "AREA_CONGEST_MSG", "area_congest_msg"),
        _find_first_key(payload, "AREA_CONGEST_LEVEL", "area_congestion_level"),
    )
    population_min = _find_first_key(payload, "AREA_PPLTN_MIN", "area_ppltn_min")
    population_max = _find_first_key(payload, "AREA_PPLTN_MAX", "area_ppltn_max")

    population_text = None
    if population_min not in (None, "") and population_max not in (None, ""):
        population_text = f"추정 인구 {population_min}~{population_max}명"

    summary = {
        "topLevelKeys": top_level_keys,
        "areaName": area_name,
        "congestionLabel": congestion_label,
        "population": population_text,
    }
    note = " / ".join(part for part in [congestion_label, population_text] if part) or None
    return summary, _map_congestion_text(congestion_label), note


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


def _parse_tot_dt(raw: str) -> datetime:
    return datetime.strptime(raw, "%Y%m%d%H%M%S")


def _filter_positions_by_stop_bounds(positions: list[dict[str, Any]], stops: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not positions or not stops:
        return positions

    latitudes = [float(stop["bstaLat"]) for stop in stops]
    longitudes = [float(stop["bstaLot"]) for stop in stops]
    min_lat, max_lat = min(latitudes) - 0.08, max(latitudes) + 0.08
    min_lon, max_lon = min(longitudes) - 0.08, max(longitudes) + 0.08

    filtered: list[dict[str, Any]] = []
    for position in positions:
        lat = float(position["lat"])
        lon = float(position["lot"])
        if min_lat <= lat <= max_lat and min_lon <= lon <= max_lon:
            filtered.append(position)
    return filtered or positions


def _build_route_scenario(
    *,
    scenario_id: str,
    scenario_name: str,
    route_info_item: dict[str, Any] | None,
    stops: list[dict[str, Any]],
    positions: list[dict[str, Any]],
    note_prefix: str,
) -> tuple[Scenario, dict[str, Any]]:
    if not stops or not positions:
        raise ValueError("Route scenario creation requires both stops and positions.")

    sorted_stops = sorted(stops, key=lambda item: int(item["bstaSn"]))
    valid_positions = _filter_positions_by_stop_bounds(positions, sorted_stops)
    latest_position = sorted(valid_positions, key=lambda item: _parse_tot_dt(item["totDt"]), reverse=True)[0]

    prefix_distances = [0.0]
    for current, nxt in zip(sorted_stops, sorted_stops[1:]):
        prefix_distances.append(
            prefix_distances[-1]
            + _haversine(
                float(current["bstaLat"]),
                float(current["bstaLot"]),
                float(nxt["bstaLat"]),
                float(nxt["bstaLot"]),
            )
        )

    latest_lat = float(latest_position["lat"])
    latest_lon = float(latest_position["lot"])
    stop_distances = [
        _haversine(latest_lat, latest_lon, float(stop["bstaLat"]), float(stop["bstaLot"]))
        for stop in sorted_stops
    ]
    nearest_idx = min(range(len(stop_distances)), key=stop_distances.__getitem__)
    target_idx = len(sorted_stops) - 1
    if len(sorted_stops) > 2 and sorted_stops[0]["bstaNm"] == sorted_stops[-1]["bstaNm"]:
        target_idx = max(nearest_idx + 1, len(sorted_stops) // 2)
        target_idx = min(target_idx, len(sorted_stops) - 1)
    remaining_distance = stop_distances[nearest_idx] + (prefix_distances[target_idx] - prefix_distances[nearest_idx])

    route_no = (
        (route_info_item or {}).get("rteNo")
        or latest_position.get("rteNo")
        or latest_position.get("rteId")
        or "노선 미상"
    )
    route_type = (route_info_item or {}).get("rteType") or "버스"
    city = latest_position.get("lclgvNm") or (route_info_item or {}).get("lclgvNm") or "실시간 API"
    target_stop = sorted_stops[target_idx]
    nearest_stop = sorted_stops[nearest_idx]
    speed_kph = max(8.0, float(latest_position.get("oprSpd") or 0))
    reliability = 0.86 if latest_position.get("evtType") == "GNSS" else 0.74

    scenario = Scenario(
        id=scenario_id,
        name=scenario_name,
        city=city,
        route_name=f"{route_no} ({route_type})",
        target_stop_name=target_stop["bstaNm"],
        primary_mode_label="버스",
        walk_distance_m=420,
        signal_wait_sec=18,
        crossing_distance_m=16,
        crossing_window_sec=20,
        bus_remaining_distance_m=int(round(remaining_distance)),
        bus_speed_kph=speed_kph,
        bus_reliability=reliability,
        bus_freshness_sec=20,
        congestion_level=0.34,
        is_last_bus=False,
        is_night=False,
        alternative_label="다음 버스 또는 인접 정류장",
        alternative_eta_sec=420,
        note=(
            f"{note_prefix}, 최근 차량 {latest_position['vhclNo']}, "
            f"근접 정류장 {nearest_stop['bstaNm']} -> 목표 정류장 {target_stop['bstaNm']}"
        ),
    )
    debug = {
        "routeId": latest_position.get("rteId"),
        "routeNo": route_no,
        "routeType": route_type,
        "vehicleNo": latest_position.get("vhclNo"),
        "nearestStopName": nearest_stop["bstaNm"],
        "nearestStopSequence": nearest_stop["bstaSn"],
        "targetStopName": target_stop["bstaNm"],
        "estimatedRemainingMeters": int(round(remaining_distance)),
        "estimatedSpeedKph": speed_kph,
        "positionCount": len(positions),
        "validPositionCount": len(valid_positions),
        "highlights": [
            f"노선 {route_no} ({route_type})",
            f"근접 정류장 {nearest_stop['bstaNm']}",
            f"목표 정류장까지 약 {int(round(remaining_distance))}m",
        ],
    }
    return scenario, debug


def _pick_signal_sample(items: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not items:
        return None
    for item in items:
        if any(str(item.get(f"{direction}PdsgSttsNm") or "").strip() for direction in SIGNAL_DIRECTION_KEYS):
            return item
    return items[0]


def _signal_profile(sample: dict[str, Any] | None) -> dict[str, Any]:
    if not sample:
        return {
            "direction": "unknown",
            "status": "unknown",
            "wait_sec": 18,
            "crossing_window_sec": 18,
            "note": "신호등 샘플이 없어 기본 보행값을 사용했습니다.",
        }

    candidates: list[dict[str, Any]] = []
    for direction in SIGNAL_DIRECTION_KEYS:
        status = str(sample.get(f"{direction}PdsgSttsNm") or "").strip()
        remaining_sec = _remaining_cs_to_seconds(sample.get(f"{direction}PdsgRmndCs"))
        if status or remaining_sec is not None:
            candidates.append(
                {
                    "direction": direction,
                    "status": status or "unknown",
                    "remaining_sec": remaining_sec,
                }
            )

    if not candidates:
        return {
            "direction": "unknown",
            "status": "unknown",
            "wait_sec": 18,
            "crossing_window_sec": 18,
            "note": "신호 보행 상태가 비어 있어 기본 보행값을 사용했습니다.",
        }

    selected = next((item for item in candidates if "go" in item["status"].lower()), candidates[0])
    remaining_sec = selected["remaining_sec"] or 18
    is_go = "go" in selected["status"].lower()
    wait_sec = 0 if is_go else max(5, min(remaining_sec, 90))
    crossing_window_sec = max(10, min(remaining_sec if is_go else 18, 60))

    return {
        "direction": selected["direction"],
        "status": selected["status"],
        "wait_sec": wait_sec,
        "crossing_window_sec": crossing_window_sec,
        "note": f"{selected['direction']} 보행신호 {selected['status']} / 잔여 {remaining_sec}초",
    }


def _trim_signal_sample(sample: dict[str, Any] | None) -> dict[str, Any] | None:
    if not sample:
        return None
    trimmed: dict[str, Any] = {
        "crsrdId": sample.get("crsrdId"),
        "lclgvNm": sample.get("lclgvNm"),
        "stdgCd": sample.get("stdgCd"),
    }
    for direction in SIGNAL_DIRECTION_KEYS:
        status = sample.get(f"{direction}PdsgSttsNm")
        remaining = sample.get(f"{direction}PdsgRmndCs")
        if status or remaining:
            trimmed[f"{direction}PdsgSttsNm"] = status
            trimmed[f"{direction}PdsgRmndCs"] = remaining
    return trimmed


def _subway_arrival_items(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    arrivals = payload.get("realtimeArrivalList", [])
    if isinstance(arrivals, dict):
        return [arrivals]
    if isinstance(arrivals, list):
        return [item for item in arrivals if isinstance(item, dict)]
    return []


def _subway_position_items(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    positions = payload.get("realtimePositionList", [])
    if isinstance(positions, dict):
        return [positions]
    if isinstance(positions, list):
        return [item for item in positions if isinstance(item, dict)]
    return []


def _line_name_from_subway_id(value: Any) -> str | None:
    return SUBWAY_ID_TO_LINE_NAME.get(str(value or "").strip())


def _line_codes_for_name(line_name: str) -> set[str]:
    normalized = str(line_name or "").strip()
    if not normalized:
        return set()
    return LINE_NAME_TO_SUBWAY_IDS.get(normalized, set())


def _line_csv_code(line_name: str) -> str | None:
    normalized = str(line_name or "").strip()
    if not normalized:
        return None
    if normalized in LINE_NAME_TO_CSV_CODE:
        return LINE_NAME_TO_CSV_CODE[normalized]
    digit_match = re.search(r"(\d+)", normalized)
    if digit_match:
        return digit_match.group(1)
    return None


def _match_subway_line(item: dict[str, Any], line_name: str) -> bool:
    if not line_name:
        return True
    wanted_ids = _line_codes_for_name(line_name)
    subway_id = str(item.get("subwayId") or "").strip()
    if wanted_ids and subway_id in wanted_ids:
        return True
    current_line_name = _line_name_from_subway_id(subway_id)
    if current_line_name and current_line_name == line_name:
        return True
    train_line = str(item.get("trainLineNm") or "")
    subway_name = str(item.get("subwayNm") or "")
    return line_name in train_line or line_name in subway_name


def _subway_eta_seconds(item: dict[str, Any]) -> int:
    eta_sec = _coerce_int(item.get("barvlDt"), default=0)
    if eta_sec > 0:
        return eta_sec
    return _parse_eta_from_text(_first_non_empty(item.get("arvlMsg2"), item.get("arvlMsg3")) or "") or 0


def _subway_direction_code(value: str | None) -> str:
    text = str(value or "").strip()
    mapping = {
        "상행": "UP",
        "하행": "DOWN",
        "내선": "IN",
        "외선": "OUT",
        "up": "UP",
        "down": "DOWN",
        "in": "IN",
        "out": "OUT",
    }
    return mapping.get(text, text.upper() if text else "UNKNOWN")


def _subway_direction_label(code: str) -> str:
    return SUBWAY_DIRECTION_LABELS.get(code, code)


def _filter_subway_arrivals(arrivals: list[dict[str, Any]], line_name: str) -> list[dict[str, Any]]:
    filtered = [item for item in arrivals if _match_subway_line(item, line_name)]
    return filtered or arrivals


def _subway_realtime_groups(arrivals: list[dict[str, Any]], line_name: str) -> list[dict[str, Any]]:
    filtered = _filter_subway_arrivals(arrivals, line_name)
    groups: dict[str, list[dict[str, Any]]] = {}

    for item in filtered:
        direction_code = _subway_direction_code(_first_non_empty(item.get("updnLine")))
        eta_sec = _subway_eta_seconds(item)
        entry = {
            "directionCode": direction_code,
            "directionLabel": _subway_direction_label(direction_code),
            "etaSec": eta_sec,
            "etaLabel": _first_non_empty(item.get("arvlMsg2"), item.get("arvlMsg3")) or "도착 정보 없음",
            "trainLineNm": _first_non_empty(item.get("trainLineNm")) or line_name,
            "destination": _first_non_empty(item.get("bstatnNm")),
            "trainNo": _first_non_empty(item.get("btrainNo")),
            "receivedAt": _first_non_empty(item.get("recptnDt")),
        }
        groups.setdefault(direction_code, []).append(entry)

    result: list[dict[str, Any]] = []
    for direction_code, entries in groups.items():
        sorted_entries = sorted(entries, key=lambda entry: (entry["etaSec"] <= 0, entry["etaSec"]))
        result.append(
            {
                "directionCode": direction_code,
                "directionLabel": _subway_direction_label(direction_code),
                "items": sorted_entries[:2],
            }
        )

    return sorted(result, key=lambda item: item["directionCode"])


def _extract_station_code(arrivals: list[dict[str, Any]], line_name: str) -> str | None:
    filtered = _filter_subway_arrivals(arrivals, line_name)
    for item in filtered:
        statn_id = str(item.get("statnId") or "").strip()
        if statn_id:
            return statn_id[-4:]
    return None


def _time_to_minutes(value: str) -> int | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        hour, minute, second = text.split(":")
        return int(hour) * 60 + int(minute) + int(second) // 60
    except ValueError:
        return None


def _format_time_label(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return "-"
    parts = text.split(":")
    if len(parts) < 2:
        return text
    return f"{parts[0].zfill(2)}:{parts[1].zfill(2)}"


def _timetable_weektag(now: datetime) -> str:
    weekday = now.weekday()
    if weekday == 5:
        return "SAT"
    if weekday == 6:
        return "END"
    return "DAY"


def _fallback_timetable_groups(realtime_groups: list[dict[str, Any]], now: datetime) -> list[dict[str, Any]]:
    fallback_groups: list[dict[str, Any]] = []
    current_minutes = now.hour * 60 + now.minute

    for group in realtime_groups:
        items = group.get("items", [])
        eta_values = [item["etaSec"] for item in items if item.get("etaSec", 0) > 0]
        if len(eta_values) >= 2:
            headway_min = max(2, int(round((eta_values[1] - eta_values[0]) / 60)))
        elif eta_values:
            headway_min = max(3, int(round(eta_values[0] / 60)))
        else:
            headway_min = 5

        next_values = eta_values[:2] or [headway_min * 60, headway_min * 120]
        next_rows = []
        for index, eta_sec in enumerate(next_values[:2], start=1):
            departure_minutes = current_minutes + max(1, int(round(eta_sec / 60)))
            hour = departure_minutes // 60
            minute = departure_minutes % 60
            next_rows.append(
                {
                    "timeLabel": f"{hour:02d}:{minute:02d}",
                    "trainNo": items[index - 1].get("trainNo") if index - 1 < len(items) else None,
                    "destination": items[index - 1].get("destination") if index - 1 < len(items) else None,
                    "express": False,
                }
            )

        previous_rows = []
        for step in range(2, 0, -1):
            departure_minutes = current_minutes - headway_min * step
            hour = departure_minutes // 60
            minute = departure_minutes % 60
            previous_rows.append(
                {
                    "timeLabel": f"{hour:02d}:{minute:02d}",
                    "trainNo": None,
                    "destination": None,
                    "express": False,
                }
            )

        fallback_groups.append(
            {
                "directionCode": group["directionCode"],
                "directionLabel": group["directionLabel"],
                "previous": previous_rows,
                "next": next_rows,
            }
        )

    return fallback_groups


def _parse_eta_from_text(text: str) -> int | None:
    if not text:
        return None
    minute_match = re.search(r"(\d+)\s*분", text)
    second_match = re.search(r"(\d+)\s*초", text)
    if minute_match or second_match:
        minutes = int(minute_match.group(1)) if minute_match else 0
        seconds = int(second_match.group(1)) if second_match else 0
        return minutes * 60 + seconds
    raw_digits = re.search(r"(\d+)", text)
    if raw_digits:
        return int(raw_digits.group(1))
    return None


def _pick_subway_arrival(arrivals: list[dict[str, Any]], line_name: str) -> dict[str, Any] | None:
    if not arrivals:
        return None
    filtered = _filter_subway_arrivals(arrivals, line_name)
    sorted_items = sorted(filtered, key=lambda item: (_subway_eta_seconds(item) <= 0, _subway_eta_seconds(item)))
    return sorted_items[0] if sorted_items else arrivals[0]


def _subway_arrival_profile(arrival: dict[str, Any] | None, default_line_name: str) -> dict[str, Any]:
    if not arrival:
        return {
            "line_name": default_line_name,
            "station_name": None,
            "eta_sec": 240,
            "message": "실시간 지하철 도착 데이터를 찾지 못해 기본 ETA 4분을 사용합니다.",
            "reliability": 0.58,
        }

    eta_sec = _coerce_int(arrival.get("barvlDt"), default=0)
    if eta_sec <= 0:
        eta_sec = _parse_eta_from_text(_first_non_empty(arrival.get("arvlMsg2"), arrival.get("arvlMsg3")) or "") or 240

    line_name = _line_name_from_subway_id(arrival.get("subwayId")) or default_line_name
    station_name = _first_non_empty(arrival.get("statnNm"))
    message = _first_non_empty(arrival.get("arvlMsg2"), arrival.get("arvlMsg3"), arrival.get("bstatnNm")) or "도착 정보 확인"

    return {
        "line_name": line_name,
        "station_name": station_name,
        "eta_sec": max(45, eta_sec),
        "message": message,
        "reliability": 0.84 if arrival.get("barvlDt") else 0.68,
        "updnLine": arrival.get("updnLine"),
        "destination": arrival.get("bstatnNm"),
    }


def _bus_item_list(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []

    service_result = payload.get("ServiceResult")
    if isinstance(service_result, dict):
        payload = service_result

    msg_body = payload.get("msgBody", {})
    if not isinstance(msg_body, dict):
        return []
    items = msg_body.get("itemList", [])
    if isinstance(items, dict):
        return [items]
    if isinstance(items, list):
        return [item for item in items if isinstance(item, dict)]
    return []


def _bus_message(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    service_result = payload.get("ServiceResult", payload)
    if not isinstance(service_result, dict):
        return None
    msg_header = service_result.get("msgHeader", {})
    if isinstance(msg_header, dict):
        return _first_non_empty(msg_header.get("headerMsg"), msg_header.get("msgHeader"))
    return None


def _bus_header(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    service_result = payload.get("ServiceResult", payload)
    if not isinstance(service_result, dict):
        return None
    msg_header = service_result.get("msgHeader")
    if isinstance(msg_header, dict):
        return msg_header
    return None


def _bus_congestion_score(raw: Any) -> float | None:
    mapping = {
        "3": 0.22,
        "4": 0.44,
        "5": 0.72,
        "6": 0.88,
    }
    text = str(raw or "").strip()
    return mapping.get(text)


def build_default_seoul_scenario(settings: Settings) -> Scenario:
    return Scenario(
        id="seoul-live-default",
        name="강남에서 종로까지 통합 판단",
        city="서울",
        route_name=f"{settings.seoul_default_line_name} 강남역 탑승 후 시청역 하차",
        target_stop_name="종로1가 공평도시유적전시관 접근",
        primary_mode_label="지하철",
        walk_distance_m=780,
        signal_wait_sec=26,
        crossing_distance_m=18,
        crossing_window_sec=18,
        bus_remaining_distance_m=2200,
        bus_speed_kph=36.0,
        bus_reliability=0.72,
        bus_freshness_sec=20,
        congestion_level=0.42,
        is_last_bus=False,
        is_night=False,
        alternative_label="다음 열차 또는 다른 출구",
        alternative_eta_sec=420,
        note="강남에서 종로까지 이동하는 대표 경로를 기준으로, 신호등과 지하철을 함께 반영하는 서울 통합 시나리오입니다.",
    )


class MockScenarioProvider:
    def list_scenarios(self) -> list[Scenario]:
        return SCENARIOS

    def get_scenario(self, scenario_id: str) -> Scenario:
        for scenario in SCENARIOS:
            if scenario.id == scenario_id:
                return scenario
        raise KeyError(f"Unknown scenario: {scenario_id}")


class GatewayClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def fetch(self, path: str, params: dict[str, Any]) -> GatewayFetchResponse:
        if not self.settings.has_service_key:
            raise ValueError("SAFEETA_SERVICE_KEY is not configured.")

        normalized_path = path if path.startswith("/") else f"/{path}"
        async with httpx.AsyncClient(base_url=self.settings.gateway_base_url, timeout=20.0) as client:
            encoded_key = self.settings.service_key_encoded.strip()
            if encoded_key:
                request_params = dict(params)
                request_params.setdefault("_type", self.settings.default_response_type)
                query = urlencode(request_params, doseq=True)
                full_path = f"{normalized_path}?serviceKey={encoded_key}"
                if query:
                    full_path = f"{full_path}&{query}"
                response = await client.get(full_path)
            else:
                request_params = dict(params)
                request_params["serviceKey"] = unquote(self.settings.service_key.strip())
                request_params.setdefault("_type", self.settings.default_response_type)
                response = await client.get(normalized_path, params=request_params)

            content_type = response.headers.get("content-type", "unknown")
            try:
                payload: Any = response.json()
            except ValueError:
                payload = response.text

        return GatewayFetchResponse(
            requested_url=str(response.request.url),
            status_code=response.status_code,
            content_type=content_type,
            payload=payload,
        )

    def _item_count(self, payload: Any) -> int | None:
        if not isinstance(payload, dict):
            return None
        total = payload.get("body", {}).get("totalCount")
        try:
            return int(total)
        except (TypeError, ValueError):
            return None

    def _first_item(self, payload: Any) -> dict[str, Any] | None:
        if not isinstance(payload, dict):
            return None
        items = payload.get("body", {}).get("items", {}).get("item", [])
        if isinstance(items, dict):
            return items
        if isinstance(items, list) and items and isinstance(items[0], dict):
            return items[0]
        return None

    def _header(self, payload: Any) -> dict[str, Any] | None:
        if isinstance(payload, dict):
            header = payload.get("header")
            if isinstance(header, dict):
                return header
        return None

    def _items(self, payload: Any) -> list[dict[str, Any]]:
        if isinstance(payload, dict):
            return _payload_items(payload)
        return []

    async def fetch_route_info(self, stdg_cd: str, page_no: int = 1, num_of_rows: int = 100) -> GatewayFetchResponse:
        return await self.fetch(
            path=self.settings.route_info_path,
            params={"stdgCd": stdg_cd, "pageNo": page_no, "numOfRows": num_of_rows},
        )

    async def fetch_route_stops(self, stdg_cd: str, rte_id: str, page_no: int = 1, num_of_rows: int = 100) -> GatewayFetchResponse:
        return await self.fetch(
            path=self.settings.route_stops_path,
            params={"stdgCd": stdg_cd, "rteId": rte_id, "pageNo": page_no, "numOfRows": num_of_rows},
        )

    async def fetch_route_positions(self, stdg_cd: str, rte_id: str, page_no: int = 1, num_of_rows: int = 100) -> GatewayFetchResponse:
        return await self.fetch(
            path=self.settings.route_positions_path,
            params={"stdgCd": stdg_cd, "rteId": rte_id, "pageNo": page_no, "numOfRows": num_of_rows},
        )

    async def fetch_signal_directions(self, stdg_cd: str | None, page_no: int = 1, num_of_rows: int = 20) -> GatewayFetchResponse:
        params: dict[str, Any] = {"pageNo": page_no, "numOfRows": num_of_rows}
        if stdg_cd:
            params["stdgCd"] = stdg_cd
        return await self.fetch(path=self.settings.signal_directions_path, params=params)

    async def build_live_bundle(self, stdg_cd: str, rte_id: str | None, page_no: int = 1, num_of_rows: int = 100) -> LiveBundleResponse:
        issues: list[str] = []

        route_info = await self.fetch_route_info(stdg_cd=stdg_cd, page_no=page_no, num_of_rows=num_of_rows)
        resolved_rte_id = rte_id
        route_info_sample = self._first_item(route_info.payload)
        route_info_header = self._header(route_info.payload)

        if route_info.status_code != 200:
            issues.append(f"노선 기본정보 응답 상태가 {route_info.status_code}입니다.")
        if route_info_sample and not resolved_rte_id:
            resolved_rte_id = str(route_info_sample.get("rteId") or "").strip() or None

        route_stops_sample: dict[str, Any] | None = None
        route_positions_sample: dict[str, Any] | None = None
        route_stops_count: int | None = None
        route_positions_count: int | None = None
        route_stops_status_code: int | None = None
        route_positions_status_code: int | None = None
        route_stops_header: dict[str, Any] | None = None
        route_positions_header: dict[str, Any] | None = None

        if resolved_rte_id:
            route_stops = await self.fetch_route_stops(stdg_cd=stdg_cd, rte_id=resolved_rte_id, page_no=page_no, num_of_rows=num_of_rows)
            route_positions = await self.fetch_route_positions(stdg_cd=stdg_cd, rte_id=resolved_rte_id, page_no=page_no, num_of_rows=num_of_rows)
            route_stops_status_code = route_stops.status_code
            route_positions_status_code = route_positions.status_code
            route_stops_header = self._header(route_stops.payload)
            route_positions_header = self._header(route_positions.payload)
            route_stops_sample = self._first_item(route_stops.payload)
            route_positions_sample = self._first_item(route_positions.payload)
            route_stops_count = self._item_count(route_stops.payload)
            route_positions_count = self._item_count(route_positions.payload)
            if route_stops.status_code != 200:
                issues.append(f"정류장 경유지 응답 상태가 {route_stops.status_code}입니다.")
            if route_positions.status_code != 200:
                issues.append(f"실시간 위치 응답 상태가 {route_positions.status_code}입니다.")
        else:
            issues.append("rteId가 없어 정류장 경유지와 실시간 위치 조회를 건너뛰었습니다.")

        if route_info_sample is None:
            issues.append("노선 기본정보 응답에서 item을 찾지 못했습니다.")

        return LiveBundleResponse(
            stdg_cd=stdg_cd,
            rte_id=resolved_rte_id,
            endpoints=[
                LiveEndpointInfo(label="노선 기본정보", path=self.settings.route_info_path, required_params=["stdgCd"]),
                LiveEndpointInfo(label="정류장 경유지", path=self.settings.route_stops_path, required_params=["stdgCd", "rteId"]),
                LiveEndpointInfo(label="실시간 위치", path=self.settings.route_positions_path, required_params=["stdgCd", "rteId"]),
            ],
            route_info_status_code=route_info.status_code,
            route_stops_status_code=route_stops_status_code,
            route_positions_status_code=route_positions_status_code,
            route_info_header=route_info_header,
            route_stops_header=route_stops_header,
            route_positions_header=route_positions_header,
            route_info_count=self._item_count(route_info.payload),
            route_stops_count=route_stops_count,
            route_positions_count=route_positions_count,
            route_info_sample=route_info_sample,
            route_stops_sample=route_stops_sample,
            route_positions_sample=route_positions_sample,
            issues=issues,
        )

    async def build_live_scenario(self, stdg_cd: str, rte_id: str | None, page_no: int = 1, num_of_rows: int = 100) -> tuple[Scenario, dict[str, Any]]:
        route_info = await self.fetch_route_info(stdg_cd=stdg_cd, page_no=page_no, num_of_rows=num_of_rows)
        route_info_items = self._items(route_info.payload)
        if route_info.status_code != 200 or not route_info_items:
            raise ValueError("라이브 노선 기본정보를 불러오지 못했습니다.")

        resolved_rte_id = rte_id or str(route_info_items[0].get("rteId") or "").strip()
        if not resolved_rte_id:
            raise ValueError("라이브 노선 ID를 결정하지 못했습니다.")

        route_info_item = next((item for item in route_info_items if str(item.get("rteId")) == resolved_rte_id), route_info_items[0])
        route_stops = await self.fetch_route_stops(stdg_cd=stdg_cd, rte_id=resolved_rte_id, page_no=page_no, num_of_rows=num_of_rows)
        route_positions = await self.fetch_route_positions(stdg_cd=stdg_cd, rte_id=resolved_rte_id, page_no=page_no, num_of_rows=num_of_rows)

        if route_stops.status_code != 200 or route_positions.status_code != 200:
            raise ValueError("라이브 정류장 또는 실시간 위치 조회에 실패했습니다.")

        stops = [item for item in self._items(route_stops.payload) if str(item.get("rteId")) == resolved_rte_id]
        positions = [item for item in self._items(route_positions.payload) if str(item.get("rteId")) == resolved_rte_id]
        if not stops or not positions:
            raise ValueError("선택한 라이브 노선에서 정류장 또는 위치 데이터가 비어 있습니다.")

        route_no = route_info_item.get("rteNo") or resolved_rte_id
        return _build_route_scenario(
            scenario_id="live-default",
            scenario_name=f"{route_info_item.get('lclgvNm', '실시간')} 버스 탑승 판단",
            route_info_item=route_info_item,
            stops=stops,
            positions=positions,
            note_prefix=f"라이브 API 기반 {route_no} 노선 시나리오",
        )


class SampleDataProvider:
    def __init__(self, root_dir: Path) -> None:
        self.root_dir = root_dir
        self.sample_dir = root_dir / "sample_data"

    def _candidate_paths(self, *names: str) -> list[Path]:
        paths: list[Path] = []
        for name in names:
            path = self.sample_dir / name
            if path.exists():
                paths.append(path)
        return paths

    def _find_ulsan_position_file(self) -> Path | None:
        candidates = self._candidate_paths("ulsan_positions.json", "response_1775540778605.json", "response_1775540876887.json")
        for candidate in candidates:
            try:
                payload = json.loads(candidate.read_text(encoding="utf-8"))
                items = self._items(payload)
                if items and items[0].get("lclgvNm") == "울산광역시":
                    return candidate
            except Exception:
                continue
        return None

    def _find_ulsan_stops_file(self) -> Path | None:
        candidates = self._candidate_paths("ulsan_route_stops.json", "response_1775540980563.json")
        for candidate in candidates:
            try:
                payload = json.loads(candidate.read_text(encoding="utf-8"))
                items = self._items(payload)
                if items and items[0].get("lclgvNm") == "울산광역시":
                    return candidate
            except Exception:
                continue
        return None

    def available(self) -> bool:
        return self._find_ulsan_position_file() is not None and self._find_ulsan_stops_file() is not None

    @staticmethod
    def _items(payload: dict[str, Any]) -> list[dict[str, Any]]:
        return _payload_items(payload)

    def build_scenario(self, route_id: str = "192000001") -> Scenario:
        position_file = self._find_ulsan_position_file()
        stops_file = self._find_ulsan_stops_file()
        if not position_file or not stops_file:
            raise ValueError("Ulsan sample files are not ready.")

        positions_payload = json.loads(position_file.read_text(encoding="utf-8"))
        stops_payload = json.loads(stops_file.read_text(encoding="utf-8"))

        positions = [item for item in self._items(positions_payload) if item.get("rteId") == route_id]
        stops = [item for item in self._items(stops_payload) if item.get("rteId") == route_id]

        if not positions or not stops:
            raise ValueError(f"Sample route data not found for route_id={route_id}")

        scenario, _ = _build_route_scenario(
            scenario_id=f"ulsan-{route_id}",
            scenario_name="울산광역시 실노선 탑승 판단",
            route_info_item=None,
            stops=stops,
            positions=positions,
            note_prefix="울산 실시간 위치+정류장 경유지 샘플 기반 시나리오",
        )
        return scenario


class SeoulCitydataClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def fetch_citydata(self, area_name: str, data_type: str = "json", use_sample: bool = True) -> GatewayFetchResponse:
        area_encoded = quote(area_name, safe="")
        if use_sample or not self.settings.has_seoul_openapi_key:
            url = self.settings.seoul_citydata_sample_template.format(area_name=area_encoded)
        else:
            url = self.settings.seoul_citydata_live_template.format(
                api_key=self.settings.seoul_openapi_key.strip(),
                data_type=data_type,
                area_name=area_encoded,
            )

        async with httpx.AsyncClient(timeout=4.0) as client:
            response = await client.get(url)
            content_type = response.headers.get("content-type", "unknown")
            payload: Any
            text = response.text
            try:
                stripped = text.lstrip()
                if "json" in content_type.lower() or stripped.startswith("{") or stripped.startswith("["):
                    payload = response.json()
                else:
                    root = ET.fromstring(text)
                    payload = {root.tag: _xml_to_dict(root)}
            except Exception:
                payload = text

        return GatewayFetchResponse(
            requested_url=str(response.request.url),
            status_code=response.status_code,
            content_type=content_type,
            payload=payload,
        )


class SeoulSubwayClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def _fetch_with_template(self, template: str, *, data_type: str, **params: Any) -> GatewayFetchResponse:
        if not self.settings.has_seoul_subway_key:
            raise ValueError("SAFEETA_SEOUL_SUBWAY_OPENAPI_KEY is not configured.")

        encoded_params = {
            key: quote(str(value), safe="") if key in {"station_name", "line_name"} else value
            for key, value in params.items()
        }
        url = template.format(
            api_key=self.settings.seoul_subway_openapi_key.strip(),
            data_type=data_type,
            **encoded_params,
        )

        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(url)
            content_type = response.headers.get("content-type", "unknown")
            text = response.text
            try:
                stripped = text.lstrip()
                if "json" in content_type.lower() or stripped.startswith("{") or stripped.startswith("["):
                    payload: Any = response.json()
                else:
                    root = ET.fromstring(text)
                    payload = {root.tag: _xml_to_dict(root)}
            except Exception:
                payload = text

        return GatewayFetchResponse(
            requested_url=str(response.request.url),
            status_code=response.status_code,
            content_type=content_type,
            payload=payload,
        )

    async def fetch_arrivals(
        self,
        station_name: str,
        data_type: str = "json",
        start_index: int = 1,
        end_index: int = 8,
    ) -> GatewayFetchResponse:
        return await self._fetch_with_template(
            self.settings.seoul_subway_arrival_template,
            station_name=station_name,
            data_type=data_type,
            start_index=start_index,
            end_index=end_index,
        )

    async def fetch_positions(
        self,
        line_name: str,
        data_type: str = "json",
        start_index: int = 0,
        end_index: int = 8,
    ) -> GatewayFetchResponse:
        return await self._fetch_with_template(
            self.settings.seoul_subway_position_template,
            line_name=line_name,
            data_type=data_type,
            start_index=start_index,
            end_index=end_index,
        )


class SeoulSubwayTimetableProvider:
    def __init__(self, settings: Settings, root_dir: Path) -> None:
        self.settings = settings
        self.cache_dir = root_dir / "sample_data" / "cache"
        self.cache_path = self.cache_dir / "seoul_subway_timetable.csv"

    def _download_csv_if_missing(self) -> Path:
        if self.cache_path.exists() and self.cache_path.stat().st_size > 0:
            return self.cache_path

        self.cache_dir.mkdir(parents=True, exist_ok=True)
        with httpx.Client(timeout=90.0, follow_redirects=True) as client:
            response = client.post(
                self.settings.seoul_subway_timetable_download_url,
                data={
                    "infId": self.settings.seoul_subway_timetable_inf_id,
                    "seq": self.settings.seoul_subway_timetable_seq,
                    "infSeq": self.settings.seoul_subway_timetable_inf_seq,
                },
            )
            response.raise_for_status()
            self.cache_path.write_bytes(response.content)

        return self.cache_path

    def get_timetable_window(
        self,
        *,
        station_code: str,
        line_name: str,
        realtime_groups: list[dict[str, Any]],
        now: datetime | None = None,
    ) -> dict[str, Any]:
        current_time = now or datetime.now()
        csv_path = self._download_csv_if_missing()
        line_code = _line_csv_code(line_name)
        weektag = _timetable_weektag(current_time)
        current_minutes = current_time.hour * 60 + current_time.minute

        groups: dict[str, list[dict[str, Any]]] = {}
        with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                if row.get("SI_ID") != station_code:
                    continue
                if line_code and row.get("LINE") != line_code:
                    continue
                row_weektag = (row.get("WEEKTAG") or "").strip()
                if row_weektag and row_weektag != weektag:
                    continue

                direction_code = _subway_direction_code(row.get("INOUTTAG"))
                departure_time = (row.get("EDT") or row.get("STT") or "").strip()
                departure_minutes = _time_to_minutes(departure_time)
                if departure_minutes is None:
                    continue

                groups.setdefault(direction_code, []).append(
                    {
                        "timeLabel": _format_time_label(departure_time),
                        "minutes": departure_minutes,
                        "trainNo": _first_non_empty(row.get("TRAIN_NO")),
                        "destination": _first_non_empty(row.get("ED_STT_NM")),
                        "origin": _first_non_empty(row.get("ST_STT_NM")),
                        "express": str(row.get("GUBHANG") or "").strip() == "1",
                    }
                )

        timetable_groups: list[dict[str, Any]] = []
        for direction_code, rows in groups.items():
            ordered_rows = sorted(rows, key=lambda item: item["minutes"])
            previous = [row for row in ordered_rows if row["minutes"] <= current_minutes][-2:]
            next_rows = [row for row in ordered_rows if row["minutes"] > current_minutes][:2]
            timetable_groups.append(
                {
                    "directionCode": direction_code,
                    "directionLabel": _subway_direction_label(direction_code),
                    "previous": previous,
                    "next": next_rows,
                }
            )

        if timetable_groups:
            return {
                "source": "official_csv",
                "weektag": weektag,
                "groups": sorted(timetable_groups, key=lambda item: item["directionCode"]),
            }

        return {
            "source": "fallback_realtime",
            "weektag": weektag,
            "groups": _fallback_timetable_groups(realtime_groups, current_time),
        }


class SeoulBusClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def _fetch_xml(self, template: str, **params: Any) -> GatewayFetchResponse:
        if not self.settings.has_seoul_bus_key:
            raise ValueError("SAFEETA_SEOUL_BUS_OPENAPI_KEY is not configured.")

        url = template.format(
            api_key=quote(self.settings.effective_seoul_bus_key, safe=""),
            **{key: quote(str(value), safe="") for key, value in params.items()},
        )

        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(url)
            content_type = response.headers.get("content-type", "unknown")
            text = response.text
            try:
                root = ET.fromstring(text)
                payload: Any = {root.tag: _xml_to_dict(root)}
            except Exception:
                payload = text

        return GatewayFetchResponse(
            requested_url=str(response.request.url),
            status_code=response.status_code,
            content_type=content_type,
            payload=payload,
        )

    async def fetch_route_positions(self, bus_route_id: str) -> GatewayFetchResponse:
        return await self._fetch_xml(self.settings.seoul_bus_position_template, bus_route_id=bus_route_id)

    async def fetch_route_info(self, bus_route_id: str) -> GatewayFetchResponse:
        return await self._fetch_xml(self.settings.seoul_bus_route_info_template, bus_route_id=bus_route_id)

    async def fetch_arrivals_by_route(self, bus_route_id: str) -> GatewayFetchResponse:
        return await self._fetch_xml(self.settings.seoul_bus_arrivals_template, bus_route_id=bus_route_id)

    async def fetch_station_by_uid(self, ars_id: str) -> GatewayFetchResponse:
        return await self._fetch_xml(self.settings.seoul_bus_station_uid_template, ars_id=ars_id)


class KakaoLocalClient:
    keyword_search_url = "https://dapi.kakao.com/v2/local/search/keyword.json"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def search_places(
        self,
        *,
        query: str,
        x: float | None = None,
        y: float | None = None,
        radius: int | None = None,
        size: int = 6,
    ) -> dict[str, Any]:
        if not self.settings.has_kakao_rest_api_key:
            raise ValueError("SAFEETA_KAKAO_REST_API_KEY is not configured.")

        params: dict[str, Any] = {
            "query": query,
            "size": size,
            "sort": "distance" if x is not None and y is not None else "accuracy",
        }
        if x is not None and y is not None:
            params["x"] = x
            params["y"] = y
        if radius is not None:
            params["radius"] = radius

        headers = {"Authorization": f"KakaoAK {self.settings.kakao_rest_api_key.strip()}"}

        async with httpx.AsyncClient(timeout=6.0) as client:
            response = await client.get(self.keyword_search_url, params=params, headers=headers)
            response.raise_for_status()
            payload = response.json()

        documents = payload.get("documents", []) if isinstance(payload, dict) else []
        items: list[dict[str, Any]] = []
        for document in documents:
            if not isinstance(document, dict):
                continue
            items.append(
                {
                    "id": document.get("id"),
                    "placeName": document.get("place_name"),
                    "addressName": document.get("address_name"),
                    "roadAddressName": document.get("road_address_name"),
                    "categoryName": document.get("category_name"),
                    "placeUrl": document.get("place_url"),
                    "distance": _coerce_int(document.get("distance"), default=0) if document.get("distance") else None,
                    "x": _coerce_float(document.get("x"), default=0.0),
                    "y": _coerce_float(document.get("y"), default=0.0),
                }
            )

        return {
            "requestedUrl": str(response.request.url),
            "count": len(items),
            "items": items,
            "meta": payload.get("meta", {}) if isinstance(payload, dict) else {},
        }


class TmapTransitClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        if os.getenv("VERCEL"):
            self.state_path = Path("/tmp/tmap_transit_usage.json")
        else:
            self.state_path = Path(__file__).resolve().parents[2] / "logs" / "tmap_transit_usage.json"

    def _usage_key(
        self,
        *,
        start_x: float,
        start_y: float,
        end_x: float,
        end_y: float,
        count: int,
        search_dttm: str | None,
    ) -> str:
        return "|".join(
            [
                f"{start_x:.6f}",
                f"{start_y:.6f}",
                f"{end_x:.6f}",
                f"{end_y:.6f}",
                str(count),
                search_dttm or "",
            ]
        )

    def _load_state(self) -> dict[str, Any]:
        today = datetime.now().strftime("%Y-%m-%d")
        if not self.state_path.exists():
            return {
                "date": today,
                "usage": {"routes": 0, "summary": 0, "statistical": 0},
                "cache": {"routes": {}, "summary": {}, "train_congestion": {}, "car_congestion": {}, "alighting_ratio": {}},
            }

        try:
            state = json.loads(self.state_path.read_text(encoding="utf-8"))
        except Exception:
            return {
                "date": today,
                "usage": {"routes": 0, "summary": 0, "statistical": 0},
                "cache": {"routes": {}, "summary": {}, "train_congestion": {}, "car_congestion": {}, "alighting_ratio": {}},
            }

        if state.get("date") != today:
            return {
                "date": today,
                "usage": {"routes": 0, "summary": 0, "statistical": 0},
                "cache": {"routes": {}, "summary": {}, "train_congestion": {}, "car_congestion": {}, "alighting_ratio": {}},
            }

        if not isinstance(state.get("cache"), dict):
            state["cache"] = {}
        if not isinstance(state["cache"].get("routes"), dict):
            state["cache"]["routes"] = {}

        usage = state.get("usage")
        if not isinstance(usage, dict):
            legacy_count = _coerce_int(state.get("count"), default=0)
            usage = {"routes": legacy_count, "summary": 0, "statistical": 0}
        state["usage"] = {
            "routes": _coerce_int(usage.get("routes"), default=0),
            "summary": _coerce_int(usage.get("summary"), default=0),
            "statistical": _coerce_int(usage.get("statistical"), default=0),
        }
        return state

    def _save_state(self, state: dict[str, Any]) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self.state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    @staticmethod
    def _as_list(value: Any) -> list[Any]:
        if isinstance(value, list):
            return value
        if isinstance(value, dict):
            return [value]
        return []

    @staticmethod
    def _lane_label(lane: dict[str, Any]) -> str | None:
        for key in ("route", "name", "busNo", "subwayCode", "subwayName"):
            value = lane.get(key)
            if value not in (None, ""):
                return str(value)
        return None

    @staticmethod
    def _parse_linestring(linestring: Any) -> list[list[float]]:
        text = str(linestring or "").strip()
        if not text:
            return []

        coords: list[list[float]] = []
        for lon_text, lat_text in re.findall(r"(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)", text):
            try:
                lon = float(lon_text)
                lat = float(lat_text)
            except ValueError:
                continue
            point = [lat, lon]
            if not coords or coords[-1] != point:
                coords.append(point)
        return coords

    def _leg_path(self, leg: dict[str, Any], mode: str) -> list[list[float]]:
        path: list[list[float]] = []
        start_node = leg.get("start") if isinstance(leg.get("start"), dict) else {}
        end_node = leg.get("end") if isinstance(leg.get("end"), dict) else {}

        def append_points(points: list[list[float]]) -> None:
            nonlocal path
            for point in points:
                if not path or path[-1] != point:
                    path.append(point)

        start_lat = _coerce_float(start_node.get("lat"), default=0.0)
        start_lon = _coerce_float(start_node.get("lon"), default=0.0)
        if start_lat and start_lon:
            append_points([[start_lat, start_lon]])

        if mode == "WALK":
            for step in self._as_list(leg.get("steps")):
                if isinstance(step, dict):
                    append_points(self._parse_linestring(step.get("linestring")))
        else:
            pass_shape = leg.get("passShape")
            if isinstance(pass_shape, dict):
                append_points(self._parse_linestring(pass_shape.get("linestring")))
            else:
                for shape in self._as_list(pass_shape):
                    if isinstance(shape, dict):
                        append_points(self._parse_linestring(shape.get("linestring")))

        end_lat = _coerce_float(end_node.get("lat"), default=0.0)
        end_lon = _coerce_float(end_node.get("lon"), default=0.0)
        if end_lat and end_lon:
            append_points([[end_lat, end_lon]])

        return path

    def _normalize_leg(self, leg: dict[str, Any]) -> TransitRouteLeg:
        mode = str(leg.get("mode") or leg.get("trafficType") or "unknown").upper()
        lane_items = [
            item
            for item in (self._as_list(leg.get("lane")) + self._as_list(leg.get("Lane")))
            if isinstance(item, dict)
        ]
        lane_label = _first_non_empty(*(self._lane_label(item) for item in lane_items))
        label = lane_label or {
            "WALK": "Walk",
            "BUS": "Bus",
            "SUBWAY": "Subway",
            "TRANSFER": "Transfer",
        }.get(mode, mode.title())
        start_node = leg.get("start") if isinstance(leg.get("start"), dict) else {}
        end_node = leg.get("end") if isinstance(leg.get("end"), dict) else {}
        return TransitRouteLeg(
            mode=mode.lower(),
            label=label,
            start_name=_first_non_empty(start_node.get("name"), leg.get("startName")),
            end_name=_first_non_empty(end_node.get("name"), leg.get("endName")),
            distance_m=_coerce_int(leg.get("distance"), default=0) or None,
            duration_sec=_coerce_int(leg.get("sectionTime"), default=0) or None,
            path=self._leg_path(leg, mode),
        )

    @staticmethod
    def _is_transit_leg(leg: TransitRouteLeg) -> bool:
        return leg.mode in {"bus", "subway", "train", "rail"}

    def _normalize_itinerary(self, itinerary: dict[str, Any], index: int) -> TransitRouteCandidate:
        legs = [
            self._normalize_leg(leg)
            for leg in self._as_list(itinerary.get("legs"))
            if isinstance(leg, dict)
        ]
        first_transit_index = next((idx for idx, leg in enumerate(legs) if self._is_transit_leg(leg)), -1)
        last_transit_index = next((idx for idx in range(len(legs) - 1, -1, -1) if self._is_transit_leg(legs[idx])), -1)

        total_walk_distance = _coerce_int(itinerary.get("totalWalkDistance"), default=0) or None
        total_walk_duration_sec = _coerce_int(itinerary.get("totalWalkTime"), default=0) or None
        total_duration_sec = _coerce_int(itinerary.get("totalTime"), default=0) or None
        total_transit_duration_sec = sum(
            leg.duration_sec or 0
            for leg in legs
            if self._is_transit_leg(leg)
        ) or None

        initial_walk_distance = None
        initial_walk_duration_sec = None
        final_walk_distance = None
        final_walk_duration_sec = None
        transfer_walk_distance = None
        transfer_walk_duration_sec = None
        if total_walk_distance:
            if first_transit_index == -1:
                initial_walk_distance = total_walk_distance
                initial_walk_duration_sec = total_walk_duration_sec
                transfer_walk_distance = 0
                transfer_walk_duration_sec = 0
                final_walk_distance = 0
                final_walk_duration_sec = 0
            else:
                initial_walk_distance = sum(
                    leg.distance_m or 0
                    for leg in legs[:first_transit_index]
                    if leg.mode == "walk"
                )
                initial_walk_duration_sec = sum(
                    leg.duration_sec or 0
                    for leg in legs[:first_transit_index]
                    if leg.mode == "walk"
                )
                final_walk_distance = sum(
                    leg.distance_m or 0
                    for leg in legs[last_transit_index + 1 :]
                    if leg.mode == "walk"
                )
                final_walk_duration_sec = sum(
                    leg.duration_sec or 0
                    for leg in legs[last_transit_index + 1 :]
                    if leg.mode == "walk"
                )
                transfer_walk_distance = max(
                    0,
                    total_walk_distance - initial_walk_distance - final_walk_distance,
                )
                transfer_walk_duration_sec = max(
                    0,
                    (total_walk_duration_sec or 0) - (initial_walk_duration_sec or 0) - (final_walk_duration_sec or 0),
                )

        summary = " -> ".join(leg.label for leg in legs[:5]) or f"Route {index}"
        fare = itinerary.get("fare") if isinstance(itinerary.get("fare"), dict) else {}
        regular_fare = fare.get("regular") if isinstance(fare.get("regular"), dict) else {}
        return TransitRouteCandidate(
            index=index,
            total_distance_m=_coerce_int(itinerary.get("totalDistance"), default=0) or None,
            total_walk_distance_m=total_walk_distance,
            total_duration_sec=total_duration_sec,
            total_walk_duration_sec=total_walk_duration_sec,
            total_transit_duration_sec=total_transit_duration_sec,
            initial_walk_distance_m=initial_walk_distance,
            initial_walk_duration_sec=initial_walk_duration_sec,
            final_walk_distance_m=final_walk_distance,
            final_walk_duration_sec=final_walk_duration_sec,
            transfer_walk_distance_m=transfer_walk_distance,
            transfer_walk_duration_sec=transfer_walk_duration_sec,
            transfer_count=_coerce_int(itinerary.get("transferCount"), default=0),
            total_fare=_coerce_int(
                regular_fare.get("totalFare") or fare.get("totalFare") or fare.get("cashFare"),
                default=0,
            )
            or None,
            summary=summary,
            legs=legs,
        )

    async def fetch_routes(
        self,
        *,
        start_x: float,
        start_y: float,
        end_x: float,
        end_y: float,
        count: int = 3,
        search_dttm: str | None = None,
    ) -> TransitRouteResponse:
        if not self.settings.has_tmap_transit_key:
            raise ValueError("SAFEETA_TMAP_TRANSIT_APP_KEY is not configured.")

        state = self._load_state()
        usage_key = self._usage_key(
            start_x=start_x,
            start_y=start_y,
            end_x=end_x,
            end_y=end_y,
            count=count,
            search_dttm=search_dttm,
        )
        route_cache = state["cache"].setdefault("routes", {})
        cached = route_cache.get(usage_key)
        if isinstance(cached, dict):
            cached_payload = dict(cached)
            cached_payload.setdefault("source", "tmap-transit-cache")
            cached_payload["usage"] = {
                "date": state["date"],
                "bucket": "routes",
                "used": state["usage"]["routes"],
                "limit": self.settings.tmap_transit_routes_daily_limit,
                "remaining": max(0, self.settings.tmap_transit_routes_daily_limit - state["usage"]["routes"]),
                "cached": True,
            }
            return TransitRouteResponse(**cached_payload)

        if state["usage"]["routes"] >= self.settings.tmap_transit_routes_daily_limit:
            raise ValueError(
                f"TMAP routes daily limit reached ({state['usage']['routes']}/{self.settings.tmap_transit_routes_daily_limit})."
            )

        payload: dict[str, Any] = {
            "startX": start_x,
            "startY": start_y,
            "endX": end_x,
            "endY": end_y,
            "count": count,
            "lang": 0,
            "format": "json",
        }
        if search_dttm:
            payload["searchDttm"] = search_dttm

        headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "appKey": self.settings.tmap_transit_app_key.strip(),
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(self.settings.tmap_transit_routes_url, json=payload, headers=headers)
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                if response.status_code == 403:
                    raise ValueError(
                        "TMAP 대중교통 경로 API 권한이 없습니다. AppKey가 routes 상품에 승인/활성화되어 있는지 확인해주세요."
                    ) from exc
                if response.status_code == 429:
                    raise ValueError("TMAP 대중교통 경로 API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.") from exc
                raise ValueError(
                    f"TMAP 대중교통 경로 API 호출 실패 ({response.status_code})."
                ) from exc
            body = response.json()

        meta = body.get("metaData", {}) if isinstance(body, dict) else {}
        plan = meta.get("plan", {}) if isinstance(meta, dict) else {}
        itineraries = [
            item
            for item in self._as_list(plan.get("itineraries"))
            if isinstance(item, dict)
        ]
        candidates = [self._normalize_itinerary(itinerary, index + 1) for index, itinerary in enumerate(itineraries)]

        issues: list[str] = []
        if not candidates:
            issues.append("TMAP transit route returned no itineraries.")
        state["usage"]["routes"] += 1
        response_model = TransitRouteResponse(
            source="tmap-transit",
            route_count=len(candidates),
            candidates=candidates,
            requested={
                "url": str(response.request.url),
                "body": payload,
            },
            usage={
                "date": state["date"],
                "bucket": "routes",
                "used": state["usage"]["routes"],
                "limit": self.settings.tmap_transit_routes_daily_limit,
                "remaining": max(0, self.settings.tmap_transit_routes_daily_limit - state["usage"]["routes"]),
                "cached": False,
            },
            issues=issues,
        )
        route_cache[usage_key] = response_model.model_dump()
        self._save_state(state)
        return response_model


class TmapDatasetProvider:
    def __init__(self, workspace_root: Path, settings: Settings) -> None:
        self.dataset_root = workspace_root / "sample_data" / "tmap"
        self.usage_path = workspace_root / "logs" / "tmap_transit_usage.json"
        self.settings = settings

    def list_dataset_files(self) -> dict[str, Any]:
        categories = {
            "routes": sorted((self.dataset_root / "routes").glob("*.json")) if (self.dataset_root / "routes").exists() else [],
            "train_congestion": sorted((self.dataset_root / "train_congestion").glob("*.json"))
            if (self.dataset_root / "train_congestion").exists()
            else [],
            "car_congestion": sorted((self.dataset_root / "car_congestion").glob("*.json"))
            if (self.dataset_root / "car_congestion").exists()
            else [],
            "alighting_ratio": sorted((self.dataset_root / "alighting_ratio").glob("*.json"))
            if (self.dataset_root / "alighting_ratio").exists()
            else [],
        }

        def serialize(path: Path) -> dict[str, Any]:
            stat = path.stat()
            return {
                "name": path.name,
                "path": str(path),
                "size": stat.st_size,
                "modifiedAt": datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
            }

        usage: dict[str, Any] = {}
        if self.usage_path.exists():
            try:
                usage = json.loads(self.usage_path.read_text(encoding="utf-8"))
            except Exception:
                usage = {}

        return {
            "root": str(self.dataset_root),
            "categories": {key: [serialize(path) for path in files] for key, files in categories.items()},
            "counts": {key: len(files) for key, files in categories.items()},
            "usage": usage,
            "quotas": {
                "routesDaily": self.settings.tmap_transit_routes_daily_limit,
                "summaryDaily": self.settings.tmap_transit_summary_daily_limit,
                "statisticalDaily": self.settings.tmap_statistical_congestion_daily_limit,
            },
            "recommendation": {
                "routes": "up to 10/day",
                "summary": "up to 10/day",
                "statisticalShared": "up to 2/day for train congestion, car congestion, alighting ratio combined",
            },
        }


class TmapScenarioRouteSnapshotProvider:
    def __init__(self, workspace_root: Path, transit_client: "TmapTransitClient") -> None:
        self.workspace_root = workspace_root
        self.transit_client = transit_client
        self.snapshot_path = workspace_root / "sample_data" / "cache" / "tmap_scenario_routes.json"

    def _load_state(self) -> dict[str, Any]:
        if not self.snapshot_path.exists():
            return {"snapshots": {}}
        try:
            state = json.loads(self.snapshot_path.read_text(encoding="utf-8"))
        except Exception:
            return {"snapshots": {}}
        if not isinstance(state, dict):
            return {"snapshots": {}}
        snapshots = state.get("snapshots")
        if not isinstance(snapshots, dict):
            state["snapshots"] = {}
        return state

    def _save_state(self, state: dict[str, Any]) -> None:
        self.snapshot_path.parent.mkdir(parents=True, exist_ok=True)
        self.snapshot_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    @staticmethod
    def _fresh(entry: dict[str, Any]) -> bool:
        expires_at = entry.get("expires_at")
        if not expires_at:
            return False
        try:
            return datetime.fromisoformat(str(expires_at)) > datetime.now()
        except ValueError:
            return False

    def get_snapshot(self, scenario_id: str) -> TransitRouteResponse | None:
        state = self._load_state()
        entry = state.get("snapshots", {}).get(scenario_id)
        if not isinstance(entry, dict) or not self._fresh(entry):
            return None

        payload = dict(entry.get("route") or {})
        if not payload:
            return None
        payload["source"] = "tmap-scenario-snapshot"
        usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
        usage["snapshot"] = True
        usage["fetchedAt"] = entry.get("fetched_at")
        usage["expiresAt"] = entry.get("expires_at")
        payload["usage"] = usage
        return TransitRouteResponse(**payload)

    async def refresh_snapshot(self, scenario_id: str) -> TransitRouteResponse:
        lookup = TMAP_SCENARIO_ROUTE_LOOKUPS.get(scenario_id)
        if not lookup:
            raise KeyError(f"Unknown scenario route lookup: {scenario_id}")

        result = await self.transit_client.fetch_routes(
            start_x=float(lookup["start_x"]),
            start_y=float(lookup["start_y"]),
            end_x=float(lookup["end_x"]),
            end_y=float(lookup["end_y"]),
            count=int(lookup.get("count", 1)),
        )
        fetched_at = datetime.now()
        expires_at = fetched_at.replace(microsecond=0)
        state = self._load_state()
        state.setdefault("snapshots", {})[scenario_id] = {
            "scenario_id": scenario_id,
            "scenario_name": lookup.get("name", scenario_id),
            "fetched_at": fetched_at.isoformat(timespec="seconds"),
            "expires_at": (fetched_at.timestamp() + 60 * 60 * 24),
            "route": result.model_dump(),
        }
        snapshot_entry = state["snapshots"][scenario_id]
        snapshot_entry["expires_at"] = datetime.fromtimestamp(snapshot_entry["expires_at"]).isoformat(timespec="seconds")
        self._save_state(state)
        return self.get_snapshot(scenario_id) or result

    def list_snapshots(self) -> dict[str, Any]:
        state = self._load_state()
        snapshots = state.get("snapshots", {})
        return {
            "available": list(TMAP_SCENARIO_ROUTE_LOOKUPS.keys()),
            "snapshots": {
                scenario_id: {
                    "scenarioId": scenario_id,
                    "scenarioName": entry.get("scenario_name", scenario_id),
                    "fetchedAt": entry.get("fetched_at"),
                    "expiresAt": entry.get("expires_at"),
                    "isFresh": self._fresh(entry) if isinstance(entry, dict) else False,
                }
                for scenario_id, entry in snapshots.items()
                if isinstance(entry, dict)
            },
        }


class SeoulScenarioBuilder:
    def __init__(
        self,
        settings: Settings,
        gateway_client: GatewayClient,
        citydata_client: SeoulCitydataClient,
        subway_client: SeoulSubwayClient,
        bus_client: SeoulBusClient,
    ) -> None:
        self.settings = settings
        self.gateway_client = gateway_client
        self.citydata_client = citydata_client
        self.subway_client = subway_client
        self.bus_client = bus_client

    async def collect_snapshot(
        self,
        *,
        area_name: str,
        station_name: str,
        line_name: str,
        bus_route_id: str | None,
        ars_id: str | None,
        stdg_cd: str,
        page_no: int,
        num_of_rows: int,
        citydata_data_type: str,
        subway_data_type: str,
        use_citydata_sample: bool,
        start_index: int,
        end_index: int,
    ) -> dict[str, Any]:
        issues: list[str] = []
        tasks: dict[str, asyncio.Task[GatewayFetchResponse]] = {}

        if self.settings.has_service_key:
            tasks["signal"] = asyncio.create_task(
                self.gateway_client.fetch_signal_directions(
                    stdg_cd=stdg_cd,
                    page_no=page_no,
                    num_of_rows=num_of_rows,
                )
            )
        else:
            issues.append("KLID 신호등 키가 없어 기본 보행신호 값으로 계산합니다.")

        if self.settings.has_seoul_subway_key:
            tasks["subway_arrivals"] = asyncio.create_task(
                self.subway_client.fetch_arrivals(
                    station_name=station_name,
                    data_type=subway_data_type,
                    start_index=start_index,
                    end_index=end_index,
                )
            )
            tasks["subway_positions"] = asyncio.create_task(
                self.subway_client.fetch_positions(
                    line_name=line_name,
                    data_type=subway_data_type,
                    start_index=0,
                    end_index=max(5, end_index),
                )
            )
        else:
            issues.append("서울 지하철 키가 없어 기본 열차 ETA로 계산합니다.")

        if use_citydata_sample or self.settings.has_seoul_openapi_key:
            tasks["citydata"] = asyncio.create_task(
                self.citydata_client.fetch_citydata(
                    area_name=area_name,
                    data_type=citydata_data_type,
                    use_sample=use_citydata_sample,
                )
            )
        else:
            issues.append("서울 도시데이터 키가 없어 혼잡도는 기본값을 사용합니다.")

        if self.settings.has_seoul_bus_key and bus_route_id:
            tasks["bus_positions"] = asyncio.create_task(self.bus_client.fetch_route_positions(bus_route_id=bus_route_id))
            tasks["bus_route_info"] = asyncio.create_task(self.bus_client.fetch_route_info(bus_route_id=bus_route_id))
            if ars_id:
                tasks["bus_station"] = asyncio.create_task(self.bus_client.fetch_station_by_uid(ars_id=ars_id))
        elif bus_route_id:
            issues.append("서울 버스 키가 없어 버스 위치/도착정보는 아직 placeholder로 유지합니다.")

        raw_results = await asyncio.gather(*tasks.values(), return_exceptions=True) if tasks else []
        responses = dict(zip(tasks.keys(), raw_results))

        signal_response = responses.get("signal")
        signal_summary: dict[str, Any] | None = None
        signal_sample: dict[str, Any] | None = None
        signal_profile = _signal_profile(None)
        if isinstance(signal_response, Exception):
            issues.append(f"신호등 호출 실패: {type(signal_response).__name__}: {signal_response}")
        elif isinstance(signal_response, GatewayFetchResponse):
            signal_items = _payload_items(signal_response.payload) if isinstance(signal_response.payload, dict) else []
            signal_sample = _pick_signal_sample(signal_items)
            signal_profile = _signal_profile(signal_sample)
            signal_summary = {
                "requestedUrl": signal_response.requested_url,
                "statusCode": signal_response.status_code,
                "count": len(signal_items),
                "header": signal_response.payload.get("header") if isinstance(signal_response.payload, dict) else None,
                "sample": _trim_signal_sample(signal_sample),
            }

        subway_arrival_response = responses.get("subway_arrivals")
        subway_position_response = responses.get("subway_positions")
        subway_summary: dict[str, Any] | None = None
        subway_arrival_profile = _subway_arrival_profile(None, line_name)
        if isinstance(subway_arrival_response, Exception):
            issues.append(f"지하철 도착 호출 실패: {type(subway_arrival_response).__name__}: {subway_arrival_response}")
        elif isinstance(subway_arrival_response, GatewayFetchResponse):
            arrivals = _subway_arrival_items(subway_arrival_response.payload)
            selected_arrival = _pick_subway_arrival(arrivals, line_name=line_name)
            subway_arrival_profile = _subway_arrival_profile(selected_arrival, line_name)

            positions_count = None
            position_sample = None
            if isinstance(subway_position_response, GatewayFetchResponse):
                positions = _subway_position_items(subway_position_response.payload)
                positions_count = len(positions)
                position_sample = positions[0] if positions else None
            elif isinstance(subway_position_response, Exception):
                issues.append(f"지하철 위치 호출 실패: {type(subway_position_response).__name__}: {subway_position_response}")

            payload_dict = subway_arrival_response.payload if isinstance(subway_arrival_response.payload, dict) else {}
            subway_summary = {
                "requestedUrl": subway_arrival_response.requested_url,
                "statusCode": subway_arrival_response.status_code,
                "message": _first_non_empty(payload_dict.get("message"), payload_dict.get("errorMessage")),
                "count": len(arrivals),
                "sample": selected_arrival,
                "positionsCount": positions_count,
                "positionSample": position_sample,
            }
            if not selected_arrival:
                issues.append("실시간 지하철 도착 데이터가 비어 있어 기본 ETA 4분을 사용합니다.")

        citydata_response = responses.get("citydata")
        citydata_summary: dict[str, Any] | None = None
        congestion_level = None
        citydata_note = None
        if isinstance(citydata_response, Exception):
            issues.append(f"서울 도시데이터 호출 실패: {type(citydata_response).__name__}: {citydata_response}")
        elif isinstance(citydata_response, GatewayFetchResponse):
            summary, congestion_level, citydata_note = _citydata_summary(citydata_response.payload)
            citydata_summary = {
                "requestedUrl": citydata_response.requested_url,
                "statusCode": citydata_response.status_code,
                "contentType": citydata_response.content_type,
                "summary": summary,
            }

        bus_summary: dict[str, Any] = {
            "status": "pending",
            "message": "서울 버스 API는 나중에 키를 연결하면 같은 구조에 바로 붙일 수 있습니다.",
        }
        bus_positions_response = responses.get("bus_positions")
        bus_route_info_response = responses.get("bus_route_info")
        bus_station_response = responses.get("bus_station")
        if isinstance(bus_positions_response, Exception):
            issues.append(f"서울 버스 위치 호출 실패: {type(bus_positions_response).__name__}: {bus_positions_response}")
        elif isinstance(bus_route_info_response, Exception):
            issues.append(f"서울 버스 노선 호출 실패: {type(bus_route_info_response).__name__}: {bus_route_info_response}")
        elif isinstance(bus_positions_response, GatewayFetchResponse) and isinstance(bus_route_info_response, GatewayFetchResponse):
            position_items = _bus_item_list(bus_positions_response.payload)
            route_items = _bus_item_list(bus_route_info_response.payload)
            station_items = _bus_item_list(bus_station_response.payload) if isinstance(bus_station_response, GatewayFetchResponse) else []
            if isinstance(bus_station_response, Exception):
                issues.append(f"서울 버스 정류소 호출 실패: {type(bus_station_response).__name__}: {bus_station_response}")

            sample_position = position_items[0] if position_items else None
            sample_route = route_items[0] if route_items else None
            sample_station = station_items[0] if station_items else None

            bus_summary = {
                "status": "active",
                "message": _first_non_empty(
                    _bus_message(bus_station_response.payload) if isinstance(bus_station_response, GatewayFetchResponse) else None,
                    _bus_message(bus_positions_response.payload),
                    _bus_message(bus_route_info_response.payload),
                    "서울 버스 응답을 확인했습니다.",
                ),
                "requestedUrl": bus_positions_response.requested_url,
                "positionCount": len(position_items),
                "positionSample": sample_position,
                "routeInfoSample": sample_route,
                "stationSample": sample_station,
            }
            if sample_position and sample_route:
                bus_note = f"버스: {sample_route.get('busRouteNm') or sample_route.get('busRouteId') or bus_route_id} 위치 {len(position_items)}대"
            else:
                bus_note = "버스: 실시간 위치 응답 확인"
        else:
            bus_note = "버스: 인증 승인 대기 상태로 placeholder만 유지합니다."

        congestion_level = congestion_level if congestion_level is not None else 0.42
        highlights = [
            f"신호등: {signal_profile['note']}",
            f"지하철: {subway_arrival_profile['message']}",
            f"도시데이터: {citydata_note or '혼잡도 기본값(보통)을 사용합니다.'}",
            bus_note,
        ]

        return {
            "issues": issues,
            "signalSummary": signal_summary,
            "signalProfile": signal_profile,
            "subwaySummary": subway_summary,
            "subwayArrivalProfile": subway_arrival_profile,
            "citydataSummary": citydata_summary,
            "congestionLevel": congestion_level,
            "citydataNote": citydata_note,
            "highlights": highlights,
            "busSummary": bus_summary,
        }

    def scenario_from_snapshot(
        self,
        *,
        snapshot: dict[str, Any],
        area_name: str,
        station_name: str,
        line_name: str,
    ) -> tuple[Scenario, dict[str, Any]]:
        signal_profile = snapshot["signalProfile"]
        subway_profile = snapshot["subwayArrivalProfile"]
        congestion_level = snapshot["congestionLevel"]

        transit_speed_kph = 36.0
        remaining_distance = int(round((subway_profile["eta_sec"] * transit_speed_kph) / 3.6))
        target_name = subway_profile["station_name"] or f"{station_name}역 진입"
        route_name = f"{line_name} {station_name}역 접근"
        if subway_profile["line_name"] and subway_profile["line_name"] != line_name:
            route_name = f"{line_name} {station_name}역 접근 ({subway_profile['line_name']})"

        scenario = Scenario(
            id="seoul-live-default",
            name=f"서울 {line_name} 생활권 통합 판단",
            city="서울",
            route_name=route_name,
            target_stop_name=target_name,
            primary_mode_label="지하철",
            walk_distance_m=780,
            signal_wait_sec=signal_profile["wait_sec"],
            crossing_distance_m=18,
            crossing_window_sec=signal_profile["crossing_window_sec"],
            bus_remaining_distance_m=remaining_distance,
            bus_speed_kph=transit_speed_kph,
            bus_reliability=subway_profile["reliability"],
            bus_freshness_sec=20,
            congestion_level=congestion_level,
            is_last_bus=False,
            is_night=False,
            alternative_label="다음 열차 또는 다른 출구",
            alternative_eta_sec=max(subway_profile["eta_sec"] + 180, 300),
            note="신호등 + 지하철 + 서울 도시데이터를 결합한 서울 통합 시나리오입니다. 버스는 차후 연동 예정입니다.",
        )

        debug = {
            "sourceType": "seoul-integrated",
            "areaName": area_name,
            "stationName": station_name,
            "lineName": line_name,
            "signal": snapshot["signalSummary"],
            "subway": snapshot["subwaySummary"],
            "citydata": snapshot["citydataSummary"],
            "bus": snapshot["busSummary"],
            "issues": snapshot["issues"],
            "highlights": snapshot["highlights"],
        }
        return scenario, debug

    async def build_scenario(
        self,
        *,
        area_name: str,
        station_name: str,
        line_name: str,
        bus_route_id: str | None,
        ars_id: str | None,
        stdg_cd: str,
        page_no: int,
        num_of_rows: int,
        citydata_data_type: str,
        subway_data_type: str,
        use_citydata_sample: bool,
        start_index: int,
        end_index: int,
    ) -> tuple[Scenario, dict[str, Any]]:
        snapshot = await self.collect_snapshot(
            area_name=area_name,
            station_name=station_name,
            line_name=line_name,
            bus_route_id=bus_route_id,
            ars_id=ars_id,
            stdg_cd=stdg_cd,
            page_no=page_no,
            num_of_rows=num_of_rows,
            citydata_data_type=citydata_data_type,
            subway_data_type=subway_data_type,
            use_citydata_sample=use_citydata_sample,
            start_index=start_index,
            end_index=end_index,
        )
        return self.scenario_from_snapshot(
            snapshot=snapshot,
            area_name=area_name,
            station_name=station_name,
            line_name=line_name,
        )
