import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Navigation } from "lucide-react";
import type { GeoPoint, RouteSegment } from "../lib/eta";
import { loadTmapSdk } from "../lib/tmap";

interface MapPoint extends GeoPoint {
  name: string;
}

interface MapViewProps {
  origin?: MapPoint;
  destination?: MapPoint;
  currentPosition?: GeoPoint;
  route?: RouteSegment[];
  showRoute?: boolean;
}

export function MapView(props: MapViewProps) {
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkFailed, setSdkFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadTmapSdk()
      .then(() => {
        if (!cancelled) {
          setSdkReady(true);
          setSdkFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSdkReady(false);
          setSdkFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!sdkReady || sdkFailed || !props.origin || !props.destination) {
    return <MockMapView {...props} />;
  }

  return <TmapMapView {...props} origin={props.origin} destination={props.destination} />;
}

function TmapMapView({
  origin,
  destination,
  currentPosition,
  route,
  showRoute = false,
}: MapViewProps & { origin: MapPoint; destination: MapPoint }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const currentMarkerRef = useRef<any>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const routeKey = useMemo(() => createRouteKey(route, showRoute), [route, showRoute]);

  useEffect(() => {
    const container = containerRef.current;
    const Tmapv3 = window.Tmapv3;

    if (!container || !Tmapv3) {
      return undefined;
    }

    container.innerHTML = "";
    currentMarkerRef.current = null;
    setMapFailed(false);

    try {
      const map = new Tmapv3.Map(container, {
        center: new Tmapv3.LatLng(origin.lat, origin.lng),
        width: "100%",
        height: "100%",
        zoom: 15,
      });
      mapRef.current = map;

      new Tmapv3.Marker({
        position: new Tmapv3.LatLng(origin.lat, origin.lng),
        map,
        title: origin.name,
      });
      new Tmapv3.Marker({
        position: new Tmapv3.LatLng(destination.lat, destination.lng),
        map,
        title: destination.name,
      });

      if (showRoute) {
        route?.forEach((segment) => {
          const path = (segment.geometry ?? []).map((point) => new Tmapv3.LatLng(point.lat, point.lng));

          if (path.length < 2) {
            return;
          }

          new Tmapv3.Polyline({
            path,
            strokeColor: getPolylineColor(segment),
            strokeWeight: segment.type === "walk" || segment.type === "final_walk" ? 4 : 6,
            strokeOpacity: segment.type === "walk" || segment.type === "final_walk" ? 0.7 : 0.95,
            strokeStyle: segment.type === "walk" || segment.type === "final_walk" ? "dot" : "solid",
            map,
          });
        });
      }

      fitMapBounds(map, Tmapv3, origin, destination, route);
    } catch {
      mapRef.current = null;
      setMapFailed(true);
    }

    return () => {
      container.innerHTML = "";
      mapRef.current = null;
      currentMarkerRef.current = null;
    };
  }, [
    destination.lat,
    destination.lng,
    destination.name,
    origin.lat,
    origin.lng,
    origin.name,
    routeKey,
    showRoute,
  ]);

  useEffect(() => {
    const Tmapv3 = window.Tmapv3;
    const map = mapRef.current;

    if (!Tmapv3 || !map || !currentPosition) {
      return;
    }

    const position = new Tmapv3.LatLng(currentPosition.lat, currentPosition.lng);

    if (currentMarkerRef.current?.setPosition) {
      currentMarkerRef.current.setPosition(position);
      return;
    }

    currentMarkerRef.current = new Tmapv3.Marker({
      position,
      map,
      title: "현재 위치",
    });
  }, [currentPosition]);

  if (mapFailed) {
    return (
      <MockMapView
        origin={origin}
        destination={destination}
        currentPosition={currentPosition}
        route={route}
        showRoute={showRoute}
      />
    );
  }

  return <div ref={containerRef} className="h-full w-full bg-[#E8EDF3]" aria-label="Tmap 경로 지도" />;
}

export function MockMapView({
  origin,
  destination,
  currentPosition,
  showRoute = false
}: MapViewProps) {
  return (
    <div className="relative w-full h-full bg-[#E8EDF3] overflow-hidden">
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
              d={`M ${origin.lat * 100 + 80} ${origin.lng * 80 + 120}
                  Q ${(origin.lat + destination.lat) * 50 + 150} ${(origin.lng + destination.lng) * 40 + 80}
                  ${destination.lat * 100 + 280} ${destination.lng * 80 + 340}`}
              fill="none"
              stroke="url(#routeGradient)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={`M ${origin.lat * 100 + 80} ${origin.lng * 80 + 120}
                  Q ${(origin.lat + destination.lat) * 50 + 150} ${(origin.lng + destination.lng) * 40 + 80}
                  ${destination.lat * 100 + 280} ${destination.lng * 80 + 340}`}
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="8 12"
              opacity="0.4"
            />
          </svg>

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
                2호선 탑승
              </span>
            </div>
          </div>
        </>
      )}

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

      <div className="absolute left-8 top-32 text-xs text-neutral-500">강남대로</div>
      <div className="absolute right-12 bottom-32 text-xs text-neutral-500">테헤란로</div>
    </div>
  );
}

function getPolylineColor(segment: RouteSegment): string {
  if (segment.routeColor) {
    return segment.routeColor;
  }

  if (segment.type === "subway") {
    return "#009D3E";
  }

  if (segment.type === "bus") {
    return "#2563EB";
  }

  return "#64748B";
}

function fitMapBounds(
  map: any,
  Tmapv3: any,
  origin: MapPoint,
  destination: MapPoint,
  route?: RouteSegment[],
) {
  const points = [
    origin,
    destination,
    ...(route ?? []).flatMap((segment) => segment.geometry ?? []),
  ];

  try {
    const bounds = new Tmapv3.LatLngBounds();

    points.forEach((point) => {
      bounds.extend(new Tmapv3.LatLng(point.lat, point.lng));
    });

    if (map.fitBounds) {
      map.fitBounds(bounds);
    }
  } catch {
    if (map.setCenter) {
      map.setCenter(new Tmapv3.LatLng(origin.lat, origin.lng));
    }
  }
}

function createRouteKey(route?: RouteSegment[], showRoute?: boolean): string {
  if (!showRoute || !route) {
    return "hidden";
  }

  return route
    .map((segment) => `${segment.id}:${segment.type}:${segment.geometry?.length ?? 0}`)
    .join("|");
}
