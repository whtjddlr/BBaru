import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, LocateFixed, MapPin, Navigation } from "lucide-react";
import {
  DEFAULT_CENTER,
  isKoreaCoordinate,
  resolveDisplayPlacePoint,
  type ResolvedPlacePoint,
} from "../domain/places";
import { createApiUrl } from "../services/apiBase";

declare global {
  interface Window {
    naver?: any;
    __bbaruNaverMapReady?: () => void;
  }
}

interface RouteSegment {
  type: "walk" | "wait_signal" | "wait_boarding" | "ride" | "transfer";
  duration: number;
  distance?: number;
}

interface MapPoint {
  lat: number;
  lng: number;
  name: string;
}

interface RoutePathPoint {
  lat: number;
  lng: number;
}

type RoutePathSegment = RoutePathPoint[];

interface OdsaySearchPath {
  info?: {
    mapObj?: string;
  };
  subPath?: Array<Record<string, unknown>>;
}

interface OdsaySearchResponse {
  result?: {
    path?: OdsaySearchPath[];
  };
  routeGeometry?: {
    source?: string;
    points?: RoutePathPoint[];
  };
  code?: string;
  error?: unknown;
}

interface OdsayLaneResponse {
  result?: {
    lane?: Array<{
      section?: Array<{
        graphPos?: Array<{
          x?: number | string;
          y?: number | string;
        }>;
      }>;
    }>;
  };
  error?: unknown;
}

interface MapViewProps {
  origin?: MapPoint;
  destination?: MapPoint;
  currentPosition?: { lat: number; lng: number };
  route?: RouteSegment[];
  showRoute?: boolean;
}

type ResolvedMapPoint = ResolvedPlacePoint;

interface NaverMapCredential {
  parameter: "ncpKeyId" | "ncpClientId";
  value: string;
}

const NAVER_MAP_SCRIPT_ID = "naver-map-sdk";
const NAVER_MAP_CALLBACK = "__bbaruNaverMapReady";
let naverMapPromise: Promise<any> | null = null;
let naverGeocoderPromise: Promise<any> | null = null;

export function MapView({
  origin,
  destination,
  currentPosition,
  showRoute = false,
}: MapViewProps) {
  const credential = useMemo(() => getNaverMapCredential(), []);
  const submodules = getMapDisplaySubmodules(import.meta.env.VITE_NAVER_MAP_SUBMODULES);
  const resolvedOrigin = resolveDisplayPlacePoint(origin);
  const resolvedDestination = resolveDisplayPlacePoint(destination);
  const resolvedCurrentPosition = resolveCurrentPosition(
    currentPosition,
    resolvedOrigin,
    resolvedDestination
  );
  const routePath = useRoutePath(showRoute, resolvedOrigin, resolvedDestination);

  if (!credential) {
    return (
      <StaticMapFallback
        origin={resolvedOrigin}
        destination={resolvedDestination}
        currentPosition={resolvedCurrentPosition}
        showRoute={showRoute}
        message="네이버 지도 키 미설정"
      />
    );
  }

  return (
    <NaverMap
      credential={credential}
      submodules={submodules}
      origin={resolvedOrigin}
      destination={resolvedDestination}
      currentPosition={resolvedCurrentPosition}
      routePath={routePath}
      showRoute={showRoute}
    />
  );
}

function useRoutePath(
  showRoute: boolean,
  origin?: ResolvedMapPoint,
  destination?: ResolvedMapPoint
) {
  const [routePath, setRoutePath] = useState<RoutePathSegment[] | null | undefined>();

  useEffect(() => {
    if (!showRoute || !origin || !destination) {
      setRoutePath(undefined);
      return;
    }

    const controller = new AbortController();

    setRoutePath(undefined);

    fetchOdsayRoutePath(origin, destination, controller.signal)
      .then((path) => {
        if (controller.signal.aborted) {
          return;
        }

        setRoutePath(path ?? null);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRoutePath(null);
        }
      });

    return () => controller.abort();
  }, [
    destination?.lat,
    destination?.lng,
    origin?.lat,
    origin?.lng,
    showRoute,
  ]);

  return routePath;
}

