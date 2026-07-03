import type { GeoPoint, RouteSegment } from "./eta";
import type { PedestrianSignal } from "./signal";

export interface JourneyProgressState {
  currentIndex: number;
  currentSegment: RouteSegment;
  elapsedInSegment: number;
}

export interface NextJourneyEvent {
  label: string;
  secondsUntil: number;
}

export interface CrossingWaitTrigger {
  id: string;
  segmentId: string;
  elapsedSeconds: number;
  position?: GeoPoint;
  description: string;
}

export interface SignalWaitDecision {
  shouldWait: boolean;
  demoWaitSeconds: number;
  realDelaySeconds: number;
  reason: "red_with_timer" | "red_without_timer" | "pass";
}

export function scaleSpeedDelta(deltaSeconds: number, progressPercent: number): number {
  const remainingRatio = Math.max(0, Math.min(1, (100 - progressPercent) / 100));

  return Math.round(deltaSeconds * remainingRatio);
}

export function getProgressState(segments: RouteSegment[], elapsedSeconds: number): JourneyProgressState {
  let accumulated = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const segmentEnd = accumulated + segment.duration;

    if (elapsedSeconds <= segmentEnd) {
      return {
        currentIndex: index,
        currentSegment: segment,
        elapsedInSegment: Math.max(0, elapsedSeconds - accumulated),
      };
    }

    accumulated = segmentEnd;
  }

  const lastSegment = segments[segments.length - 1];

  return {
    currentIndex: Math.max(0, segments.length - 1),
    currentSegment: lastSegment,
    elapsedInSegment: lastSegment?.duration ?? 0,
  };
}

export function getRemainingWalkingDistance(segments: RouteSegment[], elapsedSeconds: number): number {
  let accumulated = 0;
  let remaining = 0;

  segments.forEach((segment) => {
    const segmentStart = accumulated;
    const segmentEnd = accumulated + segment.duration;
    accumulated = segmentEnd;

    if (!isWalkingSegment(segment) || !segment.distance || elapsedSeconds >= segmentEnd) {
      return;
    }

    if (elapsedSeconds <= segmentStart) {
      remaining += segment.distance;
      return;
    }

    const segmentProgress = (elapsedSeconds - segmentStart) / segment.duration;
    remaining += Math.round(segment.distance * (1 - segmentProgress));
  });

  return Math.max(0, Math.round(remaining));
}

function isWalkingSegment(segment: RouteSegment): boolean {
  return segment.type === "walk" || segment.type === "final_walk";
}

export function getNextEvent(segments: RouteSegment[], elapsedSeconds: number): NextJourneyEvent | null {
  const totalDuration = segments.reduce((sum, segment) => sum + segment.duration, 0);

  if (segments.length === 0 || elapsedSeconds >= totalDuration) {
    return null;
  }

  let accumulated = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const segmentEnd = accumulated + segments[index].duration;

    if (elapsedSeconds < segmentEnd) {
      const nextSegment = segments[index + 1];

      return {
        label: nextSegment?.label ?? "목적지 도착",
        secondsUntil: Math.max(0, segmentEnd - elapsedSeconds),
      };
    }

    accumulated = segmentEnd;
  }

  return null;
}

export function interpolateRoutePosition(segments: RouteSegment[], progressPercent: number): GeoPoint | null {
  const points = segments.flatMap((segment) => segment.geometry ?? []);

  if (points.length === 0) {
    return null;
  }

  if (points.length === 1) {
    return points[0];
  }

  const clampedProgress = Math.max(0, Math.min(100, progressPercent));
  const scaledIndex = (clampedProgress / 100) * (points.length - 1);
  const startIndex = Math.floor(scaledIndex);
  const endIndex = Math.min(points.length - 1, startIndex + 1);
  const ratio = scaledIndex - startIndex;
  const start = points[startIndex];
  const end = points[endIndex];

  return {
    lat: start.lat + (end.lat - start.lat) * ratio,
    lng: start.lng + (end.lng - start.lng) * ratio,
  };
}

