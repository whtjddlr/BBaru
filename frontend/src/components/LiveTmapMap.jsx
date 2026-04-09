import { useEffect, useMemo, useRef, useState } from "react";
import { loadTmapMapSdk, toTmapLatLng } from "../utils/tmapMap";

function buildScenePath(scene) {
  const path = [];
  const push = (coords) => {
    if (!Array.isArray(coords) || coords.length !== 2) return;
    const last = path[path.length - 1];
    if (last && Math.abs(last[0] - coords[0]) < 0.000001 && Math.abs(last[1] - coords[1]) < 0.000001) return;
    path.push(coords);
  };

  push(scene?.exit?.coords);
  push(scene?.crossing?.coords);
  push(scene?.waitPoint?.coords);
  push(scene?.boardStation?.coords);
  (scene?.transitCorridor || []).forEach(push);
  push(scene?.station?.coords);
  push(scene?.destinationAnchor);

  return path;
}

function extractDynamicMarkers(scene, routeCandidate, path) {
  const transitLegs = (routeCandidate?.legs || []).filter((leg) => String(leg?.mode || "").toLowerCase() !== "walk");
  const firstLeg = routeCandidate?.legs?.[0];
  const lastLeg = routeCandidate?.legs?.[routeCandidate.legs.length - 1];

  if (!transitLegs.length || !path.length) {
    return [
      { title: scene?.originLabel || "출발", coords: scene?.exit?.coords },
      { title: scene?.crossing?.label || "횡단", coords: scene?.crossing?.coords },
      { title: scene?.boardStation?.label || "탑승", coords: scene?.boardStation?.coords },
      { title: scene?.destinationLabel || "도착", coords: scene?.destinationAnchor },
    ].filter((item) => Array.isArray(item.coords));
  }

  const markers = [];
  const pushMarker = (title, coords) => {
    if (!title || !Array.isArray(coords)) return;
    const previous = markers[markers.length - 1];
    if (previous && previous.title === title) return;
    markers.push({ title, coords });
  };

  const firstTransit = transitLegs[0];
  const lastTransit = transitLegs[transitLegs.length - 1];
  const firstTransitPath = Array.isArray(firstTransit?.path) ? firstTransit.path : [];
  const lastTransitPath = Array.isArray(lastTransit?.path) ? lastTransit.path : [];

  pushMarker(firstLeg?.start_name || scene?.originLabel || "출발", path[0]);
  pushMarker(firstTransit?.start_name || scene?.boardStation?.label || "탑승", firstTransitPath[0] || scene?.boardStation?.coords);

  if (transitLegs.length > 1) {
    transitLegs.slice(0, -1).forEach((leg) => {
      const legPath = Array.isArray(leg?.path) ? leg.path : [];
      pushMarker(leg?.end_name || "환승", legPath[legPath.length - 1]);
    });
  }

  pushMarker(lastTransit?.end_name || scene?.station?.label || "하차", lastTransitPath[lastTransitPath.length - 1] || scene?.station?.coords);
  pushMarker(lastLeg?.end_name || scene?.destinationLabel || "도착", path[path.length - 1]);
  return markers;
}

function SceneFallback({ scene, routeCandidate = null, routePath = [] }) {
  const points =
    Array.isArray(routePath) && routePath.length
      ? routePath.filter((coords) => Array.isArray(coords) && coords.length === 2)
      : buildScenePath(scene);
  const lats = points.map((point) => point[0]);
  const lngs = points.map((point) => point[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = Math.max(maxLat - minLat, 0.003);
  const lngSpan = Math.max(maxLng - minLng, 0.003);

  const project = ([lat, lng]) => {
    const x = ((lng - minLng) / lngSpan) * 100;
    const y = 100 - ((lat - minLat) / latSpan) * 100;
    return [x, y];
  };

  const polyline = points.map((point) => project(point).join(",")).join(" ");
  const markers = extractDynamicMarkers(scene, routeCandidate, points).map((item, index) => ({
    label: item.title,
    coords: item.coords,
    color: ["#2563EB", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444"][index] || "#334155",
  }));

  return (
    <div className="relative h-[320px] overflow-hidden rounded-[28px] border border-slate-200 bg-[#E9EEF5]">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <pattern id="fallback-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M10 0H0V10" fill="none" stroke="#D7DEE8" strokeWidth="0.25" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#fallback-grid)" />
        <polyline points={polyline} fill="none" stroke="#2563EB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      {markers.map((marker) => {
        const [x, y] = project(marker.coords);
        return (
          <div
            key={marker.label}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <div className="h-4 w-4 rounded-full border-2 border-white shadow-md" style={{ backgroundColor: marker.color }} />
            <div className="mt-2 whitespace-nowrap rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-sm">
              {marker.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function LiveTmapMap({ appKey, scene, routePath = [], routeCandidate = null }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const overlaysRef = useRef([]);
  const [error, setError] = useState("");

  const path = useMemo(() => {
    if (Array.isArray(routePath) && routePath.length) {
      return routePath.filter((coords) => Array.isArray(coords) && coords.length === 2);
    }
    return buildScenePath(scene);
  }, [routePath, scene]);

  const markerItems = useMemo(() => extractDynamicMarkers(scene, routeCandidate, path), [scene, routeCandidate, path]);

  useEffect(() => {
    let cancelled = false;

    async function mountMap() {
      if (!containerRef.current || !appKey || !path.length) return;
      try {
        const Tmapv2 = await loadTmapMapSdk(appKey);
        if (cancelled || !containerRef.current) return;

        if (!mapRef.current) {
          const center = scene?.center || path[Math.floor(path.length / 2)] || path[0];
          mapRef.current = new Tmapv2.Map(containerRef.current, {
            center: toTmapLatLng(Tmapv2, center),
            width: "100%",
            height: "320px",
            zoom: scene?.zoom || 14,
          });
        }

        overlaysRef.current.forEach((overlay) => overlay?.setMap?.(null));
        overlaysRef.current = [];

        const bounds = new Tmapv2.LatLngBounds();
        const linePath = path.map((coords) => {
          bounds.extend(toTmapLatLng(Tmapv2, coords));
          return toTmapLatLng(Tmapv2, coords);
        });

        const polyline = new Tmapv2.Polyline({
          path: linePath,
          strokeColor: "#2563EB",
          strokeWeight: 6,
          map: mapRef.current,
        });
        overlaysRef.current.push(polyline);

        markerItems.forEach((item) => {
          const marker = new Tmapv2.Marker({
            position: toTmapLatLng(Tmapv2, item.coords),
            title: item.title,
            map: mapRef.current,
          });
          overlaysRef.current.push(marker);
        });

        if (!bounds.isEmpty?.()) {
          mapRef.current.fitBounds(bounds, { left: 48, top: 48, right: 48, bottom: 48 });
        }

        setError("");
      } catch (sdkError) {
        if (!cancelled) {
          setError(String(sdkError?.message || sdkError));
        }
      }
    }

    mountMap();

    return () => {
      cancelled = true;
    };
  }, [appKey, path, scene, markerItems]);

  if (!appKey || error) {
    return (
      <div className="space-y-2">
        <SceneFallback scene={scene} routeCandidate={routeCandidate} routePath={path} />
        {error ? <div className="text-xs text-slate-400">{error}</div> : null}
      </div>
    );
  }

  return <div ref={containerRef} className="h-[320px] overflow-hidden rounded-[28px] border border-slate-200 shadow-sm" />;
}