function NaverMap({
  credential,
  submodules,
  origin,
  destination,
  currentPosition,
  routePath,
  showRoute,
}: {
  credential: NaverMapCredential;
  submodules?: string;
  origin?: ResolvedMapPoint;
  destination?: ResolvedMapPoint;
  currentPosition?: { lat: number; lng: number };
  routePath?: RoutePathSegment[] | null;
  showRoute?: boolean;
}) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [locatedPosition, setLocatedPosition] = useState<RoutePathPoint | undefined>();
  const [isMapReady, setIsMapReady] = useState(false);
  const [hasMapError, setHasMapError] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const displayCurrentPosition = currentPosition ?? locatedPosition;

  useEffect(() => {
    let isCancelled = false;

    loadNaverMapSdk(credential, submodules)
      .then((naver) => {
        if (isCancelled || !mapElementRef.current) {
          return;
        }

        mapElementRef.current.replaceChildren();
        setIsMapReady(false);
        setHasMapError(false);

        const center = getMapCenter(origin, destination);
        const map = new naver.maps.Map(mapElementRef.current, {
          center: new naver.maps.LatLng(center.lat, center.lng),
          zoom: 14,
          minZoom: 8,
          mapTypeControl: false,
          scaleControl: false,
          logoControl: true,
          zoomControl: false,
        });
        mapInstanceRef.current = map;

        const bounds = new naver.maps.LatLngBounds();

        if (origin) {
          const position = new naver.maps.LatLng(origin.lat, origin.lng);
          bounds.extend(position);
          new naver.maps.Marker({
            map,
            position,
            title: origin.name,
            icon: createMarkerIcon("#2563EB", "출"),
          });
        }

        if (destination) {
          const position = new naver.maps.LatLng(destination.lat, destination.lng);
          bounds.extend(position);
          new naver.maps.Marker({
            map,
            position,
            title: destination.name,
            icon: createMarkerIcon("#EF4444", "도"),
          });
        }

        if (showRoute && origin && destination) {
          const displayRouteSegments = getDisplayRouteSegments(origin, destination, routePath);

          for (const segment of displayRouteSegments) {
            for (const point of segment) {
              bounds.extend(new naver.maps.LatLng(point.lat, point.lng));
            }

            new naver.maps.Polyline({
              map,
              path: segment.map((point) => new naver.maps.LatLng(point.lat, point.lng)),
              strokeColor: "#2563EB",
              strokeOpacity: 0.9,
              strokeWeight: 6,
              strokeLineCap: "round",
              strokeLineJoin: "round",
            });
          }
        }

        if (displayCurrentPosition) {
          const position = new naver.maps.LatLng(
            displayCurrentPosition.lat,
            displayCurrentPosition.lng
          );
          bounds.extend(position);
          new naver.maps.Marker({
            map,
            position,
            title: "현재 위치",
            icon: createMarkerIcon("#10B981", "현"),
          });
        }

        if (origin && destination) {
          map.fitBounds(bounds);
        }

        setIsMapReady(true);
      })
      .catch(() => {
        if (!isCancelled) {
          setHasMapError(true);
        }
      });

    return () => {
      isCancelled = true;
      mapElementRef.current?.replaceChildren();
      mapInstanceRef.current = null;
    };
  }, [
    credential,
    destination,
    displayCurrentPosition?.lat,
    displayCurrentPosition?.lng,
    origin,
    routePath,
    showRoute,
    submodules,
  ]);

  const handleMoveToCurrentLocation = () => {
    setLocationError(null);

    if (displayCurrentPosition) {
      focusMapPosition(displayCurrentPosition);
      return;
    }

    if (!navigator.geolocation) {
      setLocationError("위치 사용 불가");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setIsLocating(false);

        if (!isKoreaCoordinate({ ...nextPosition, name: "현재 위치" })) {
          setLocationError("위치 범위 오류");
          return;
        }

        setLocatedPosition(nextPosition);
        focusMapPosition(nextPosition);
      },
      () => {
        setIsLocating(false);
        setLocationError("위치 확인 실패");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 10_000,
      }
    );
  };

  const focusMapPosition = (position: RoutePathPoint) => {
    if (!window.naver?.maps || !mapInstanceRef.current) {
      return;
    }

    const latLng = new window.naver.maps.LatLng(position.lat, position.lng);
    const currentZoom = mapInstanceRef.current.getZoom?.() ?? 14;

    mapInstanceRef.current.panTo(latLng);
    mapInstanceRef.current.setZoom(Math.max(currentZoom, 16));
  };

  if (hasMapError) {
    return (
      <StaticMapFallback
        origin={origin}
        destination={destination}
        currentPosition={currentPosition}
        showRoute={showRoute}
        message="네이버 지도 로딩 실패"
      />
    );
  }

  return (
    <div className="relative w-full h-full bg-[#E8EDF3] overflow-hidden">
      <div ref={mapElementRef} className="w-full h-full" />
      <button
        type="button"
        onClick={handleMoveToCurrentLocation}
        disabled={isLocating}
        aria-label="현재 위치로 이동"
        title="현재 위치로 이동"
        className="absolute right-4 top-[211px] z-20 w-11 h-11 rounded-full bg-white border border-neutral-200 shadow-lg text-blue-600 flex items-center justify-center hover:bg-blue-50 active:scale-95 disabled:opacity-70 transition"
      >
        {isLocating ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <LocateFixed className="w-5 h-5" />
        )}
      </button>
      {locationError && (
        <div className="absolute right-4 top-[266px] z-20 rounded-full bg-white px-3 py-1.5 text-[11px] text-red-600 shadow-md border border-red-100">
          {locationError}
        </div>
      )}
      {!isMapReady && (
        <div className="absolute inset-0 bg-[#E8EDF3] flex items-center justify-center">
          <div className="bg-white px-4 py-2 rounded-full border border-neutral-200 text-sm text-neutral-600 shadow-sm">
            네이버 지도 불러오는 중
          </div>
        </div>
      )}
    </div>
  );
}

