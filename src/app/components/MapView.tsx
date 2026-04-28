import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Navigation } from "lucide-react";

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

interface MapViewProps {
  origin?: MapPoint;
  destination?: MapPoint;
  currentPosition?: { lat: number; lng: number };
  route?: RouteSegment[];
  showRoute?: boolean;
}

interface ResolvedMapPoint extends MapPoint {
  isApproximate?: boolean;
}

interface NaverMapCredential {
  parameter: "ncpKeyId" | "ncpClientId";
  value: string;
}

const NAVER_MAP_SCRIPT_ID = "naver-map-sdk";
const NAVER_MAP_CALLBACK = "__bbaruNaverMapReady";
const DEFAULT_CENTER = { lat: 37.4979, lng: 127.0276 };
const KNOWN_PLACE_COORDINATES: Array<{ keyword: string; lat: number; lng: number }> = [
  { keyword: "강남역", lat: 37.4979, lng: 127.0276 },
  { keyword: "선릉역", lat: 37.5045, lng: 127.0489 },
  { keyword: "홍대입구역", lat: 37.5572, lng: 126.9254 },
  { keyword: "합정역", lat: 37.5495, lng: 126.9139 },
  { keyword: "서울역", lat: 37.5547, lng: 126.9706 },
  { keyword: "광화문", lat: 37.5716, lng: 126.9769 },
];

let naverMapPromise: Promise<any> | null = null;

export function MapView({
  origin,
  destination,
  currentPosition,
  showRoute = false,
}: MapViewProps) {
  const credential = useMemo(() => getNaverMapCredential(), []);
  const submodules = import.meta.env.VITE_NAVER_MAP_SUBMODULES;
  const resolvedOrigin = resolveMapPoint(origin);
  const resolvedDestination = resolveMapPoint(destination);
  const resolvedCurrentPosition = resolveCurrentPosition(
    currentPosition,
    resolvedOrigin,
    resolvedDestination
  );

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
      showRoute={showRoute}
    />
  );
}

function NaverMap({
  credential,
  submodules,
  origin,
  destination,
  currentPosition,
  showRoute,
}: {
  credential: NaverMapCredential;
  submodules?: string;
  origin?: ResolvedMapPoint;
  destination?: ResolvedMapPoint;
  currentPosition?: { lat: number; lng: number };
  showRoute?: boolean;
}) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [hasMapError, setHasMapError] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    loadNaverMapSdk(credential, submodules)
      .then((naver) => {
        if (isCancelled || !mapElementRef.current) {
          return;
        }

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
          new naver.maps.Polyline({
            map,
            path: [
              new naver.maps.LatLng(origin.lat, origin.lng),
              new naver.maps.LatLng(destination.lat, destination.lng),
            ],
            strokeColor: "#2563EB",
            strokeOpacity: 0.9,
            strokeWeight: 6,
            strokeLineCap: "round",
            strokeLineJoin: "round",
          });
        }

        if (currentPosition) {
          const position = new naver.maps.LatLng(currentPosition.lat, currentPosition.lng);
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
    };
  }, [credential, currentPosition, destination, origin, showRoute, submodules]);

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

function loadNaverMapSdk(
  credential: NaverMapCredential,
  submodules?: string
): Promise<any> {
  if (window.naver?.maps) {
    return Promise.resolve(window.naver);
  }

  if (naverMapPromise) {
    return naverMapPromise;
  }

  naverMapPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(NAVER_MAP_SCRIPT_ID);

    if (existingScript) {
      if (window.naver?.maps) {
        resolve(window.naver);
        return;
      }

      existingScript.addEventListener("load", () => resolve(window.naver));
      existingScript.addEventListener("error", () => {
        naverMapPromise = null;
        reject(new Error("NAVER Maps SDK failed to load"));
      });
      return;
    }

    const script = document.createElement("script");
    script.id = NAVER_MAP_SCRIPT_ID;
    const url = new URL("https://oapi.map.naver.com/openapi/v3/maps.js");
    url.searchParams.set(credential.parameter, credential.value);
    url.searchParams.set("callback", NAVER_MAP_CALLBACK);

    if (submodules) {
      url.searchParams.set("submodules", submodules);
    }

    script.src = url.toString();
    script.async = true;
    script.defer = true;
    window[NAVER_MAP_CALLBACK] = () => {
      if (window.naver?.maps) {
        resolve(window.naver);
        return;
      }

      reject(new Error("NAVER Maps SDK did not initialize"));
    };
    script.onerror = () => {
      naverMapPromise = null;
      reject(new Error("NAVER Maps SDK failed to load"));
    };
    document.head.appendChild(script);
  });

  return naverMapPromise;
}

function getNaverMapCredential(): NaverMapCredential | undefined {
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

function resolveMapPoint(point?: MapPoint): ResolvedMapPoint | undefined {
  if (!point) {
    return undefined;
  }

  if (isKoreaCoordinate(point)) {
    return point;
  }

  const knownPlace = KNOWN_PLACE_COORDINATES.find(({ keyword }) =>
    point.name.includes(keyword)
  );

  if (knownPlace) {
    return {
      ...point,
      lat: knownPlace.lat,
      lng: knownPlace.lng,
      isApproximate: true,
    };
  }

  return {
    ...point,
    ...DEFAULT_CENTER,
    isApproximate: true,
  };
}

function resolveCurrentPosition(
  position: { lat: number; lng: number } | undefined,
  origin?: ResolvedMapPoint,
  destination?: ResolvedMapPoint
) {
  if (position && isKoreaCoordinate({ ...position, name: "현재 위치" })) {
    return position;
  }

  if (origin && destination) {
    return {
      lat: origin.lat + (destination.lat - origin.lat) * 0.35,
      lng: origin.lng + (destination.lng - origin.lng) * 0.35,
    };
  }

  return position;
}

function isKoreaCoordinate(point: MapPoint): boolean {
  return point.lat >= 33 && point.lat <= 39 && point.lng >= 124 && point.lng <= 132;
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
