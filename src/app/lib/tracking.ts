import type { EtaPlan, GeoPoint } from "./eta";
import type { RouteSegment } from "./eta";

const EARTH_RADIUS_METERS = 6371000;

export interface RouteProjection {
  projectedPoint: GeoPoint;
  traveledDistanceMeters: number;
  totalDistanceMeters: number;
  progressRatio: number;
  progressPercent: number;
  offRouteDistanceMeters: number;
}

export interface ArrivalEstimate {
  expectedArrival: Date;
  deviationMinutes: number;
  remainingDurationSeconds: number;
}

export interface PaceAdvice {
  title: string;
  description: string;
  tone: "success" | "neutral" | "warning";
}

export type TrackingProgressMode = "live" | "demo";

interface MeterPoint {
  x: number;
  y: number;
}

export function projectOntoRoute(position: GeoPoint, routeCoords: GeoPoint[]): RouteProjection {
  if (routeCoords.length === 0) {
    return {
      projectedPoint: position,
      traveledDistanceMeters: 0,
      totalDistanceMeters: 0,
      progressRatio: 0,
      progressPercent: 0,
      offRouteDistanceMeters: Number.POSITIVE_INFINITY,
    };
  }

  if (routeCoords.length === 1) {
    const offRouteDistanceMeters = getDistanceMeters(position, routeCoords[0]);

    return {
      projectedPoint: routeCoords[0],
      traveledDistanceMeters: 0,
      totalDistanceMeters: 0,
      progressRatio: 0,
      progressPercent: 0,
      offRouteDistanceMeters,
    };
  }

  const totalDistanceMeters = sumRouteDistance(routeCoords);
  let accumulatedDistance = 0;
  let bestProjection: RouteProjection | null = null;

  for (let index = 0; index < routeCoords.length - 1; index += 1) {
    const start = routeCoords[index];
    const end = routeCoords[index + 1];
    const segmentDistance = getDistanceMeters(start, end);

    if (segmentDistance <= 0) {
      continue;
    }

    const projected = projectOntoSegment(position, start, end);
    const traveledDistanceMeters = accumulatedDistance + segmentDistance * projected.ratio;

    if (!bestProjection || projected.distanceMeters < bestProjection.offRouteDistanceMeters) {
      const progressRatio = totalDistanceMeters > 0 ? traveledDistanceMeters / totalDistanceMeters : 0;

      bestProjection = {
        projectedPoint: projected.point,
        traveledDistanceMeters,
        totalDistanceMeters,
        progressRatio: clamp(progressRatio, 0, 1),
        progressPercent: clamp(progressRatio * 100, 0, 100),
        offRouteDistanceMeters: projected.distanceMeters,
      };
    }

    accumulatedDistance += segmentDistance;
  }

  return bestProjection ?? {
    projectedPoint: routeCoords[0],
    traveledDistanceMeters: 0,
    totalDistanceMeters,
    progressRatio: 0,
    progressPercent: 0,
    offRouteDistanceMeters: getDistanceMeters(position, routeCoords[0]),
  };
}

export function estimateArrival(progressRatio: number, plan: EtaPlan, now: Date): ArrivalEstimate {
  const remainingRatio = 1 - clamp(progressRatio, 0, 1);
  const remainingDurationSeconds = Math.max(0, Math.round(plan.totalDuration * remainingRatio));
  const expectedArrival = new Date(now.getTime() + remainingDurationSeconds * 1000);
  const deviationMinutes = Math.round((expectedArrival.getTime() - plan.targetArrival.getTime()) / 60000);

  return {
    expectedArrival,
    deviationMinutes,
    remainingDurationSeconds,
  };
}

export function getRouteCoordinates(
  segments: RouteSegment[],
  fallbackPoints: Array<GeoPoint | undefined> = [],
): GeoPoint[] {
  const geometryPoints = segments.flatMap((segment) => segment.geometry ?? []);

  if (geometryPoints.length === 0) {
    return fallbackPoints.filter((point): point is GeoPoint => Boolean(point));
  }

  const [originPoint, destinationPoint] = fallbackPoints;
  const routePoints = [...geometryPoints];

  if (originPoint && getDistanceMeters(originPoint, routePoints[0]) > 1) {
    routePoints.unshift(originPoint);
  }

  const lastPoint = routePoints[routePoints.length - 1];

  if (destinationPoint && getDistanceMeters(destinationPoint, lastPoint) > 1) {
    routePoints.push(destinationPoint);
  }

  return routePoints;
}