async function fetchOdsayRoutePath(
  origin: RoutePathPoint,
  destination: RoutePathPoint,
  signal: AbortSignal
) {
  const browserPayload = await fetchOdsayRoutePathFromBrowser(origin, destination, signal);
  const browserSegments = await extractRealRouteSegments(browserPayload, signal);

  if (browserSegments?.length) {
    return connectRouteSegmentsToEndpoints(origin, destination, browserSegments);
  }

  const response = await fetch(createApiUrl("/api/mobility/odsay-route"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin,
      destination,
      searchPathType: "0",
    }),
    signal,
  });
  const payload = (await response.json()) as OdsaySearchResponse;

  if (!response.ok || payload.code || hasOdsayError(payload)) {
    throw new Error("ODsay route search failed");
  }

  const geometryPoints =
    payload.routeGeometry?.source !== "estimated-fallback"
      ? normalizeRoutePath(payload.routeGeometry?.points ?? [])
      : [];

  if (geometryPoints.length > 1) {
    return [geometryPoints];
  }

  const serverSegments = await extractRealRouteSegments(payload, signal);

  return serverSegments?.length
    ? connectRouteSegmentsToEndpoints(origin, destination, serverSegments)
    : undefined;
}

async function fetchOdsayRoutePathFromBrowser(
  origin: RoutePathPoint,
  destination: RoutePathPoint,
  signal: AbortSignal
): Promise<OdsaySearchResponse | undefined> {
  const apiKey = getOdsayWebKey();

  if (!apiKey) {
    return undefined;
  }

  try {
    const url = new URL("https://api.odsay.com/v1/api/searchPubTransPathT");
    url.searchParams.set("SX", String(origin.lng));
    url.searchParams.set("SY", String(origin.lat));
    url.searchParams.set("EX", String(destination.lng));
    url.searchParams.set("EY", String(destination.lat));
    url.searchParams.set("SearchPathType", "0");
    url.searchParams.set("apiKey", apiKey);

    const response = await fetch(url, { signal });
    const payload = (await response.json()) as OdsaySearchResponse;

    if (!response.ok || hasOdsayError(payload)) {
      return undefined;
    }

    return payload;
  } catch {
    return undefined;
  }
}

async function extractRealRouteSegments(
  payload: OdsaySearchResponse | undefined,
  signal: AbortSignal
) {
  if (!payload || hasOdsayError(payload)) {
    return undefined;
  }

  const firstPath = payload.result?.path?.[0];

  if (!firstPath) {
    return undefined;
  }

  const laneSegments = await fetchLaneRouteSegments(firstPath.info?.mapObj, signal);

  return laneSegments.length ? laneSegments : extractRouteSegments(payload);
}

