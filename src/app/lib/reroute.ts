import type { EtaMode, EtaPlan, EtaSearchRequest, GeoPoint } from "./eta";
import type { TmapTransitResponse } from "./tmap";
import { mapTransitResponseToPlan } from "./transitMapper";

export const REROUTE_DISTANCE_THRESHOLD_METERS = 50;
export const REROUTE_MIN_OFF_ROUTE_DURATION_MS = 10000;
export const REROUTE_MIN_INTERVAL_MS = 30000;
export const REROUTE_FAILURE_BACKOFF_MS = 60000;
export const REROUTE_MAX_ATTEMPTS_PER_SESSION = 5;

export interface RerouteState {
  offRouteStartedAtIso: string | null;
  lastRerouteAtIso: string | null;
  rerouteCount: number;
  backoffUntilIso?: string | null;
}

export interface ShouldRerouteOptions {
  minOffRouteDurationMs?: number;
  minIntervalMs?: number;
  maxAttempts?: number;
}

export function createInitialRerouteState(): RerouteState {
  return {
    offRouteStartedAtIso: null,
    lastRerouteAtIso: null,
    rerouteCount: 0,
    backoffUntilIso: null,
  };
}

export function updateRerouteStateForPosition(
  state: RerouteState,
  now: Date,
  offRouteDistanceMeters: number,
  thresholdMeters = REROUTE_DISTANCE_THRESHOLD_METERS,
): RerouteState {
  if (offRouteDistanceMeters <= thresholdMeters) {
    return resetRerouteOffRouteTimer(state);
  }

  if (state.offRouteStartedAtIso) {
    return state;
  }

  return {
    ...state,
    offRouteStartedAtIso: now.toISOString(),
  };
}

export function resetRerouteOffRouteTimer(state: RerouteState): RerouteState {
  if (!state.offRouteStartedAtIso) {
    return state;
  }

  return {
    ...state,
    offRouteStartedAtIso: null,
  };
}

export function shouldReroute(
  state: RerouteState,
  now: Date,
  {
    minOffRouteDurationMs = REROUTE_MIN_OFF_ROUTE_DURATION_MS,
    minIntervalMs = REROUTE_MIN_INTERVAL_MS,
    maxAttempts = REROUTE_MAX_ATTEMPTS_PER_SESSION,
  }: ShouldRerouteOptions = {},
): boolean {
  if (state.rerouteCount >= maxAttempts || !state.offRouteStartedAtIso) {
    return false;
  }

  const offRouteStartedAt = parseDate(state.offRouteStartedAtIso);

  if (!offRouteStartedAt || now.getTime() - offRouteStartedAt.getTime() < minOffRouteDurationMs) {
    return false;
  }

  const backoffUntil = parseDate(state.backoffUntilIso ?? null);

  if (backoffUntil && now.getTime() < backoffUntil.getTime()) {
    return false;
  }

  const lastRerouteAt = parseDate(state.lastRerouteAtIso);

  return !lastRerouteAt || now.getTime() - lastRerouteAt.getTime() >= minIntervalMs;
}

export function recordRerouteAttempt(
  state: RerouteState,
  now: Date,
  backoffMs = REROUTE_MIN_INTERVAL_MS,
): RerouteState {
  return {
    ...state,
    lastRerouteAtIso: now.toISOString(),
    rerouteCount: state.rerouteCount + 1,
    backoffUntilIso: new Date(now.getTime() + backoffMs).toISOString(),
  };
}

export function createRerouteRequest(
  previousRequest: EtaSearchRequest,
  currentPosition: GeoPoint,
): EtaSearchRequest {
  if (!previousRequest.destinationPoint) {
    throw new Error("도착지 좌표가 없어 경로를 재탐색할 수 없습니다.");
  }

  return {
    ...previousRequest,
    origin: "현재 위치",
    originPoint: {
      lat: currentPosition.lat,
      lng: currentPosition.lng,
    },
    destination: previousRequest.destination,
    destinationPoint: previousRequest.destinationPoint,
    targetTime: previousRequest.targetTime,
  };
}

export function createReroutePlan(
  previousRequest: EtaSearchRequest,
  currentPosition: GeoPoint,
  response: TmapTransitResponse,
  mode: EtaMode,
  now: Date,
): EtaPlan {
  return mapTransitResponseToPlan(
    createRerouteRequest(previousRequest, currentPosition),
    response,
    mode,
    now,
  );
}

function parseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? date : null;
}
