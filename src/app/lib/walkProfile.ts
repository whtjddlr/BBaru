import {
  createEtaPlanFromSegments,
  type AlternativeRoute,
  type EtaPlan,
  type RouteSegment,
  type RouteSegmentType,
} from "./eta";
import type { RouteProjection } from "./tracking";

export const WALK_PROFILE_STORAGE_KEY = "bbaru:walk-profile";
export const WALK_PROFILE_MIN_SAMPLES = 10;
export const WALK_PROFILE_ALPHA = 0.3;
export const DEFAULT_TMAP_WALK_SPEED_MPS = 1.38;
export const MIN_VALID_WALK_SPEED_MPS = 0.3;
export const MAX_VALID_WALK_SPEED_MPS = 3.0;
export const MIN_HEIGHT_CM = 100;
export const MAX_HEIGHT_CM = 220;
export const STRIDE_HEIGHT_RATIO = 0.415;
export const WALK_CADENCE_STEPS_PER_SEC = 1.9;
export const MIN_SAMPLE_DISTANCE_METERS = 5;
export const MAX_SAMPLE_ACCURACY_METERS = 50;
export const MIN_WALK_DURATION_SCALE = 0.7;
export const MAX_WALK_DURATION_SCALE = 1.5;

export interface WalkProfile {
  speedMps: number;
  sampleCount: number;
  updatedAt: string;
  heightCm?: number;
}

export interface WalkProfileApplied {
  speedMps: number;
  sampleCount: number;
  scale: number;
  source: "measured" | "height";
}

export interface WalkPaceProjection extends Pick<RouteProjection, "traveledDistanceMeters"> {
  accuracy?: number;
}

