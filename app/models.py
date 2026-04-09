from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class PreferenceMode(str, Enum):
    safety_first = "safety_first"
    balanced = "balanced"
    time_first = "time_first"


class UserProfile(BaseModel):
    preference_mode: PreferenceMode = PreferenceMode.safety_first
    walk_speed_mps: float = Field(default=1.38, ge=0.6, le=2.2)
    safety_buffer_sec: int = Field(default=20, ge=0, le=180)


class Scenario(BaseModel):
    id: str
    name: str
    city: str
    route_name: str
    target_stop_name: str
    primary_mode_label: str = "버스"
    walk_distance_m: int
    signal_wait_sec: int
    crossing_distance_m: int
    crossing_window_sec: int
    bus_remaining_distance_m: int
    bus_speed_kph: float
    bus_reliability: float = Field(ge=0.0, le=1.0)
    bus_freshness_sec: int
    congestion_level: float = Field(ge=0.0, le=1.0)
    is_last_bus: bool = False
    is_night: bool = False
    alternative_label: str
    alternative_eta_sec: int
    note: str


class EvaluationRequest(BaseModel):
    scenario_id: str
    profile: UserProfile = Field(default_factory=UserProfile)
    walk_distance_m: int | None = Field(default=None, ge=50, le=3000)
    signal_wait_sec: int | None = Field(default=None, ge=0, le=300)
    station_name: str | None = Field(default=None, min_length=1)
    line_name: str | None = Field(default=None, min_length=1)


class SummaryLine(BaseModel):
    label: str
    value: str


class EvaluationResult(BaseModel):
    scenario: Scenario
    walk_eta_p50_sec: int
    walk_eta_p90_sec: int
    recommended_wait_sec: int = 0
    mode_adjusted_walk_eta_p50_sec: int
    mode_adjusted_walk_eta_p90_sec: int
    bus_eta_p50_sec: int
    bus_eta_p90_sec: int
    slack_sec: int
    catch_probability: float
    miss_probability: float
    crossing_risk: float
    context_risk: float
    risk_score: int
    risk_level: str
    crossing_risk_flag: bool
    explanation: str
    recommendations: list[str]
    summary: list[SummaryLine]
    source: str = "mock"
    route_debug: dict[str, Any] | None = None


class GatewayFetchRequest(BaseModel):
    path: str = Field(min_length=1)
    params: dict[str, Any] = Field(default_factory=dict)


class GatewayFetchResponse(BaseModel):
    requested_url: str
    status_code: int
    content_type: str
    payload: Any


class LiveBundleRequest(BaseModel):
    stdg_cd: str | None = None
    rte_id: str | None = None
    page_no: int = Field(default=1, ge=1)
    num_of_rows: int = Field(default=100, ge=1, le=1000)


class LiveEndpointInfo(BaseModel):
    label: str
    path: str
    required_params: list[str]


class LiveBundleResponse(BaseModel):
    stdg_cd: str
    rte_id: str | None = None
    endpoints: list[LiveEndpointInfo]
    route_info_status_code: int | None = None
    route_stops_status_code: int | None = None
    route_positions_status_code: int | None = None
    route_info_header: dict[str, Any] | None = None
    route_stops_header: dict[str, Any] | None = None
    route_positions_header: dict[str, Any] | None = None
    route_info_count: int | None = None
    route_stops_count: int | None = None
    route_positions_count: int | None = None
    route_info_sample: dict[str, Any] | None = None
    route_stops_sample: dict[str, Any] | None = None
    route_positions_sample: dict[str, Any] | None = None
    issues: list[str] = Field(default_factory=list)


class SignalDirectionsRequest(BaseModel):
    stdg_cd: str | None = None
    page_no: int = Field(default=1, ge=1)
    num_of_rows: int = Field(default=20, ge=1, le=1000)


class SeoulCitydataRequest(BaseModel):
    area_name: str = Field(default="광화문·덕수궁", min_length=1)
    data_type: str = Field(default="json")
    use_sample: bool = True


class SeoulSubwayRequest(BaseModel):
    station_name: str = Field(default="시청", min_length=1)
    line_name: str = Field(default="2호선", min_length=1)
    data_type: str = Field(default="json")
    start_index: int = Field(default=1, ge=0, le=1000)
    end_index: int = Field(default=8, ge=1, le=1000)


class JourneyStage(BaseModel):
    id: str
    title: str
    label: str
    remaining_sec: int = Field(ge=0)
    caption: str
    kind: str = Field(default="waypoint")
    distance_m: int | None = Field(default=None, ge=0)
    duration_sec: int | None = Field(default=None, ge=0)