async function fetchLaneRouteSegments(mapObj: string | undefined, signal: AbortSignal) {
  const apiKey = getOdsayWebKey();

  if (!apiKey || !mapObj) {
    return [];
  }

  try {
    const url = new URL("https://api.odsay.com/v1/api/loadLane");
    url.searchParams.set("mapObject", normalizeMapObject(mapObj));
    url.searchParams.set("apiKey", apiKey);

    const response = await fetch(url, { signal });
    const payload = (await response.json()) as OdsayLaneResponse;

    if (!response.ok || hasOdsayError(payload)) {
      return [];
    }

    return extractLaneRouteSegments(payload);
  } catch {
    return [];
  }
}

function getOdsayWebKey() {
  return (
    import.meta.env.VITE_ODSAY_API_KEY?.trim() ||
    import.meta.env.ODSAY_API_KEY?.trim() ||
    ""
  );
}

function normalizeMapObject(mapObj: string) {
  return mapObj.includes("@") ? mapObj : `0:0@${mapObj}`;
}

function hasOdsayError(payload: { error?: unknown }) {
  return Array.isArray(payload.error) ? payload.error.length > 0 : Boolean(payload.error);
}

function extractLaneRouteSegments(payload: OdsayLaneResponse) {
  const lanes = Array.isArray(payload.result?.lane) ? payload.result.lane : [];
  const segments: RoutePathSegment[] = [];

  for (const lane of lanes) {
    const sections = Array.isArray(lane.section) ? lane.section : [];

    for (const section of sections) {
      const graphPositions = Array.isArray(section.graphPos) ? section.graphPos : [];
      const points: RoutePathPoint[] = [];

      for (const position of graphPositions) {
        pushRoutePoint(points, {
          lat: toNumber(position.y),
          lng: toNumber(position.x),
        });
      }

      if (points.length > 1) {
        segments.push(points);
      }
    }
  }

  return segments;
}

function extractRouteSegments(payload: OdsaySearchResponse) {
  const subPathSegments = extractSubPathRouteSegments(payload);

  return subPathSegments.length > 0 ? subPathSegments : undefined;
}

function extractSubPathRouteSegments(payload: OdsaySearchResponse) {
  const firstPath = payload.result?.path?.[0];
  const subPaths = Array.isArray(firstPath?.subPath) ? firstPath.subPath : [];
  const segments: RoutePathSegment[] = [];

  for (const subPath of subPaths) {
    const points: RoutePathPoint[] = [];

    pushRoutePoint(points, {
      lat: toNumber(subPath.startY),
      lng: toNumber(subPath.startX),
    });

    const stations = Array.isArray((subPath.passStopList as any)?.stations)
      ? (subPath.passStopList as any).stations
      : [];

    for (const station of stations) {
      pushRoutePoint(points, {
        lat: toNumber(station?.y),
        lng: toNumber(station?.x),
      });
    }

    pushRoutePoint(points, {
      lat: toNumber(subPath.endY),
      lng: toNumber(subPath.endX),
    });

    if (points.length > 1) {
      segments.push(points);
    }
  }

  return segments;
}

function getDisplayRouteSegments(
  origin: RoutePathPoint,
  destination: RoutePathPoint,
  routePath?: RoutePathSegment[] | null
) {
  if (routePath === undefined) {
    return [];
  }

  const normalizedRouteSegments = normalizeRouteSegments(routePath ?? []);

  if (normalizedRouteSegments.length > 0) {
    return normalizedRouteSegments;
  }

  return [];
}

function connectRouteSegmentsToEndpoints(
  origin: RoutePathPoint,
  destination: RoutePathPoint,
  segments: RoutePathSegment[]
) {
  const connectedSegments = normalizeRouteSegments(segments);

  if (!connectedSegments.length) {
    return connectedSegments;
  }

  const firstSegment = connectedSegments[0];
  const firstPoint = firstSegment[0];

  if (firstPoint && getDistanceMeters(origin, firstPoint) > 25) {
    firstSegment.unshift(origin);
  }

  const lastSegment = connectedSegments[connectedSegments.length - 1];
  const lastPoint = lastSegment[lastSegment.length - 1];

  if (lastPoint && getDistanceMeters(lastPoint, destination) > 25) {
    lastSegment.push(destination);
  }

  return connectedSegments;
}

