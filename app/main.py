import asyncio
import mimetypes
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.models import (
    EvaluationRequest,
    GatewayFetchRequest,
    JourneySessionAdvanceRequest,
    JourneySessionCreateRequest,
    KakaoPlaceSearchRequest,
    LiveBundleRequest,
    SeoulBusRouteRequest,
    SeoulBusStationRequest,
    SeoulCitydataRequest,
    SeoulCombinedRequest,
    SeoulSubwayRequest,
    SignalDirectionsRequest,
    TransitRouteRequest,
)
from app.services.journey_store import JourneySessionService, JourneySessionStore
from app.services.providers import (
    GatewayClient,
    KakaoLocalClient,
    MockScenarioProvider,
    SampleDataProvider,
    SeoulBusClient,
    SeoulCitydataClient,
    SeoulScenarioBuilder,
    SeoulSubwayClient,
    SeoulSubwayTimetableProvider,
    TmapTransitClient,
    TmapDatasetProvider,
    TmapScenarioRouteSnapshotProvider,
    _bus_header,
    _bus_item_list,
    _bus_message,
    _payload_items,
    _pick_signal_sample,
    _extract_station_code,
    _subway_arrival_items,
    _subway_realtime_groups,
    build_default_seoul_scenario,
)
from app.services.scoring import evaluate_scenario


BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"
mimetypes.add_type("application/javascript", ".js")
settings = get_settings()
scenario_provider = MockScenarioProvider()
gateway_client = GatewayClient(settings)
sample_provider = SampleDataProvider(BASE_DIR.parent)
seoul_citydata_client = SeoulCitydataClient(settings)
seoul_subway_client = SeoulSubwayClient(settings)
seoul_subway_timetable_provider = SeoulSubwayTimetableProvider(settings, BASE_DIR.parent)
seoul_bus_client = SeoulBusClient(settings)
kakao_local_client = KakaoLocalClient(settings)
tmap_transit_client = TmapTransitClient(settings)
tmap_dataset_provider = TmapDatasetProvider(BASE_DIR.parent, settings)
tmap_scenario_route_provider = TmapScenarioRouteSnapshotProvider(BASE_DIR.parent, tmap_transit_client)
journey_session_store = JourneySessionStore(Path(settings.journey_db_path))
journey_session_service = JourneySessionService(
    settings=settings,
    scenario_provider=scenario_provider,
    snapshot_provider=tmap_scenario_route_provider,
    store=journey_session_store,
)
seoul_scenario_builder = SeoulScenarioBuilder(
    settings=settings,
    gateway_client=gateway_client,
    citydata_client=seoul_citydata_client,
    subway_client=seoul_subway_client,
    bus_client=seoul_bus_client,
)

app = FastAPI(title=settings.app_name)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
app.mount(
    "/assets",
    StaticFiles(directory=FRONTEND_DIR / "assets", check_dir=False),
    name="assets",
)


def _source_cards() -> list[dict[str, str]]:
    cards = [
        {
            "id": "signal",
            "label": "KLID 신호등",
            "status": "active" if settings.has_service_key else "pending",
            "detail": "보행 신호와 횡단 대기시간 계산",
        },
        {
            "id": "subway",
            "label": "서울 지하철",
            "status": "active" if settings.has_seoul_subway_key else "pending",
            "detail": "실시간 도착정보와 열차 접근 판단",
        },
        {
            "id": "citydata",
            "label": "서울 도시데이터",
            "status": "active" if settings.has_seoul_openapi_key else "sample",
            "detail": "혼잡도와 지역 컨텍스트 보강",
        },
        {
            "id": "bus",
            "label": "서울 버스",
            "status": "active" if settings.has_seoul_bus_key else "pending",
            "detail": "실시간 위치와 정류소 도착예정 연동",
        },
        {
            "id": "route-engine",
            "label": "TMAP route",
            "status": "active" if settings.has_tmap_transit_key else "pending",
            "detail": "Real walking + transit route distance",
        },
    ]
    return cards


