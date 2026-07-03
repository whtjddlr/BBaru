import type { GeoPoint } from "./eta";

export interface GeoPosition extends GeoPoint {
  accuracy: number;
  timestamp: number;
}

export type GeolocationPermissionState = PermissionState | "unsupported";
export type GeolocationErrorClassification = "fatal" | "transient";

export const GEOLOCATION_RECENT_POSITION_WINDOW_MS = 15000;
export const GEOLOCATION_TRANSIENT_ERROR_THRESHOLD = 5;

export interface GeolocationErrorLike {
  code: number;
  message?: string;
}

export interface WeakSignalInput {
  transientErrorCount: number;
  lastPositionAt: number | null;
  now: number;
  threshold?: number;
  recentPositionWindowMs?: number;
}

export interface WatchPositionOptions {
  onPosition: (position: GeoPosition) => void;
  onError?: (error: GeolocationPositionError) => void;
}

export async function queryGeolocationPermission(): Promise<GeolocationPermissionState> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return "unsupported";
  }

  if (!navigator.permissions?.query) {
    return "prompt";
  }

  try {
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });

    return status.state;
  } catch {
    return "prompt";
  }
}

export function classifyGeolocationError(error: GeolocationErrorLike): GeolocationErrorClassification {
  return error.code === 1 ? "fatal" : "transient";
}

export function hasRecentGeolocationPosition(
  lastPositionAt: number | null,
  now: number,
  recentPositionWindowMs = GEOLOCATION_RECENT_POSITION_WINDOW_MS,
): boolean {
  return lastPositionAt !== null && now - lastPositionAt <= recentPositionWindowMs;
}

export function shouldSuggestDemoForWeakGpsSignal({
  transientErrorCount,
  lastPositionAt,
  now,
  threshold = GEOLOCATION_TRANSIENT_ERROR_THRESHOLD,
  recentPositionWindowMs = GEOLOCATION_RECENT_POSITION_WINDOW_MS,
}: WeakSignalInput): boolean {
  return (
    transientErrorCount >= threshold &&
    !hasRecentGeolocationPosition(lastPositionAt, now, recentPositionWindowMs)
  );
}

export function watchCurrentPosition({
  onPosition,
  onError,
}: WatchPositionOptions): () => void {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("이 브라우저는 위치 추적을 지원하지 않습니다.");
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      onPosition({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
      });
    },
    onError,
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 2000,
    },
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
  };
}