function buildEstimatedRoutePath(origin: RoutePathPoint, destination: RoutePathPoint) {
  const latDelta = destination.lat - origin.lat;
  const lngDelta = destination.lng - origin.lng;
  const bendScale = Math.max(Math.abs(latDelta), Math.abs(lngDelta), 0.004) * 0.18;
  const normalLat = -lngDelta >= 0 ? bendScale : -bendScale;
  const normalLng = latDelta >= 0 ? bendScale : -bendScale;

  return normalizeRoutePath([
    origin,
    {
      lat: origin.lat + latDelta * 0.22 + normalLat * 0.6,
      lng: origin.lng + lngDelta * 0.18 + normalLng * 0.6,
    },
    {
      lat: origin.lat + latDelta * 0.5 + normalLat,
      lng: origin.lng + lngDelta * 0.5 + normalLng,
    },
    {
      lat: origin.lat + latDelta * 0.78 + normalLat * 0.35,
      lng: origin.lng + lngDelta * 0.82 + normalLng * 0.35,
    },
    destination,
  ]);
}

function normalizeRoutePath(points: RoutePathPoint[]) {
  const normalized: RoutePathPoint[] = [];

  for (const point of points) {
    pushRoutePoint(normalized, point);
  }

  return normalized;
}

function normalizeRouteSegments(segments: RoutePathSegment[]) {
  return segments
    .map((segment) => normalizeRoutePath(segment))
    .filter((segment) => segment.length > 1);
}

function pushRoutePoint(points: RoutePathPoint[], point: RoutePathPoint) {
  if (!isRouteCoordinate(point)) {
    return;
  }

  const previous = points[points.length - 1];

  if (
    previous &&
    Math.abs(previous.lat - point.lat) <= 0.00001 &&
    Math.abs(previous.lng - point.lng) <= 0.00001
  ) {
    return;
  }

  points.push({
    lat: point.lat,
    lng: point.lng,
  });
}

function toNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}

function isRouteCoordinate(point: RoutePathPoint) {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= 33 &&
    point.lat <= 39 &&
    point.lng >= 124 &&
    point.lng <= 132
  );
}

