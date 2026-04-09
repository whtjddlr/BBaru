from __future__ import annotations

import json
import math
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from app.config import Settings
from app.models import (
    EvaluationResult,
    JourneyRouteOverview,
    JourneySessionAdvanceRequest,
    JourneySessionCreateRequest,
    JourneySessionResponse,
    JourneyStage,
    PreferenceMode,
    Scenario,
    TransitRouteCandidate,
    TransitRouteLeg,
    UserProfile,
)
from app.services.providers import MockScenarioProvider, TmapScenarioRouteSnapshotProvider, build_default_seoul_scenario
from app.services.scoring import evaluate_scenario


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _format_duration(total_seconds: int) -> str:
    minutes, seconds = divmod(max(0, int(round(total_seconds))), 60)
    if minutes and seconds:
        return f"{minutes}분 {seconds}초"
    if minutes:
        return f"{minutes}분"
    return f"{seconds}초"


def _is_transit_leg(mode: str | None) -> bool:
    return str(mode or "").lower() in {"bus", "subway", "train", "rail"}


def _haversine_meters(point_a: list[float], point_b: list[float]) -> float:
    lat1, lon1 = point_a
    lat2, lon2 = point_b
    radius = 6371000
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _path_distance_m(path: list[list[float]]) -> int:
    if len(path) < 2:
        return 0
    total = 0.0
    for current, nxt in zip(path, path[1:]):
        if len(current) != 2 or len(nxt) != 2:
            continue
        total += _haversine_meters(current, nxt)
    return int(round(total))


def _leg_distance_m(leg: TransitRouteLeg) -> int:
    if leg.distance_m is not None and leg.distance_m > 0:
        return int(leg.distance_m)
    return _path_distance_m(leg.path)


class JourneySessionStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_db()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _ensure_db(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS journey_sessions (
                    id TEXT PRIMARY KEY,
                    scenario_id TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    origin_label TEXT NOT NULL,
                    destination_label TEXT NOT NULL,
                    walk_speed_mps REAL NOT NULL,
                    safety_buffer_sec INTEGER NOT NULL,
                    walk_distance_m INTEGER NOT NULL,
                    signal_wait_sec INTEGER NOT NULL,
                    current_stage_index INTEGER NOT NULL,
                    stages_json TEXT NOT NULL,
                    evaluation_json TEXT NOT NULL,
                    route_candidate_json TEXT,
                    route_overview_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS journey_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )

    def save(self, session: JourneySessionResponse) -> JourneySessionResponse:
        payload = (
            session.id,
            session.scenario_id,
            session.mode.value,
            session.origin_label,
            session.destination_label,
            session.walk_speed_mps,
            session.safety_buffer_sec,
            session.walk_distance_m,
            session.signal_wait_sec,
            session.current_stage_index,
            json.dumps([stage.model_dump() for stage in session.stages], ensure_ascii=False),
            json.dumps(session.evaluation.model_dump(), ensure_ascii=False),
            json.dumps(session.route_candidate.model_dump(), ensure_ascii=False) if session.route_candidate else None,
            json.dumps(session.route_overview.model_dump(), ensure_ascii=False) if session.route_overview else None,
            session.created_at,
            session.updated_at,
        )
        with self._connect() as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO journey_sessions (
                    id, scenario_id, mode, origin_label, destination_label,
                    walk_speed_mps, safety_buffer_sec, walk_distance_m, signal_wait_sec,
                    current_stage_index, stages_json, evaluation_json,
                    route_candidate_json, route_overview_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                payload,
            )
        return session

    def append_event(self, session_id: str, event_type: str, payload: dict[str, Any]) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO journey_events (session_id, event_type, payload_json, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (session_id, event_type, json.dumps(payload, ensure_ascii=False), _now_iso()),
            )

    def get(self, session_id: str) -> JourneySessionResponse | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM journey_sessions WHERE id = ?",
                (session_id,),
            ).fetchone()
        if row is None:
            return None
        return self._hydrate(row)

    def update_stage_index(self, session_id: str, stage_index: int) -> JourneySessionResponse | None:
        session = self.get(session_id)
        if session is None:
            return None
        safe_index = max(0, min(stage_index, len(session.stages) - 1))
        updated = session.model_copy(
            update={
                "current_stage_index": safe_index,
                "current_stage": session.stages[safe_index],
                "updated_at": _now_iso(),
            }
        )
        self.save(updated)
        self.append_event(session_id, "stage_changed", {"stage_index": safe_index})
        return updated

    def _hydrate(self, row: sqlite3.Row) -> JourneySessionResponse:
        stages = [JourneyStage(**item) for item in json.loads(row["stages_json"])]
        evaluation = EvaluationResult(**json.loads(row["evaluation_json"]))
        route_candidate = None
        route_overview = None
        if row["route_candidate_json"]:
            route_candidate = TransitRouteCandidate(**json.loads(row["route_candidate_json"]))
        if row["route_overview_json"]:
            route_overview = JourneyRouteOverview(**json.loads(row["route_overview_json"]))
        current_stage_index = max(0, min(int(row["current_stage_index"]), len(stages) - 1))
        return JourneySessionResponse(
            id=row["id"],
            scenario_id=row["scenario_id"],
            mode=PreferenceMode(row["mode"]),
            origin_label=row["origin_label"],
            destination_label=row["destination_label"],
            current_stage_index=current_stage_index,
            current_stage=stages[current_stage_index],
            stages=stages,
            evaluation=evaluation,
            route_candidate=route_candidate,
            route_overview=route_overview,
            walk_speed_mps=float(row["walk_speed_mps"]),
            safety_buffer_sec=int(row["safety_buffer_sec"]),
            walk_distance_m=int(row["walk_distance_m"]),
            signal_wait_sec=int(row["signal_wait_sec"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


class JourneySessionService:
    def __init__(
        self,
        *,
        settings: Settings,
        scenario_provider: MockScenarioProvider,
        snapshot_provider: TmapScenarioRouteSnapshotProvider,
        store: JourneySessionStore,
    ) -> None:
        self.settings = settings
        self.scenario_provider = scenario_provider
        self.snapshot_provider = snapshot_provider
        self.store = store

    def create_session(self, request: JourneySessionCreateRequest) -> JourneySessionResponse:
        scenario = self._resolve_scenario(request.scenario_id)
        route_candidate = request.route_candidate or self._resolve_route_candidate(request.scenario_id)
        walk_distance_m = (
            request.walk_distance_m
            or (route_candidate.total_walk_distance_m if route_candidate and route_candidate.total_walk_distance_m else None)
            or scenario.walk_distance_m
        )
        signal_wait_sec = request.signal_wait_sec if request.signal_wait_sec is not None else scenario.signal_wait_sec
        profile = UserProfile(
            preference_mode=request.mode,
            walk_speed_mps=request.walk_speed_mps,
            safety_buffer_sec=request.safety_buffer_sec,
        )
        evaluation = evaluate_scenario(
            scenario=scenario,
            profile=profile,
            walk_distance_m=walk_distance_m,
            signal_wait_sec=signal_wait_sec,
        )
        route_overview, stages = self._build_route_story(
            scenario=scenario,
            route_candidate=route_candidate,
            evaluation=evaluation,
            walk_speed_mps=request.walk_speed_mps,
            signal_wait_sec=signal_wait_sec,
            origin_label=request.origin_label,
            destination_label=request.destination_label,
        )
        now = _now_iso()
        session = JourneySessionResponse(
            id=str(uuid.uuid4()),
            scenario_id=request.scenario_id,
            mode=request.mode,
            origin_label=request.origin_label or self._default_origin_label(route_candidate, scenario),
            destination_label=request.destination_label or self._default_destination_label(route_candidate, scenario),
            current_stage_index=0,
            current_stage=stages[0],
            stages=stages,
            evaluation=evaluation,
            route_candidate=route_candidate,
            route_overview=route_overview,
            walk_speed_mps=request.walk_speed_mps,
            safety_buffer_sec=request.safety_buffer_sec,
            walk_distance_m=int(walk_distance_m),
            signal_wait_sec=int(signal_wait_sec),
            created_at=now,
            updated_at=now,
        )
        self.store.save(session)
        self.store.append_event(
            session.id,
            "created",
            {
                "scenario_id": request.scenario_id,
                "mode": request.mode.value,
                "walk_distance_m": int(walk_distance_m),
                "signal_wait_sec": int(signal_wait_sec),
            },
        )
        return session

    def get_session(self, session_id: str) -> JourneySessionResponse | None:
        return self.store.get(session_id)

    def advance_session(self, session_id: str, request: JourneySessionAdvanceRequest) -> JourneySessionResponse | None:
        session = self.store.get(session_id)
        if session is None:
            return None
        if request.stage_index is not None:
            next_index = request.stage_index
        elif request.direction == "prev":
            next_index = session.current_stage_index - 1
        elif request.direction == "reset":
            next_index = 0
        else:
            next_index = session.current_stage_index + 1
        if next_index >= len(session.stages):
            next_index = 0
        return self.store.update_stage_index(session_id, next_index)

    def _resolve_scenario(self, scenario_id: str) -> Scenario:
        if scenario_id == "seoul-live-default":
            return build_default_seoul_scenario(self.settings)
        return self.scenario_provider.get_scenario(scenario_id)

    def _resolve_route_candidate(self, scenario_id: str) -> TransitRouteCandidate | None:
        snapshot = self.snapshot_provider.get_snapshot(scenario_id)
        if snapshot and snapshot.candidates:
            return snapshot.candidates[0]
        return None

    def _default_origin_label(self, route_candidate: TransitRouteCandidate | None, scenario: Scenario) -> str:
        if route_candidate and route_candidate.legs:
            return route_candidate.legs[0].start_name or scenario.name
        return scenario.name

    def _default_destination_label(self, route_candidate: TransitRouteCandidate | None, scenario: Scenario) -> str:
        if route_candidate and route_candidate.legs:
            return route_candidate.legs[-1].end_name or scenario.target_stop_name
        return scenario.target_stop_name

    def _build_route_story(
        self,
        *,
        scenario: Scenario,
        route_candidate: TransitRouteCandidate | None,
        evaluation: EvaluationResult,
        walk_speed_mps: float,
        signal_wait_sec: int,
        origin_label: str | None,
        destination_label: str | None,
    ) -> tuple[JourneyRouteOverview | None, list[JourneyStage]]:
        if route_candidate is None:
            total_walk_sec = evaluation.mode_adjusted_walk_eta_p50_sec
            stages = [
                JourneyStage(
                    id="start",
                    title="출발",
                    label=origin_label or scenario.name,
                    remaining_sec=total_walk_sec,
                    caption="기본 시나리오 기준으로 출발합니다.",
                    kind="start",
                ),
                JourneyStage(
                    id="arrive",
                    title="도착",
                    label=destination_label or scenario.target_stop_name,
                    remaining_sec=0,
                    caption="도보 ETA와 신호 대기를 모두 반영한 결과입니다.",
                    kind="finish",
                    duration_sec=total_walk_sec,
                    distance_m=scenario.walk_distance_m,
                ),
            ]
            route_overview = JourneyRouteOverview(
                summary=scenario.route_name,
                total_distance_m=scenario.walk_distance_m,
                total_walk_distance_m=scenario.walk_distance_m,
                base_total_duration_sec=evaluation.walk_eta_p50_sec,
                adjusted_total_duration_sec=evaluation.mode_adjusted_walk_eta_p50_sec,
                total_walk_duration_sec=evaluation.mode_adjusted_walk_eta_p50_sec,
                transit_duration_sec=0,
                boarding_wait_sec=evaluation.recommended_wait_sec,
                transfer_count=0,
                total_fare=0,
            )
            return route_overview, stages

        segments: list[dict[str, Any]] = []
        transit_started = False
        for index, leg in enumerate(route_candidate.legs):
            kind = "transit" if _is_transit_leg(leg.mode) else "walk"
            distance_m = _leg_distance_m(leg)
            duration_sec = int(leg.duration_sec or 0)
            if kind == "walk":
                duration_sec = int(round(distance_m / walk_speed_mps)) if distance_m > 0 else duration_sec
                if not transit_started:
                    duration_sec += signal_wait_sec + evaluation.recommended_wait_sec
            else:
                transit_started = True
            segments.append(
                {
                    "index": index,
                    "kind": kind,
                    "mode": leg.mode,
                    "label": leg.label,
                    "start_name": leg.start_name,
                    "end_name": leg.end_name,
                    "distance_m": distance_m,
                    "duration_sec": max(0, duration_sec),
                }
            )

        adjusted_total_duration_sec = sum(segment["duration_sec"] for segment in segments)
        total_walk_duration_sec = sum(segment["duration_sec"] for segment in segments if segment["kind"] == "walk")
        transit_duration_sec = sum(segment["duration_sec"] for segment in segments if segment["kind"] == "transit")
        boarding_wait_sec = signal_wait_sec + evaluation.recommended_wait_sec

        stages = [
            JourneyStage(
                id="start",
                title="출발",
                label=origin_label or self._default_origin_label(route_candidate, scenario),
                remaining_sec=adjusted_total_duration_sec,
                caption="저장된 경로와 현재 보행 조건으로 여정을 시작합니다.",
                kind="start",
            )
        ]

        elapsed_sec = 0
        for index, segment in enumerate(segments):
            elapsed_sec += segment["duration_sec"]
            remaining_sec = max(0, adjusted_total_duration_sec - elapsed_sec)
            has_future_transit = any(item["kind"] == "transit" for item in segments[index + 1 :])
            title = "이동"
            caption = "현재 구간을 통과한 뒤 다음 판단 지점으로 넘어갑니다."
            if segment["kind"] == "walk":
                if not any(item["kind"] == "transit" for item in segments[: index + 1]):
                    title = "재계산"
                    caption = (
                        f"초기 보행 {segment['distance_m']}m와 신호 대기, 권장 대기 {_format_duration(boarding_wait_sec)}를 반영합니다."
                    )
                elif has_future_transit:
                    title = "환승"
                    caption = "환승 보행 구간을 마친 뒤 다음 탑승으로 이어집니다."
                else:
                    title = "도착"
                    caption = "마지막 도보 구간을 마치면 여정이 종료됩니다."
            elif has_future_transit:
                title = f"{segment['label']} 하차"
                caption = "다음 구간으로 갈아타기 전 중간 하차 지점입니다."
            else:
                title = f"{segment['label']} 하차"
                caption = "주요 탑승 구간을 마치고 마지막 접근 구간으로 들어갑니다."

            stages.append(
                JourneyStage(
                    id=f"segment-{index + 1}",
                    title=title,
                    label=segment["end_name"] or destination_label or scenario.target_stop_name,
                    remaining_sec=remaining_sec,
                    caption=caption,
                    kind=segment["kind"],
                    distance_m=segment["distance_m"] or None,
                    duration_sec=segment["duration_sec"],
                )
            )

        if stages[-1].remaining_sec != 0:
            stages.append(
                JourneyStage(
                    id="finish",
                    title="도착",
                    label=destination_label or self._default_destination_label(route_candidate, scenario),
                    remaining_sec=0,
                    caption="전체 ETA 계산이 끝났습니다.",
                    kind="finish",
                )
            )

        route_overview = JourneyRouteOverview(
            summary=route_candidate.summary,
            total_distance_m=route_candidate.total_distance_m,
            total_walk_distance_m=route_candidate.total_walk_distance_m,
            base_total_duration_sec=route_candidate.total_duration_sec,
            adjusted_total_duration_sec=adjusted_total_duration_sec,
            total_walk_duration_sec=total_walk_duration_sec,
            transit_duration_sec=transit_duration_sec,
            boarding_wait_sec=boarding_wait_sec,
            transfer_count=route_candidate.transfer_count,
            total_fare=route_candidate.total_fare,
        )
        return route_overview, stages