@app.get("/")
async def index() -> FileResponse:
    if not (FRONTEND_DIR / "index.html").exists():
        raise HTTPException(
            status_code=503,
            detail="Frontend build not found. Run `npm install` and `npm run build` in the frontend folder.",
        )
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/api/config")
async def read_config() -> dict[str, object]:
    summary = "현재는 신호등과 지하철을 중심으로 안전한 이동 판단을 계산합니다."
    return {
        "appName": settings.app_name,
        "mode": settings.mode,
        "gatewayBaseUrl": settings.gateway_base_url,
        "hasServiceKey": settings.has_service_key,
        "hasSeoulOpenApiKey": settings.has_seoul_openapi_key,
        "hasSeoulSubwayKey": settings.has_seoul_subway_key,
        "hasSeoulBusKey": settings.has_seoul_bus_key,
        "hasKakaoMapJsKey": settings.has_kakao_map_js_key,
        "hasKakaoRestApiKey": settings.has_kakao_rest_api_key,
        "hasTmapTransitKey": settings.has_tmap_transit_key,
        "hasTmapMapKey": settings.has_tmap_map_key,
        "tmapQuotas": {
            "routesDaily": settings.tmap_transit_routes_daily_limit,
            "summaryDaily": settings.tmap_transit_summary_daily_limit,
            "statisticalDaily": settings.tmap_statistical_congestion_daily_limit,
        },
        "kakaoMapJsKey": settings.kakao_map_js_key if settings.has_kakao_map_js_key else "",
        "tmapMapAppKey": settings.effective_tmap_map_key if settings.has_tmap_map_key else "",
        "mapProvider": "tmap" if settings.has_tmap_map_key else "fallback",
        "defaultResponseType": settings.default_response_type,
        "routeInfoPath": settings.route_info_path,
        "routeStopsPath": settings.route_stops_path,
        "routePositionsPath": settings.route_positions_path,
        "signalDirectionsPath": settings.signal_directions_path,
        "defaultStdgCd": settings.default_stdg_cd,
        "defaultRouteId": settings.default_route_id,
        "defaultNumOfRows": settings.default_num_of_rows,
        "signalDefaultStdgCd": settings.signal_default_stdg_cd,
        "seoulCitydataSampleTemplate": settings.seoul_citydata_sample_template,
        "statusSummary": summary,
        "sources": _source_cards(),
        "defaults": {
            "areaName": settings.seoul_default_area_name,
            "stationName": settings.seoul_default_station_name,
            "lineName": settings.seoul_default_line_name,
        },
    }


@app.get("/api/scenarios")
async def list_scenarios() -> list[dict[str, object]]:
    deduped: dict[str, dict[str, object]] = {
        "seoul-live-default": build_default_seoul_scenario(settings).model_dump()
    }
    for scenario in scenario_provider.list_scenarios():
        deduped.setdefault(scenario.id, scenario.model_dump())
    return list(deduped.values())