function getDistanceMeters(a: RoutePathPoint, b: RoutePathPoint) {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h));
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function StaticMapFallback({
  origin,
  destination,
  currentPosition,
  showRoute = false,
  message = "네이버 지도 로딩 실패",
}: {
  origin?: ResolvedMapPoint;
  destination?: ResolvedMapPoint;
  currentPosition?: { lat: number; lng: number };
  showRoute?: boolean;
  message?: string;
}) {
  return (
    <div className="relative w-full h-full bg-[#E8EDF3] overflow-hidden">
      {/* Map Background Pattern */}
      <div className="absolute inset-0">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#D1D9E3" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Route Path */}
      {showRoute && origin && destination && (
        <>
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
            <defs>
              <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#2563EB" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#1E40AF" stopOpacity="1" />
              </linearGradient>
            </defs>
            <path
              d="M 180 200 Q 300 160 360 420"
              fill="none"
              stroke="url(#routeGradient)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M 180 200 Q 300 160 360 420"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="8 12"
              opacity="0.4"
            />
          </svg>

          {/* Segment Indicators */}
          <div className="absolute" style={{ left: "35%", top: "25%", zIndex: 2 }}>
            <div className="bg-white rounded-full p-2 shadow-lg border-2 border-blue-500">
              <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            </div>
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span className="text-xs bg-white px-2 py-0.5 rounded-full shadow-sm border border-neutral-200">
                신호 대기
              </span>
            </div>
          </div>

          <div className="absolute" style={{ left: "58%", top: "48%", zIndex: 2 }}>
            <div className="bg-white rounded-full p-2 shadow-lg border-2 border-blue-500">
              <div className="w-2 h-2 bg-blue-600 rounded-full" />
            </div>
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span className="text-xs bg-white px-2 py-0.5 rounded-full shadow-sm border border-neutral-200">
                대중교통 탑승
              </span>
            </div>
          </div>
        </>
      )}

      {/* Origin Marker */}
      {origin && (
        <div className="absolute" style={{ left: "22%", top: "18%", zIndex: 3 }}>
          <div className="relative">
            <div className="w-10 h-10 bg-[#2563EB] rounded-full flex items-center justify-center shadow-lg border-4 border-white">
              <MapPin className="w-5 h-5 text-white" fill="white" />
            </div>
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <div className="bg-white px-3 py-1.5 rounded-lg shadow-md border border-neutral-200">
                <span className="text-sm text-neutral-900">{origin.name}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Destination Marker */}
      {destination && (
        <div className="absolute" style={{ left: "72%", top: "52%", zIndex: 3 }}>
          <div className="relative">
            <div className="w-10 h-10 bg-[#EF4444] rounded-full flex items-center justify-center shadow-lg border-4 border-white">
              <MapPin className="w-5 h-5 text-white" fill="white" />
            </div>
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <div className="bg-white px-3 py-1.5 rounded-lg shadow-md border border-neutral-200">
                <span className="text-sm text-neutral-900">{destination.name}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Current Position Indicator */}
      {currentPosition && (
        <div className="absolute" style={{ left: "42%", top: "35%", zIndex: 4 }}>
          <div className="relative">
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center shadow-xl border-4 border-white animate-pulse">
              <Navigation className="w-6 h-6 text-white" fill="white" />
            </div>
            <div className="absolute inset-0 w-12 h-12 bg-blue-400 rounded-full animate-ping opacity-75" />
          </div>
        </div>
      )}

      <div className="absolute left-8 top-32 text-xs text-neutral-500">{message}</div>
      <div className="absolute right-12 bottom-32 text-xs text-neutral-500">fallback preview</div>
    </div>
  );
}

export function loadNaverMapSdk(
  credential: NaverMapCredential,
  submodules?: string
): Promise<any> {
  const resolvedSubmodules = normalizeSubmodules(submodules);

  if (window.naver?.maps) {
    return Promise.resolve(window.naver);
  }

  if (naverMapPromise) {
    return naverMapPromise;
  }

  naverMapPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(NAVER_MAP_SCRIPT_ID);
    const resolveWhenReady = () => {
      waitForNaverMapSdk().then(resolve).catch(reject);
    };

    if (existingScript) {
      if (window.naver?.maps) {
        resolve(window.naver);
        return;
      }

      existingScript.addEventListener("load", resolveWhenReady);
      existingScript.addEventListener("error", () => {
        naverMapPromise = null;
        reject(new Error("NAVER Maps SDK failed to load"));
      });
      waitForNaverMapSdk().then(resolve).catch(() => undefined);
      return;
    }

    const script = document.createElement("script");
    script.id = NAVER_MAP_SCRIPT_ID;
    const url = new URL("https://oapi.map.naver.com/openapi/v3/maps.js");
    url.searchParams.set(credential.parameter, credential.value);
    url.searchParams.set("callback", NAVER_MAP_CALLBACK);

    if (resolvedSubmodules) {
      url.searchParams.set("submodules", resolvedSubmodules);
    }

    script.src = url.toString();
    script.async = true;
    script.defer = true;
    window[NAVER_MAP_CALLBACK] = resolveWhenReady;
    script.onload = resolveWhenReady;
    script.onerror = () => {
      naverMapPromise = null;
      reject(new Error("NAVER Maps SDK failed to load"));
    };
    document.head.appendChild(script);
  });

  return naverMapPromise;
}

export function loadNaverGeocoderSdk(
  credential: NaverMapCredential,
  submodules?: string
): Promise<any> {
  const resolvedSubmodules = withRequiredSubmodules(submodules, ["geocoder"]);

  return loadNaverMapSdk(credential, resolvedSubmodules).then((naver) =>
    ensureNaverSubmodules(naver, resolvedSubmodules)
  );
}

export function getNaverMapCredential(): NaverMapCredential | undefined {
  const keyId = import.meta.env.VITE_NAVER_MAP_KEY_ID;
  const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;

  if (keyId) {
    return {
      parameter: "ncpKeyId",
      value: keyId,
    };
  }

  if (clientId) {
    return {
      parameter: "ncpClientId",
      value: clientId,
    };
  }

  return undefined;
}

