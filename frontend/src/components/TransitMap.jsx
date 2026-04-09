import { useEffect } from "react";

const SVG_WIDTH = 1000;
const SVG_HEIGHT = 560;
const SVG_PADDING = 76;
const DEFAULT_COORDS = [
  [37.5655, 126.978],
  [37.5661, 126.9822],
];

function isTransitLegMode(mode) {
  return ["bus", "subway", "train", "rail"].includes(String(mode || "").toLowerCase());
}

function isValidCoord(coords) {
  return (
    Array.isArray(coords) &&
    coords.length === 2 &&
    Number.isFinite(Number(coords[0])) &&
    Number.isFinite(Number(coords[1]))
  );
}

function sameCoord(a, b) {
  if (!isValidCoord(a) || !isValidCoord(b)) return false;
  return Math.abs(Number(a[0]) - Number(b[0])) < 0.000001 && Math.abs(Number(a[1]) - Number(b[1])) < 0.000001;
}

function dedupePath(path = []) {
  return path.filter((coords, index, array) => {
    if (!isValidCoord(coords)) return false;
    if (index === 0) return true;
    return !sameCoord(coords, array[index - 1]);
  });
}

function normalizePath(path = []) {
  return dedupePath(
    path.map((coords) => {
      if (!Array.isArray(coords)) return null;
      return [Number(coords[0]), Number(coords[1])];
    }),
  );
}

function buildCandidateSegments(routeCandidate) {
  return (routeCandidate?.legs || [])
    .map((leg, index) => ({
      id: `candidate-${index}`,
      kind: isTransitLegMode(leg?.mode) ? "transit" : "walk",
      label: leg?.label || (isTransitLegMode(leg?.mode) ? "탑승" : "도보"),
      title: leg?.label || (isTransitLegMode(leg?.mode) ? "탑승 구간" : "도보 구간"),
      summary:
        leg?.start_name && leg?.end_name
          ? `${leg.start_name} → ${leg.end_name}`
          : leg?.label || (isTransitLegMode(leg?.mode) ? "탑승 구간" : "도보 구간"),
      path: normalizePath(leg?.path || []),
    }))
    .filter((segment) => segment.path.length >= 2);
}

function activeRoute(scene, result, routeCandidate) {
  const candidateSegments = buildCandidateSegments(routeCandidate);
  if (candidateSegments.length) {
    return {
      activeSegments: candidateSegments,
      passiveSegments: result?.risk_level === "위험" ? scene?.journeySegments || [] : scene?.waitJourneySegments || [],
      usesCandidateRoute: true,
    };
  }

  const activeSegments =
    result?.risk_level === "위험"
      ? scene?.waitJourneySegments || scene?.journeySegments || []
      : scene?.journeySegments || scene?.waitJourneySegments || [];
  const passiveSegments =
    result?.risk_level === "위험" ? scene?.journeySegments || [] : scene?.waitJourneySegments || [];

  return {
    activeSegments,
    passiveSegments,
    usesCandidateRoute: false,
  };
}

function scenePoints(scene, usesCandidateRoute) {
  const points = [
    { key: "origin", label: scene?.originPoint?.label || scene?.originLabel, coords: scene?.originPoint?.coords, tone: "origin" },
    { key: "crossing", label: scene?.crossing?.label, coords: scene?.crossing?.coords, tone: "crossing" },
    { key: "wait", label: scene?.waitPoint?.label, coords: scene?.waitPoint?.coords, tone: "wait" },
    { key: "board", label: scene?.boardStation?.label, coords: scene?.boardStation?.coords, tone: "board" },
    { key: "station", label: scene?.station?.label, coords: scene?.station?.coords, tone: "station" },
    {
      key: "destination",
      label: scene?.destinationPoint?.label || scene?.destinationLabel,
      coords: scene?.destinationPoint?.coords,
      tone: "destination",
    },
  ].filter((point) => point.label && isValidCoord(point.coords));

  return points.filter((point, index, array) => {
    if (!usesCandidateRoute) return true;
    return array.findIndex((candidate) => sameCoord(candidate.coords, point.coords)) === index;
  });
}

function midpoint(path = []) {
  const valid = normalizePath(path);
  if (!valid.length) return null;
  return valid[Math.floor(valid.length / 2)];
}

function allCoords(scene, segments, passiveSegments, points) {
  const coords = [];
  [...segments, ...passiveSegments].forEach((segment) => {
    normalizePath(segment?.path || []).forEach((point) => coords.push(point));
  });
  points.forEach((point) => coords.push(point.coords));
  if (!coords.length && isValidCoord(scene?.center)) coords.push(scene.center);
  return coords.length ? coords : DEFAULT_COORDS;
}

function createProjection(coords) {
  const allLat = coords.map((point) => Number(point[0]));
  const allLng = coords.map((point) => Number(point[1]));
  const minLat = Math.min(...allLat);
  const maxLat = Math.max(...allLat);
  const minLng = Math.min(...allLng);
  const maxLng = Math.max(...allLng);
  const latSpan = Math.max(maxLat - minLat, 0.0024);
  const lngSpan = Math.max(maxLng - minLng, 0.0024);
  const availableWidth = SVG_WIDTH - SVG_PADDING * 2;
  const availableHeight = SVG_HEIGHT - SVG_PADDING * 2;
  const scale = Math.min(availableWidth / lngSpan, availableHeight / latSpan);
  const drawWidth = lngSpan * scale;
  const drawHeight = latSpan * scale;
  const offsetX = (SVG_WIDTH - drawWidth) / 2;
  const offsetY = (SVG_HEIGHT - drawHeight) / 2;

  return ([lat, lng]) => {
    const x = offsetX + (Number(lng) - minLng) * scale;
    const y = SVG_HEIGHT - (offsetY + (Number(lat) - minLat) * scale);
    return [x, y];
  };
}