class JourneyRouteOverview(BaseModel):
    summary: str
    total_distance_m: int | None = Field(default=None, ge=0)
    total_walk_distance_m: int | None = Field(default=None, ge=0)
    base_total_duration_sec: int | None = Field(default=None, ge=0)
    adjusted_total_duration_sec: int | None = Field(default=None, ge=0)
    total_walk_duration_sec: int | None = Field(default=None, ge=0)
    transit_duration_sec: int | None = Field(default=None, ge=0)
    boarding_wait_sec: int | None = Field(default=None, ge=0)
    transfer_count: int | None = Field(default=None, ge=0)
    total_fare: int | None = Field(default=None, ge=0)


class JourneySessionCreateRequest(BaseModel):
    scenario_id: str = Field(min_length=1)
    mode: PreferenceMode = PreferenceMode.balanced
    walk_speed_mps: float = Field(default=1.38, ge=0.6, le=2.2)
    safety_buffer_sec: int = Field(default=20, ge=0, le=180)
    walk_distance_m: int | None = Field(default=None, ge=50, le=3000)
    signal_wait_sec: int | None = Field(default=None, ge=0, le=300)
    origin_label: str | None = Field(default=None, max_length=120)
    destination_label: str | None = Field(default=None, max_length=120)
    station_name: str | None = Field(default=None, max_length=120)
    line_name: str | None = Field(default=None, max_length=120)
    route_candidate: TransitRouteCandidate | None = None


class JourneySessionAdvanceRequest(BaseModel):
    direction: str = Field(default="next")
    stage_index: int | None = Field(default=None, ge=0)


class JourneySessionResponse(BaseModel):
    id: str
    scenario_id: str
    mode: PreferenceMode
    origin_label: str
    destination_label: str
    current_stage_index: int = Field(ge=0)
    current_stage: JourneyStage
    stages: list[JourneyStage] = Field(default_factory=list)
    evaluation: EvaluationResult
    route_candidate: TransitRouteCandidate | None = None
    route_overview: JourneyRouteOverview | None = None
    walk_speed_mps: float = Field(ge=0.6, le=2.2)
    safety_buffer_sec: int = Field(ge=0)
    walk_distance_m: int = Field(ge=0)
    signal_wait_sec: int = Field(ge=0)
    created_at: str
    updated_at: str


class SeoulBusRouteRequest(BaseModel):
    bus_route_id: str = Field(min_length=1)


class SeoulBusStationRequest(BaseModel):
    ars_id: str = Field(min_length=1)


class KakaoPlaceSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=120)
    x: float | None = None
    y: float | None = None
    radius: int | None = Field(default=None, ge=1, le=20000)
    size: int = Field(default=6, ge=1, le=15)


class TransitRouteRequest(BaseModel):
    start_x: float
    start_y: float
    end_x: float
    end_y: float
    count: int = Field(default=3, ge=1, le=10)
    search_dttm: str | None = Field(default=None, pattern=r"^\d{12}$")


class TransitRouteLeg(BaseModel):
    mode: str
    label: str
    start_name: str | None = None
    end_name: str | None = None
    distance_m: int | None = None
    duration_sec: int | None = None
    path: list[list[float]] = Field(default_factory=list)


class TransitRouteCandidate(BaseModel):
    index: int
    total_distance_m: int | None = None
    total_walk_distance_m: int | None = None
    total_duration_sec: int | None = None
    total_walk_duration_sec: int | None = None
    total_transit_duration_sec: int | None = None
    initial_walk_distance_m: int | None = None
    initial_walk_duration_sec: int | None = None
    final_walk_distance_m: int | None = None
    final_walk_duration_sec: int | None = None
    transfer_walk_distance_m: int | None = None
    transfer_walk_duration_sec: int | None = None
    transfer_count: int | None = None
    total_fare: int | None = None
    summary: str
    legs: list[TransitRouteLeg] = Field(default_factory=list)


class TransitRouteResponse(BaseModel):
    source: str
    route_count: int
    candidates: list[TransitRouteCandidate] = Field(default_factory=list)
    requested: dict[str, Any] = Field(default_factory=dict)
    usage: dict[str, Any] = Field(default_factory=dict)
    issues: list[str] = Field(default_factory=list)


class SeoulCombinedRequest(BaseModel):
    area_name: str = Field(default="광화문·덕수궁", min_length=1)
    station_name: str = Field(default="시청", min_length=1)
    line_name: str = Field(default="2호선", min_length=1)
    bus_route_id: str | None = None
    ars_id: str | None = None
    stdg_cd: str = Field(default="1100000000")
    page_no: int = Field(default=1, ge=1)
    num_of_rows: int = Field(default=20, ge=1, le=1000)
    citydata_data_type: str = Field(default="json")
    subway_data_type: str = Field(default="json")
    use_citydata_sample: bool = True
    start_index: int = Field(default=1, ge=0, le=1000)
    end_index: int = Field(default=8, ge=1, le=1000)