@app.post("/api/evaluate")
async def evaluate(request: EvaluationRequest) -> dict[str, object]:
    try:
        if request.scenario_id == "seoul-live-default":
            station_name = request.station_name or settings.seoul_default_station_name
            line_name = request.line_name or settings.seoul_default_line_name
            scenario, live_debug = await seoul_scenario_builder.build_scenario(
                area_name=settings.seoul_default_area_name,
                station_name=station_name,
                line_name=line_name,
                bus_route_id=None,
                ars_id=None,
                stdg_cd=settings.signal_default_stdg_cd,
                page_no=1,
                num_of_rows=settings.default_num_of_rows,
                citydata_data_type="json",
                subway_data_type="json",
                use_citydata_sample=not settings.has_seoul_openapi_key,
                start_index=1,
                end_index=8,
            )
            source = "seoul-live"
        elif request.scenario_id == "live-default":
            scenario, live_debug = await gateway_client.build_live_scenario(
                stdg_cd=settings.default_stdg_cd,
                rte_id=settings.default_route_id or None,
                page_no=1,
                num_of_rows=settings.default_num_of_rows,
            )
            source = "live"
        elif request.scenario_id.startswith("ulsan-") and sample_provider.available():
            route_id = request.scenario_id.removeprefix("ulsan-")
            scenario = sample_provider.build_scenario(route_id=route_id)
            source = "sample"
            live_debug = {
                "routeId": route_id,
                "estimatedRemainingMeters": scenario.bus_remaining_distance_m,
                "estimatedSpeedKph": scenario.bus_speed_kph,
                "targetStopName": scenario.target_stop_name,
                "highlights": [
                    f"울산 샘플 노선 {route_id}",
                    f"목표 정류장 {scenario.target_stop_name}",
                    f"남은 거리 약 {scenario.bus_remaining_distance_m}m",
                ],
            }
        else:
            scenario = scenario_provider.get_scenario(request.scenario_id)
            source = "mock"
            live_debug = None
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    result = evaluate_scenario(
        scenario=scenario,
        profile=request.profile,
        walk_distance_m=request.walk_distance_m,
        signal_wait_sec=request.signal_wait_sec,
    )
    result.source = source
    result.route_debug = live_debug
    return result.model_dump()


@app.post("/api/live/fetch")
async def live_fetch(request: GatewayFetchRequest) -> dict[str, object]:
    try:
        result = await gateway_client.fetch(path=request.path, params=request.params)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gateway fetch failed: {exc}") from exc
    return result.model_dump()


@app.get("/api/live/blueprint")
async def live_blueprint() -> dict[str, object]:
    return {
        "gatewayBaseUrl": settings.gateway_base_url,
        "defaultStdgCd": settings.default_stdg_cd,
        "defaultRouteId": settings.default_route_id,
        "defaultNumOfRows": settings.default_num_of_rows,
        "signalDefaultStdgCd": settings.signal_default_stdg_cd,
        "seoulDefaults": {
            "areaName": settings.seoul_default_area_name,
            "stationName": settings.seoul_default_station_name,
            "lineName": settings.seoul_default_line_name,
        },
        "endpoints": [
            {"label": "노선 기본정보", "path": settings.route_info_path, "requiredParams": ["stdgCd"]},
            {"label": "정류장 경유지", "path": settings.route_stops_path, "requiredParams": ["stdgCd", "rteId"]},
            {"label": "실시간 위치", "path": settings.route_positions_path, "requiredParams": ["stdgCd", "rteId"]},
            {"label": "신호등 방향 정보", "path": settings.signal_directions_path, "requiredParams": ["stdgCd"]},
            {
                "label": "서울 도시데이터",
                "path": settings.seoul_citydata_live_template,
                "requiredParams": ["area_name"],
            },
            {
                "label": "서울 지하철 도착",
                "path": settings.seoul_subway_arrival_template,
                "requiredParams": ["station_name"],
            },
            {
                "label": "서울 지하철 보드",
                "path": "/api/live/seoul-subway-board",
                "requiredParams": ["station_name", "line_name"],
            },
            {
                "label": "서울 버스 위치",
                "path": settings.seoul_bus_position_template,
                "requiredParams": ["bus_route_id"],
            },
            {
                "label": "서울 버스 노선",
                "path": settings.seoul_bus_route_info_template,
                "requiredParams": ["bus_route_id"],
            },
            {
                "label": "서울 버스 도착예정 전체",
                "path": settings.seoul_bus_arrivals_template,
                "requiredParams": ["bus_route_id"],
            },
            {
                "label": "서울 버스 정류소 도착",
                "path": settings.seoul_bus_station_uid_template,
                "requiredParams": ["ars_id"],
            },
        ],
    }