export interface WalkPaceSample {
  speedMps: number;
  distanceMeters: number;
  elapsedSeconds: number;
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function collectPaceSample(
  prevProjection: WalkPaceProjection | null,
  nextProjection: WalkPaceProjection | null,
  elapsedSeconds: number,
  currentSegmentType: RouteSegmentType | null | undefined,
): WalkPaceSample | null {
  if (!prevProjection || !nextProjection || !isWalkingSegmentType(currentSegmentType) || elapsedSeconds <= 0) {
    return null;
  }

  const accuracy = Math.max(prevProjection.accuracy ?? 0, nextProjection.accuracy ?? 0);

  if (accuracy > MAX_SAMPLE_ACCURACY_METERS) {
    return null;
  }

  const distanceMeters = nextProjection.traveledDistanceMeters - prevProjection.traveledDistanceMeters;

  if (distanceMeters < MIN_SAMPLE_DISTANCE_METERS) {
    return null;
  }

  const speedMps = distanceMeters / elapsedSeconds;

  if (speedMps < MIN_VALID_WALK_SPEED_MPS || speedMps > MAX_VALID_WALK_SPEED_MPS) {
    return null;
  }

  return {
    speedMps,
    distanceMeters,
    elapsedSeconds,
  };
}

export function updateWalkProfile(
  profile: WalkProfile | null,
  sampleSpeedMps: number,
  now = new Date(),
): WalkProfile {
  const speedMps = profile
    ? profile.speedMps * (1 - WALK_PROFILE_ALPHA) + sampleSpeedMps * WALK_PROFILE_ALPHA
    : sampleSpeedMps;

  return {
    speedMps,
    sampleCount: (profile?.sampleCount ?? 0) + 1,
    updatedAt: now.toISOString(),
    ...(typeof profile?.heightCm === "number" ? { heightCm: profile.heightCm } : {}),
  };
}

export function isWalkProfileMature(profile: WalkProfile | null): profile is WalkProfile {
  return Boolean(
    profile &&
      Number.isFinite(profile.speedMps) &&
      profile.speedMps > 0 &&
      profile.sampleCount >= WALK_PROFILE_MIN_SAMPLES,
  );
}

export function estimateWalkSpeedFromHeightCm(heightCm: number): number {
  const estimatedSpeedMps = (heightCm / 100) * STRIDE_HEIGHT_RATIO * WALK_CADENCE_STEPS_PER_SEC;

  return clamp(
    Number.isFinite(estimatedSpeedMps) ? estimatedSpeedMps : MIN_VALID_WALK_SPEED_MPS,
    MIN_VALID_WALK_SPEED_MPS,
    MAX_VALID_WALK_SPEED_MPS,
  );
}

export function setWalkProfileHeight(
  profile: WalkProfile | null,
  heightCm: number,
  now = new Date(),
): WalkProfile {
  const clampedHeightCm = clamp(
    Number.isFinite(heightCm) ? heightCm : MIN_HEIGHT_CM,
    MIN_HEIGHT_CM,
    MAX_HEIGHT_CM,
  );

  if (profile) {
    return {
      ...profile,
      heightCm: clampedHeightCm,
    };
  }

  return {
    speedMps: estimateWalkSpeedFromHeightCm(clampedHeightCm),
    sampleCount: 0,
    heightCm: clampedHeightCm,
    updatedAt: now.toISOString(),
  };
}

export function getEffectiveWalkSpeed(
  profile: WalkProfile | null,
): { speedMps: number; source: "measured" | "height" } | null {
  if (isWalkProfileMature(profile)) {
    return {
      speedMps: profile.speedMps,
      source: "measured",
    };
  }

  if (
    profile &&
    Number.isFinite(profile.speedMps) &&
    profile.speedMps > 0 &&
    typeof profile.heightCm === "number" &&
    Number.isFinite(profile.heightCm) &&
    profile.heightCm >= MIN_HEIGHT_CM &&
    profile.heightCm <= MAX_HEIGHT_CM
  ) {
    return {
      speedMps: profile.speedMps,
      source: "height",
    };
  }

  return null;
}

export function getWalkDurationScale(speedMps: number): number {
  return clamp(
    DEFAULT_TMAP_WALK_SPEED_MPS / speedMps,
    MIN_WALK_DURATION_SCALE,
    MAX_WALK_DURATION_SCALE,
  );
}

export function applyWalkProfile(plan: EtaPlan, profile: WalkProfile | null, now = new Date()): EtaPlan {
  const effectiveWalkSpeed = getEffectiveWalkSpeed(profile);

  if (!profile || !effectiveWalkSpeed) {
    return plan;
  }

  const scale = getWalkDurationScale(effectiveWalkSpeed.speedMps);
  const scaledSegments = plan.segments.map((segment) => scaleWalkingSegmentDuration(segment, scale));
  const scaledPlan = createEtaPlanFromSegments({
    request: plan.request,
    mode: plan.mode,
    now,
    segments: scaledSegments,
    alternatives: plan.alternatives.map(toAlternativeInput),
    crossingCount: plan.crossingCount,
    source: plan.source,
    transitMeta: plan.transitMeta,
  });

  return {
    ...scaledPlan,
    walkProfileApplied: {
      speedMps: effectiveWalkSpeed.speedMps,
      sampleCount: profile.sampleCount,
      scale,
      source: effectiveWalkSpeed.source,
    },
  };
}

export function readWalkProfile(storage = getWalkProfileStorage()): WalkProfile | null {
  if (!storage) {
    return null;
  }

  try {
    const rawValue = storage.getItem(WALK_PROFILE_STORAGE_KEY);

    return rawValue ? parseStoredWalkProfile(JSON.parse(rawValue) as unknown) : null;
  } catch {
    return null;
  }
}

export function writeWalkProfile(profile: WalkProfile, storage = getWalkProfileStorage()): void {
  if (!storage) {
    return;
  }

  storage.setItem(WALK_PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function clearWalkProfile(storage = getWalkProfileStorage()): void {
  if (!storage) {
    return;
  }

  storage.removeItem(WALK_PROFILE_STORAGE_KEY);
}

export function formatWalkSpeedKmh(speedMps: number): string {
  return (speedMps * 3.6).toFixed(1);
}

function scaleWalkingSegmentDuration(segment: RouteSegment, scale: number): RouteSegment {
  if (!isWalkingSegmentType(segment.type)) {
    return segment;
  }

  return {
    ...segment,
    duration: Math.max(1, Math.round(segment.duration * scale)),
  };
}

function isWalkingSegmentType(type: RouteSegmentType | null | undefined): type is "walk" | "final_walk" {
  return type === "walk" || type === "final_walk";
}

function toAlternativeInput(alternative: AlternativeRoute) {
  return {
    id: alternative.id,
    label: alternative.label,
    detail: alternative.detail,
    duration: alternative.duration,
    transferCount: alternative.transferCount,
    fare: alternative.fare,
    crossingCount: alternative.crossingCount,
  };
}

function parseStoredWalkProfile(value: unknown): WalkProfile | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const speedMps = Number(record.speedMps);
  const sampleCount = Number(record.sampleCount);
  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : "";
  const updatedAtDate = new Date(updatedAt);
  const heightCm = Number(record.heightCm);
  const parsedHeightCm =
    Number.isFinite(heightCm) && heightCm >= MIN_HEIGHT_CM && heightCm <= MAX_HEIGHT_CM
      ? heightCm
      : undefined;

  if (!Number.isFinite(speedMps) || speedMps <= 0 || !Number.isInteger(sampleCount) || sampleCount < 0) {
    return null;
  }

  return {
    speedMps,
    sampleCount,
    updatedAt: Number.isFinite(updatedAtDate.getTime()) ? updatedAtDate.toISOString() : new Date(0).toISOString(),
    ...(typeof parsedHeightCm === "number" ? { heightCm: parsedHeightCm } : {}),
  };
}

function getWalkProfileStorage(): StorageAdapter | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
