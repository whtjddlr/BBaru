from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, Field


ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")


class Settings(BaseModel):
    app_name: str = Field(default="BBARU")
    mode: str = Field(default="mock")
    journey_db_path: str = Field(default=str(ROOT_DIR / "data" / "safeeta.db"))
    gateway_base_url: str = Field(default="https://apis.data.go.kr")
    service_key: str = Field(default="")
    service_key_encoded: str = Field(default="")
    default_response_type: str = Field(default="json")
    route_info_path: str = Field(default="/B551982/rte/mst_info")
    route_stops_path: str = Field(default="/B551982/rte/ps_info")
    route_positions_path: str = Field(default="/B551982/rte/rtm_loc_info")
    signal_directions_path: str = Field(default="/B551982/rti/tl_drct_info")
    default_stdg_cd: str = Field(default="3100000000")
    default_route_id: str = Field(default="")
    default_num_of_rows: int = Field(default=100)
    signal_default_stdg_cd: str = Field(default="1100000000")
    seoul_openapi_key: str = Field(default="")
    seoul_subway_openapi_key: str = Field(default="")
    seoul_bus_openapi_key: str = Field(default="")
    kakao_map_js_key: str = Field(default="")
    kakao_rest_api_key: str = Field(default="")
    tmap_transit_app_key: str = Field(default="")
    tmap_map_app_key: str = Field(default="")
    tmap_transit_routes_url: str = Field(default="https://apis.openapi.sk.com/transit/routes")
    tmap_transit_routes_daily_limit: int = Field(default=10)
    tmap_transit_summary_daily_limit: int = Field(default=10)
    tmap_statistical_congestion_daily_limit: int = Field(default=2)
    seoul_default_area_name: str = Field(default="광화문·덕수궁")
    seoul_default_station_name: str = Field(default="시청")
    seoul_default_line_name: str = Field(default="2호선")
    seoul_citydata_sample_template: str = Field(default="http://openapi.seoul.go.kr:8088/sample/xml/citydata/1/5/{area_name}")
    seoul_citydata_live_template: str = Field(default="http://openapi.seoul.go.kr:8088/{api_key}/{data_type}/citydata/1/5/{area_name}")
    seoul_subway_arrival_template: str = Field(
        default="http://swopenapi.seoul.go.kr/api/subway/{api_key}/{data_type}/realtimeStationArrival/{start_index}/{end_index}/{station_name}"
    )
    seoul_subway_position_template: str = Field(
        default="http://swopenapi.seoul.go.kr/api/subway/{api_key}/{data_type}/realtimePosition/{start_index}/{end_index}/{line_name}"
    )
    seoul_subway_timetable_download_url: str = Field(
        default="https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?useCache=false"
    )
    seoul_subway_timetable_inf_id: str = Field(default="OA-22522")
    seoul_subway_timetable_seq: str = Field(default="1")
    seoul_subway_timetable_inf_seq: str = Field(default="2")
    seoul_bus_position_template: str = Field(
        default="http://ws.bus.go.kr/api/rest/buspos/getBusPosByRtid?serviceKey={api_key}&busRouteId={bus_route_id}"
    )
    seoul_bus_route_info_template: str = Field(
        default="http://ws.bus.go.kr/api/rest/busRouteInfo/getRouteInfo?serviceKey={api_key}&busRouteId={bus_route_id}"
    )
    seoul_bus_arrivals_template: str = Field(
        default="http://ws.bus.go.kr/api/rest/arrive/getArrInfoByRouteAll?serviceKey={api_key}&busRouteId={bus_route_id}"
    )
    seoul_bus_station_uid_template: str = Field(
        default="http://ws.bus.go.kr/api/rest/stationinfo/getStationByUid?serviceKey={api_key}&arsId={ars_id}"
    )

    @property
    def has_service_key(self) -> bool:
        return bool(self.service_key.strip() or self.service_key_encoded.strip())

    @property
    def has_seoul_openapi_key(self) -> bool:
        return bool(self.seoul_openapi_key.strip())

    @property
    def has_seoul_subway_key(self) -> bool:
        return bool(self.seoul_subway_openapi_key.strip())

    @property
    def has_seoul_bus_key(self) -> bool:
        return bool(self.seoul_bus_openapi_key.strip() or self.seoul_openapi_key.strip())

    @property
    def effective_seoul_bus_key(self) -> str:
        return self.seoul_bus_openapi_key.strip() or self.seoul_openapi_key.strip()

    @property
    def has_kakao_map_js_key(self) -> bool:
        return bool(self.kakao_map_js_key.strip())

    @property
    def has_kakao_rest_api_key(self) -> bool:
        return bool(self.kakao_rest_api_key.strip())

    @property
    def has_tmap_transit_key(self) -> bool:
        return bool(self.tmap_transit_app_key.strip())

    @property
    def effective_tmap_map_key(self) -> str:
        return self.tmap_map_app_key.strip() or self.tmap_transit_app_key.strip()

    @property
    def has_tmap_map_key(self) -> bool:
        return bool(self.effective_tmap_map_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    import os

    default_db_path = "/tmp/safeeta.db" if os.getenv("VERCEL") else str(ROOT_DIR / "data" / "safeeta.db")

    return Settings(
        app_name=os.getenv("SAFEETA_APP_NAME", "BBARU"),
        mode=os.getenv("SAFEETA_MODE", "mock"),
        journey_db_path=os.getenv("SAFEETA_JOURNEY_DB_PATH", default_db_path),
        gateway_base_url=os.getenv("SAFEETA_GATEWAY_BASE_URL", "https://apis.data.go.kr").rstrip("/"),
        service_key=os.getenv("SAFEETA_SERVICE_KEY", ""),
        service_key_encoded=os.getenv("SAFEETA_SERVICE_KEY_ENCODED", ""),
        default_response_type=os.getenv("SAFEETA_DEFAULT_RESPONSE_TYPE", "json"),
        route_info_path=os.getenv("SAFEETA_ROUTE_INFO_PATH", "/B551982/rte/mst_info"),
        route_stops_path=os.getenv("SAFEETA_ROUTE_STOPS_PATH", "/B551982/rte/ps_info"),
        route_positions_path=os.getenv("SAFEETA_ROUTE_POSITIONS_PATH", "/B551982/rte/rtm_loc_info"),
        signal_directions_path=os.getenv("SAFEETA_SIGNAL_DIRECTIONS_PATH", "/B551982/rti/tl_drct_info"),
        default_stdg_cd=os.getenv("SAFEETA_DEFAULT_STDG_CD", "3100000000"),
        default_route_id=os.getenv("SAFEETA_DEFAULT_ROUTE_ID", ""),
        default_num_of_rows=int(os.getenv("SAFEETA_DEFAULT_NUM_OF_ROWS", "100")),
        signal_default_stdg_cd=os.getenv("SAFEETA_SIGNAL_DEFAULT_STDG_CD", "1100000000"),
        seoul_openapi_key=os.getenv("SAFEETA_SEOUL_OPENAPI_KEY", ""),
        seoul_subway_openapi_key=os.getenv("SAFEETA_SEOUL_SUBWAY_OPENAPI_KEY", ""),
        seoul_bus_openapi_key=os.getenv("SAFEETA_SEOUL_BUS_OPENAPI_KEY", ""),
        kakao_map_js_key=os.getenv("SAFEETA_KAKAO_MAP_JS_KEY", ""),
        kakao_rest_api_key=os.getenv("SAFEETA_KAKAO_REST_API_KEY", ""),
        tmap_transit_app_key=os.getenv("SAFEETA_TMAP_TRANSIT_APP_KEY", ""),
        tmap_map_app_key=os.getenv("SAFEETA_TMAP_MAP_APP_KEY", ""),
        tmap_transit_routes_url=os.getenv(
            "SAFEETA_TMAP_TRANSIT_ROUTES_URL",
            "https://apis.openapi.sk.com/transit/routes",
        ),
        tmap_transit_routes_daily_limit=int(
            os.getenv(
                "SAFEETA_TMAP_TRANSIT_ROUTES_DAILY_LIMIT",
                os.getenv("SAFEETA_TMAP_TRANSIT_DAILY_LIMIT", os.getenv("SAFEETA_TMAP_TRANSIT_MONTHLY_LIMIT", "10")),
            )
        ),
        tmap_transit_summary_daily_limit=int(
            os.getenv("SAFEETA_TMAP_TRANSIT_SUMMARY_DAILY_LIMIT", "10")
        ),
        tmap_statistical_congestion_daily_limit=int(
            os.getenv("SAFEETA_TMAP_STATISTICAL_CONGESTION_DAILY_LIMIT", "2")
        ),
        seoul_default_area_name=os.getenv("SAFEETA_SEOUL_DEFAULT_AREA_NAME", "광화문·덕수궁"),
        seoul_default_station_name=os.getenv("SAFEETA_SEOUL_DEFAULT_STATION_NAME", "시청"),
        seoul_default_line_name=os.getenv("SAFEETA_SEOUL_DEFAULT_LINE_NAME", "2호선"),
        seoul_citydata_sample_template=os.getenv(
            "SAFEETA_SEOUL_CITYDATA_SAMPLE_TEMPLATE",
            "http://openapi.seoul.go.kr:8088/sample/xml/citydata/1/5/{area_name}",
        ),
        seoul_citydata_live_template=os.getenv(
            "SAFEETA_SEOUL_CITYDATA_LIVE_TEMPLATE",
            "http://openapi.seoul.go.kr:8088/{api_key}/{data_type}/citydata/1/5/{area_name}",
        ),
        seoul_subway_arrival_template=os.getenv(
            "SAFEETA_SEOUL_SUBWAY_ARRIVAL_TEMPLATE",
            "http://swopenapi.seoul.go.kr/api/subway/{api_key}/{data_type}/realtimeStationArrival/{start_index}/{end_index}/{station_name}",
        ),
        seoul_subway_position_template=os.getenv(
            "SAFEETA_SEOUL_SUBWAY_POSITION_TEMPLATE",
            "http://swopenapi.seoul.go.kr/api/subway/{api_key}/{data_type}/realtimePosition/{start_index}/{end_index}/{line_name}",
        ),
        seoul_subway_timetable_download_url=os.getenv(
            "SAFEETA_SEOUL_SUBWAY_TIMETABLE_DOWNLOAD_URL",
            "https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?useCache=false",
        ),
        seoul_subway_timetable_inf_id=os.getenv("SAFEETA_SEOUL_SUBWAY_TIMETABLE_INF_ID", "OA-22522"),
        seoul_subway_timetable_seq=os.getenv("SAFEETA_SEOUL_SUBWAY_TIMETABLE_SEQ", "1"),
        seoul_subway_timetable_inf_seq=os.getenv("SAFEETA_SEOUL_SUBWAY_TIMETABLE_INF_SEQ", "2"),
        seoul_bus_position_template=os.getenv(
            "SAFEETA_SEOUL_BUS_POSITION_TEMPLATE",
            "http://ws.bus.go.kr/api/rest/buspos/getBusPosByRtid?serviceKey={api_key}&busRouteId={bus_route_id}",
        ),
        seoul_bus_route_info_template=os.getenv(
            "SAFEETA_SEOUL_BUS_ROUTE_INFO_TEMPLATE",
            "http://ws.bus.go.kr/api/rest/busRouteInfo/getRouteInfo?serviceKey={api_key}&busRouteId={bus_route_id}",
        ),
        seoul_bus_arrivals_template=os.getenv(
            "SAFEETA_SEOUL_BUS_ARRIVALS_TEMPLATE",
            "http://ws.bus.go.kr/api/rest/arrive/getArrInfoByRouteAll?serviceKey={api_key}&busRouteId={bus_route_id}",
        ),
        seoul_bus_station_uid_template=os.getenv(
            "SAFEETA_SEOUL_BUS_STATION_UID_TEMPLATE",
            "http://ws.bus.go.kr/api/rest/stationinfo/getStationByUid?serviceKey={api_key}&arsId={ars_id}",
        ),
    )