@app.post("/api/live/bundle")
async def live_bundle(request: LiveBundleRequest) -> dict[str, object]:
    stdg_cd = request.stdg_cd or settings.default_stdg_cd
    rte_id = request.rte_id or settings.default_route_id or None
    try:
        result = await gateway_client.build_live_bundle(
            stdg_cd=stdg_cd,
            rte_id=rte_id,
            page_no=request.page_no,
            num_of_rows=request.num_of_rows,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Live bundle fetch failed: {exc}") from exc
    return result.model_dump()


@app.post("/api/live/signal-directions")
async def live_signal_directions(request: SignalDirectionsRequest) -> dict[str, object]:
    stdg_cd = request.stdg_cd or settings.signal_default_stdg_cd
    try:
        result = await gateway_client.fetch_signal_directions(
            stdg_cd=stdg_cd,
            page_no=request.page_no,
            num_of_rows=request.num_of_rows,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Signal directions fetch failed: {exc}") from exc

    items = _payload_items(result.payload) if isinstance(result.payload, dict) else []
    sample = _pick_signal_sample(items)
    return {
        "requested_url": result.requested_url,
        "status_code": result.status_code,
        "content_type": result.content_type,
        "count": len(items),
        "header": result.payload.get("header") if isinstance(result.payload, dict) else None,
        "sample": sample,
    }


@app.post("/api/live/seoul-citydata")
async def live_seoul_citydata(request: SeoulCitydataRequest) -> dict[str, object]:
    try:
        result = await seoul_citydata_client.fetch_citydata(
            area_name=request.area_name,
            data_type=request.data_type,
            use_sample=request.use_sample,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Seoul citydata fetch failed: {type(exc).__name__}: {exc}") from exc

    payload = result.payload
    top_level_keys: list[str] = []
    if isinstance(payload, dict):
        top_level_keys = list(payload.keys())[:20]

    return {
        "requested_url": result.requested_url,
        "status_code": result.status_code,
        "content_type": result.content_type,
        "top_level_keys": top_level_keys,
        "payload": payload,
    }


@app.post("/api/live/seoul-subway-arrivals")
async def live_seoul_subway_arrivals(request: SeoulSubwayRequest) -> dict[str, object]:
    try:
        arrivals = await seoul_subway_client.fetch_arrivals(
            station_name=request.station_name,
            data_type=request.data_type,
            start_index=request.start_index,
            end_index=request.end_index,
        )
        positions = await seoul_subway_client.fetch_positions(
            line_name=request.line_name,
            data_type=request.data_type,
            start_index=0,
            end_index=max(5, request.end_index),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Seoul subway fetch failed: {type(exc).__name__}: {exc}") from exc

    arrival_payload = arrivals.payload if isinstance(arrivals.payload, dict) else {}
    position_payload = positions.payload if isinstance(positions.payload, dict) else {}
    arrival_items = arrival_payload.get("realtimeArrivalList", [])
    position_items = position_payload.get("realtimePositionList", [])
    if isinstance(arrival_items, dict):
        arrival_items = [arrival_items]
    if isinstance(position_items, dict):
        position_items = [position_items]

    return {
        "requested_url": arrivals.requested_url,
        "status_code": arrivals.status_code,
        "count": len(arrival_items) if isinstance(arrival_items, list) else 0,
        "message": arrival_payload.get("message"),
        "sample": arrival_items[0] if isinstance(arrival_items, list) and arrival_items else None,
        "position_requested_url": positions.requested_url,
        "positions_count": len(position_items) if isinstance(position_items, list) else 0,
        "position_sample": position_items[0] if isinstance(position_items, list) and position_items else None,
    }


@app.post("/api/live/seoul-subway-board")
async def live_seoul_subway_board(request: SeoulSubwayRequest) -> dict[str, object]:
    try:
        arrivals = await seoul_subway_client.fetch_arrivals(
            station_name=request.station_name,
            data_type=request.data_type,
            start_index=request.start_index,
            end_index=max(8, request.end_index),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Seoul subway board fetch failed: {type(exc).__name__}: {exc}") from exc

    payload = arrivals.payload if isinstance(arrivals.payload, dict) else {}
    arrival_items = _subway_arrival_items(payload)
    realtime_groups = _subway_realtime_groups(arrival_items, request.line_name)
    station_code = _extract_station_code(arrival_items, request.line_name)

    timetable_source = "fallback_realtime"
    timetable_groups: list[dict[str, object]] = []
    issues: list[str] = []
    if station_code:
        try:
            timetable = await asyncio.to_thread(
                seoul_subway_timetable_provider.get_timetable_window,
                station_code=station_code,
                line_name=request.line_name,
                realtime_groups=realtime_groups,
            )
            timetable_source = timetable["source"]
            timetable_groups = timetable["groups"]
        except Exception as exc:
            issues.append(f"시간표 로딩 실패: {type(exc).__name__}: {exc}")
            timetable_groups = []
    else:
        issues.append("실시간 도착 데이터에서 역코드를 찾지 못해 시간표를 만들지 못했습니다.")

    if not timetable_groups:
        timetable_groups = []

    return {
        "requested_url": arrivals.requested_url,
        "status_code": arrivals.status_code,
        "stationName": request.station_name,
        "lineName": request.line_name,
        "stationCode": station_code,
        "fetchedAt": datetime.now().isoformat(timespec="seconds"),
        "realtimeGroups": realtime_groups,
        "timetableSource": timetable_source,
        "timetableGroups": timetable_groups,
        "issues": issues,
    }


@app.post("/api/live/seoul-bus-positions")
async def live_seoul_bus_positions(request: SeoulBusRouteRequest) -> dict[str, object]:
    try:
        positions = await seoul_bus_client.fetch_route_positions(bus_route_id=request.bus_route_id)
        route_info = await seoul_bus_client.fetch_route_info(bus_route_id=request.bus_route_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Seoul bus position fetch failed: {type(exc).__name__}: {exc}") from exc

    position_items = _bus_item_list(positions.payload)
    route_items = _bus_item_list(route_info.payload)

    return {
        "requested_url": positions.requested_url,
        "status_code": positions.status_code,
        "message": _bus_message(positions.payload) or _bus_message(route_info.payload),
        "header": _bus_header(positions.payload) or _bus_header(route_info.payload),
        "count": len(position_items) if isinstance(position_items, list) else 0,
        "sample": position_items[0] if isinstance(position_items, list) and position_items else None,
        "route_info_requested_url": route_info.requested_url,
        "route_info_sample": route_items[0] if isinstance(route_items, list) and route_items else None,
    }


@app.post("/api/live/seoul-bus-arrivals")
async def live_seoul_bus_arrivals(request: SeoulBusRouteRequest) -> dict[str, object]:
    try:
        arrivals = await seoul_bus_client.fetch_arrivals_by_route(bus_route_id=request.bus_route_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Seoul bus arrivals fetch failed: {type(exc).__name__}: {exc}") from exc

    arrival_items = _bus_item_list(arrivals.payload)
    return {
        "requested_url": arrivals.requested_url,
        "status_code": arrivals.status_code,
        "message": _bus_message(arrivals.payload),
        "header": _bus_header(arrivals.payload),
        "count": len(arrival_items),
        "sample": arrival_items[0] if arrival_items else None,
    }


@app.post("/api/live/seoul-bus-station")
async def live_seoul_bus_station(request: SeoulBusStationRequest) -> dict[str, object]:
    try:
        station = await seoul_bus_client.fetch_station_by_uid(ars_id=request.ars_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Seoul bus station fetch failed: {type(exc).__name__}: {exc}") from exc

    station_items = _bus_item_list(station.payload)

    return {
        "requested_url": station.requested_url,
        "status_code": station.status_code,
        "message": _bus_message(station.payload),
        "header": _bus_header(station.payload),
        "count": len(station_items) if isinstance(station_items, list) else 0,
        "sample": station_items[0] if isinstance(station_items, list) and station_items else None,
    }


@app.post("/api/kakao/places")
async def kakao_places(request: KakaoPlaceSearchRequest) -> dict[str, object]:
    try:
        result = await kakao_local_client.search_places(
            query=request.query,
            x=request.x,
            y=request.y,
            radius=request.radius,
            size=request.size,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Kakao place search failed: {type(exc).__name__}: {exc}") from exc

    return result


@app.post("/api/routes/transit")
async def transit_routes(request: TransitRouteRequest) -> dict[str, object]:
    try:
        result = await tmap_transit_client.fetch_routes(
            start_x=request.start_x,
            start_y=request.start_y,
            end_x=request.end_x,
            end_y=request.end_y,
            count=request.count,
            search_dttm=request.search_dttm,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Transit route fetch failed: {type(exc).__name__}: {exc}") from exc

    return result.model_dump()


@app.get("/api/routes/scenario-snapshots")
async def list_scenario_route_snapshots() -> dict[str, object]:
    return tmap_scenario_route_provider.list_snapshots()


@app.get("/api/routes/scenario/{scenario_id}")
async def get_scenario_route_snapshot(scenario_id: str) -> dict[str, object]:
    snapshot = tmap_scenario_route_provider.get_snapshot(scenario_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Scenario route snapshot not found or expired.")
    return snapshot.model_dump()


@app.post("/api/routes/scenario/{scenario_id}/refresh")
async def refresh_scenario_route_snapshot(scenario_id: str) -> dict[str, object]:
    try:
        snapshot = await tmap_scenario_route_provider.refresh_snapshot(scenario_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Scenario route refresh failed: {type(exc).__name__}: {exc}") from exc
    return snapshot.model_dump()


@app.post("/api/journey/sessions")
async def create_journey_session(request: JourneySessionCreateRequest) -> dict[str, object]:
    try:
        session = journey_session_service.create_session(request)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Journey session create failed: {type(exc).__name__}: {exc}") from exc
    return session.model_dump()


@app.get("/api/journey/sessions/{session_id}")
async def get_journey_session(session_id: str) -> dict[str, object]:
    session = journey_session_service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Journey session not found.")
    return session.model_dump()


@app.post("/api/journey/sessions/{session_id}/advance")
async def advance_journey_session(session_id: str, request: JourneySessionAdvanceRequest) -> dict[str, object]:
    session = journey_session_service.advance_session(session_id, request)
    if session is None:
        raise HTTPException(status_code=404, detail="Journey session not found.")
    return session.model_dump()


@app.get("/api/tmap/dataset")
async def tmap_dataset() -> dict[str, object]:
    return tmap_dataset_provider.list_dataset_files()


@app.post("/api/live/seoul-combined")
async def live_seoul_combined(request: SeoulCombinedRequest) -> dict[str, object]:
    snapshot = await seoul_scenario_builder.collect_snapshot(
        area_name=request.area_name,
        station_name=request.station_name,
        line_name=request.line_name,
        bus_route_id=request.bus_route_id,
        ars_id=request.ars_id,
        stdg_cd=request.stdg_cd,
        page_no=request.page_no,
        num_of_rows=request.num_of_rows,
        citydata_data_type=request.citydata_data_type,
        subway_data_type=request.subway_data_type,
        use_citydata_sample=request.use_citydata_sample,
        start_index=request.start_index,
        end_index=request.end_index,
    )
    scenario, _ = seoul_scenario_builder.scenario_from_snapshot(
        snapshot=snapshot,
        area_name=request.area_name,
        station_name=request.station_name,
        line_name=request.line_name,
    )
    return {
        "scenario_preview": scenario.model_dump(),
        "signal": snapshot["signalSummary"],
        "subway": snapshot["subwaySummary"],
        "citydata": snapshot["citydataSummary"],
        "bus": snapshot["busSummary"],
        "highlights": snapshot["highlights"],
        "issues": snapshot["issues"],
    }


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