export function canUseLiveTracking(plan: Pick<EtaPlan, "segments">): boolean {
  return getGeometryCoordinates(plan.segments).length >= 2;
}

function getGeometryCoordinates(segments: RouteSegment[]): GeoPoint[] {
  return segments.flatMap((segment) => segment.geometry ?? []);
}

export function selectProgressPercent(
  mode: TrackingProgressMode,
  liveProjection: Pick<RouteProjection, "progressPercent"> | null,
  demoProgressPercent: number,
): number {
  return mode === "live" ? liveProjection?.progressPercent ?? 0 : demoProgressPercent;
}

export function selectArrivedState({
  mode,
  liveProjection,
  distanceToDestinationMeters,
  demoArrived,
}: {
  mode: TrackingProgressMode;
  liveProjection: Pick<RouteProjection, "progressPercent"> | null;
  distanceToDestinationMeters: number;
  demoArrived: boolean;
}): boolean {
  if (mode === "demo") {
    return demoArrived;
  }

  return Boolean(
    liveProjection &&
      isArrived(liveProjection.progressPercent, distanceToDestinationMeters),
  );
}

export function paceAdvice(deviationMinutes: number): PaceAdvice {
  if (deviationMinutes <= -2) {
    return {
      title: "여유 있습니다",
      description: "현재 속도라면 목표 시각보다 조금 일찍 도착합니다.",
      tone: "success",
    };
  }

  if (deviationMinutes > 2) {
    return {
      title: "조금 더 빠르게 이동하세요",
      description: "현재 속도라면 목표 시각보다 늦을 수 있습니다.",
      tone: "warning",
    };
  }

  return {
    title: "현재 속도 유지하세요",
    description: "현재 페이스가 목표 도착 시각과 잘 맞습니다.",
    tone: "neutral",
  };
}

export function isOffRoute(distanceMeters: number, thresholdMeters = 50): boolean {
  return distanceMeters > thresholdMeters;
}

export function isArrived(
  progressPercent: number,
  distanceToDestinationMeters: number,
  progressThreshold = 98,
  destinationThresholdMeters = 50,
): boolean {
  return progressPercent >= progressThreshold && distanceToDestinationMeters <= destinationThresholdMeters;
}

export function getDistanceMeters(from: GeoPoint, to: GeoPoint): number {
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

function projectOntoSegment(position: GeoPoint, start: GeoPoint, end: GeoPoint) {
  const startMeters = toMeterPoint(start, position);
  const endMeters = toMeterPoint(end, position);
  const segment = {
    x: endMeters.x - startMeters.x,
    y: endMeters.y - startMeters.y,
  };
  const segmentLengthSquared = segment.x * segment.x + segment.y * segment.y;

  if (segmentLengthSquared === 0) {
    return {
      point: start,
      ratio: 0,
      distanceMeters: getDistanceMeters(position, start),
    };
  }

  const positionFromStart = {
    x: -startMeters.x,
    y: -startMeters.y,
  };
  const ratio = clamp(
    (positionFromStart.x * segment.x + positionFromStart.y * segment.y) / segmentLengthSquared,
    0,
    1,
  );
  const point = {
    lat: start.lat + (end.lat - start.lat) * ratio,
    lng: start.lng + (end.lng - start.lng) * ratio,
  };

  return {
    point,
    ratio,
    distanceMeters: getDistanceMeters(position, point),
  };
}

function sumRouteDistance(routeCoords: GeoPoint[]): number {
  return routeCoords.reduce((sum, point, index) => {
    if (index === 0) {
      return 0;
    }

    return sum + getDistanceMeters(routeCoords[index - 1], point);
  }, 0);
}

function toMeterPoint(point: GeoPoint, reference: GeoPoint): MeterPoint {
  const latRadians = toRadians(reference.lat);

  return {
    x: toRadians(point.lng - reference.lng) * Math.cos(latRadians) * EARTH_RADIUS_METERS,
    y: toRadians(point.lat - reference.lat) * EARTH_RADIUS_METERS,
  };
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