function polylinePoints(path, project) {
  return normalizePath(path)
    .map((coords) => project(coords).join(","))
    .join(" ");
}

function segmentTone(kind) {
  return kind === "transit" ? "transit" : "walk";
}

function riskTone(result) {
  if (result?.risk_level === "위험") return "danger";
  if (result?.risk_level === "주의") return "caution";
  return "good";
}

function segmentBadgeText(segment) {
  if (segment.kind === "transit") return segment.label || "탑승";
  return segment.label || "도보";
}

export default function TransitMap({ scene, result, routeCandidate, onProviderChange }) {
  useEffect(() => {
    onProviderChange?.("fixed", "고정 경로 지도 위에 현재 경로를 시각화합니다.");
  }, [onProviderChange]);

  const { activeSegments, passiveSegments, usesCandidateRoute } = activeRoute(scene, result, routeCandidate);
  const points = scenePoints(scene, usesCandidateRoute);
  const coords = allCoords(scene, activeSegments, passiveSegments, points);
  const project = createProjection(coords);
  const tone = riskTone(result);

  return (
    <div className="map-canvas-wrap">
      <div className="map-canvas route-svg-canvas">
        <svg
          className="route-svg"
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          width={SVG_WIDTH}
          height={SVG_HEIGHT}
          role="img"
          aria-label="경로 지도"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="routeMapBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f6f9fd" />
              <stop offset="100%" stopColor="#edf3fb" />
            </linearGradient>
            <filter id="routeGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="7" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect className="route-svg-bg" width={SVG_WIDTH} height={SVG_HEIGHT} fill="url(#routeMapBg)" rx="28" />

          <g className="route-svg-grid">
            {[1, 2, 3, 4, 5].map((step) => (
              <line
                key={`v-${step}`}
                x1={(SVG_WIDTH / 6) * step}
                y1="0"
                x2={(SVG_WIDTH / 6) * step}
                y2={SVG_HEIGHT}
                className="route-svg-grid-line"
              />
            ))}
            {[1, 2, 3, 4].map((step) => (
              <line
                key={`h-${step}`}
                x1="0"
                y1={(SVG_HEIGHT / 5) * step}
                x2={SVG_WIDTH}
                y2={(SVG_HEIGHT / 5) * step}
                className="route-svg-grid-line"
              />
            ))}
          </g>

          <g className="route-svg-passive">
            {passiveSegments.map((segment) => (
              <polyline
                key={`passive-${segment.id || segment.title}`}
                points={polylinePoints(segment.path, project)}
                className={`route-svg-path passive ${segmentTone(segment.kind)}`}
              />
            ))}
          </g>

          <g className="route-svg-active">
            {activeSegments.map((segment) => (
              <g key={`active-${segment.id || segment.title}`}>
                <polyline
                  points={polylinePoints(segment.path, project)}
                  className={`route-svg-path-glow ${segmentTone(segment.kind)} ${tone}`}
                  filter="url(#routeGlow)"
                />
                <polyline
                  points={polylinePoints(segment.path, project)}
                  className={`route-svg-path active ${segmentTone(segment.kind)} ${tone}`}
                />
              </g>
            ))}
          </g>

          <g className="route-svg-segment-labels">
            {activeSegments.map((segment, index) => {
              const center = midpoint(segment.path);
              if (!center) return null;
              const [x, y] = project(center);
              return (
                <g key={`badge-${segment.id || index}`} transform={`translate(${x}, ${y})`}>
                  <rect
                    className={`route-svg-segment-chip ${segmentTone(segment.kind)}`}
                    x={-54}
                    y={-18}
                    rx={14}
                    ry={14}
                    width={108}
                    height={36}
                  />
                  <text
                    className={`route-svg-segment-text ${segmentTone(segment.kind)}`}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {segmentBadgeText(segment)}
                  </text>
                </g>
              );
            })}
          </g>

          <g className="route-svg-points">
            {points.map((point) => {
              const [x, y] = project(point.coords);
              return (
                <g key={point.key} transform={`translate(${x}, ${y})`}>
                  <circle className={`route-svg-point-ring ${point.tone}`} r="14" />
                  <circle className={`route-svg-point-core ${point.tone}`} r="7.5" />
                  <g transform="translate(18, -10)">
                    <rect
                      className={`route-svg-point-label-box ${point.tone}`}
                      rx="14"
                      ry="14"
                      width={Math.max(88, point.label.length * 10)}
                      height="30"
                    />
                    <text x="14" y="19" className="route-svg-point-label">
                      {point.label}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <span className="map-provider-badge">고정 경로 지도</span>
      <p className="map-fallback-note fixed">
        {usesCandidateRoute ? "조회된 실제 경로를 고정 경로 지도 위에 반영했습니다." : "시연용 고정 경로를 바탕으로 ETA 변화를 시각화합니다."}
      </p>
    </div>
  );
}
