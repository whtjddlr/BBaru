import type { GeoPoint, RouteSegment } from "./eta";

export interface JourneyProgressState {
  currentIndex: number;
  currentSegment: RouteSegment;
  elapsedInSegment: number;
}

export interface NextJourneyEvent {
  label: string;
  secondsUntil: number;
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