function normalizeSubmodules(submodules: string | undefined) {
  const values = new Set(
    String(submodules || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );

  return [...values].join(",");
}

function withRequiredSubmodules(submodules: string | undefined, required: string[]) {
  const values = new Set(
    normalizeSubmodules(submodules)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );

  for (const value of required) {
    values.add(value);
  }

  return [...values].join(",");
}

function getMapDisplaySubmodules(submodules: string | undefined) {
  return normalizeSubmodules(submodules)
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value && value !== "geocoder")
    .join(",");
}

function hasRequiredNaverSubmodules(submodules: string) {
  const values = submodules.split(",").map((value) => value.trim());

  if (values.includes("geocoder")) {
    return typeof window.naver?.maps?.Service?.geocode === "function";
  }

  return true;
}

function ensureNaverSubmodules(naver: any, submodules: string) {
  const values = submodules.split(",").map((value) => value.trim());

  if (!values.includes("geocoder") || hasRequiredNaverSubmodules(submodules)) {
    return Promise.resolve(naver);
  }

  return loadNaverGeocoderSubmodule().then(() => naver);
}

function loadNaverGeocoderSubmodule() {
  if (hasRequiredNaverSubmodules("geocoder")) {
    return Promise.resolve(window.naver);
  }

  if (naverGeocoderPromise) {
    return naverGeocoderPromise;
  }

  naverGeocoderPromise = new Promise((resolve, reject) => {
    const scriptId = "naver-map-geocoder-sdk";
    const existingScript = document.getElementById(scriptId);

    if (existingScript) {
      if (hasRequiredNaverSubmodules("geocoder")) {
        resolve(window.naver);
        return;
      }

      existingScript.addEventListener("load", () => {
        waitForNaverGeocoder().then(resolve).catch(reject);
      });
      existingScript.addEventListener("error", () => {
        naverGeocoderPromise = null;
        reject(new Error("NAVER Maps geocoder module failed to load"));
      });
      waitForNaverGeocoder().then(resolve).catch(() => undefined);
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://oapi.map.naver.com/openapi/v3/maps-geocoder.js";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      waitForNaverGeocoder().then(resolve).catch(reject);
    };
    script.onerror = () => {
      naverGeocoderPromise = null;
      reject(new Error("NAVER Maps geocoder module failed to load"));
    };
    document.head.appendChild(script);
  });

  return naverGeocoderPromise;
}

function waitForNaverMapSdk() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 80;

    const check = () => {
      if (typeof window.naver?.maps?.Map === "function") {
        resolve(window.naver);
        return;
      }

      attempts += 1;

      if (attempts >= maxAttempts) {
        naverMapPromise = null;
        reject(new Error("NAVER Maps SDK did not initialize"));
        return;
      }

      window.setTimeout(check, 50);
    };

    check();
  });
}

function waitForNaverGeocoder() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 40;

    const check = () => {
      if (hasRequiredNaverSubmodules("geocoder")) {
        resolve(window.naver);
        return;
      }

      attempts += 1;

      if (attempts >= maxAttempts) {
        naverGeocoderPromise = null;
        reject(new Error("NAVER Maps geocoder module did not initialize"));
        return;
      }

      window.setTimeout(check, 50);
    };

    check();
  });
}

function resolveCurrentPosition(
  position: { lat: number; lng: number } | undefined,
  _origin?: ResolvedMapPoint,
  _destination?: ResolvedMapPoint
) {
  if (position && isKoreaCoordinate({ ...position, name: "현재 위치" })) {
    return position;
  }

  return undefined;
}

function getMapCenter(origin?: ResolvedMapPoint, destination?: ResolvedMapPoint) {
  if (origin && destination) {
    return {
      lat: (origin.lat + destination.lat) / 2,
      lng: (origin.lng + destination.lng) / 2,
    };
  }

  return origin || destination || DEFAULT_CENTER;
}

function createMarkerIcon(color: string, label: string) {
  return {
    content: `
      <div style="
        width: 34px;
        height: 34px;
        border-radius: 9999px;
        background: ${color};
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 4px solid white;
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.25);
        font-size: 12px;
        font-weight: 700;
      ">${label}</div>
    `,
    size: window.naver ? new window.naver.maps.Size(34, 34) : undefined,
    anchor: window.naver ? new window.naver.maps.Point(17, 17) : undefined,
  };
}