export function getDemoDurationSeconds(seed: number): number {
  return 60 + (seed % 30);
}

export function getDemoSpeedMultiplier(totalDuration: number, seed: number): number {
  const demoDurationSeconds = getDemoDurationSeconds(seed);

  return Math.max(1, totalDuration / demoDurationSeconds);
}

export function compressSignalWaitSeconds(
  remainingSeconds: number | null | undefined,
  demoSpeedMultiplier: number,
  fallbackDemoSeconds = 5,
  maxDemoSeconds = 8,
): number {
  if (typeof remainingSeconds !== "number" || remainingSeconds <= 0) {
    return fallbackDemoSeconds;
  }

  return Math.max(1, Math.min(maxDemoSeconds, Math.ceil(remainingSeconds / Math.max(1, demoSpeedMultiplier))));
}

export function getSignalWaitDecision(
  signal: Pick<PedestrianSignal, "state" | "remainingSeconds"> | null | undefined,
  demoSpeedMultiplier: number,
): SignalWaitDecision {
  if (!signal || signal.state !== "red") {
    return {
      shouldWait: false,
      demoWaitSeconds: 0,
      realDelaySeconds: 0,
      reason: "pass",
    };
  }

  const hasRemaining = typeof signal.remainingSeconds === "number" && signal.remainingSeconds > 0;

  return {
    shouldWait: true,
    demoWaitSeconds: compressSignalWaitSeconds(signal.remainingSeconds, demoSpeedMultiplier),
    realDelaySeconds: hasRemaining ? signal.remainingSeconds : 20,
    reason: hasRemaining ? "red_with_timer" : "red_without_timer",
  };
}

export function getCrossingWaitTriggers(segments: RouteSegment[]): CrossingWaitTrigger[] {
  let accumulated = 0;
  const triggers: CrossingWaitTrigger[] = [];

  segments.forEach((segment, index) => {
    const segmentStart = accumulated;
    const segmentEnd = segmentStart + segment.duration;
    accumulated = segmentEnd;

    if (!isWalkingSegment(segment)) {
      return;
    }

    if (segment.crossings?.length) {
      segment.crossings.forEach((crossing, crossingIndex) => {
        const progressRatio = estimateGeometryProgress(segment.geometry, crossing.position);

        triggers.push({
          id: `${segment.id}:crossing:${crossingIndex}`,
          segmentId: segment.id,
          elapsedSeconds: segmentStart + segment.duration * progressRatio,
          position: crossing.position,
          description: crossing.description,
        });
      });

      return;
    }

    if (index < segments.length - 1) {
      triggers.push({
        id: `${segment.id}:boundary`,
        segmentId: segment.id,
        elapsedSeconds: segmentEnd,
        position: segment.geometry?.[segment.geometry.length - 1],
        description: "도보 구간 종료 지점",
      });
    }
  });

  return triggers.sort((first, second) => first.elapsedSeconds - second.elapsedSeconds);
}

export function findCrossedWaitTrigger(
  triggers: CrossingWaitTrigger[],
  previousElapsedSeconds: number,
  nextElapsedSeconds: number,
  handledTriggerIds: Set<string>,
): CrossingWaitTrigger | null {
  return (
    triggers.find(
      (trigger) =>
        !handledTriggerIds.has(trigger.id) &&
        trigger.elapsedSeconds > previousElapsedSeconds &&
        trigger.elapsedSeconds <= nextElapsedSeconds,
    ) ?? null
  );
}

function estimateGeometryProgress(geometry: GeoPoint[] | undefined, position: GeoPoint): number {
  if (!geometry || geometry.length < 2) {
    return 1;
  }

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  geometry.forEach((point, index) => {
    const distance = Math.hypot(point.lat - position.lat, point.lng - position.lng);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return Math.max(0, Math.min(1, nearestIndex / (geometry.length - 1)));
}
