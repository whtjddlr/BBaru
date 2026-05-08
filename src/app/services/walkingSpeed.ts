import type { RoutePlan, RoutePoint, RoutePreferences } from "../domain/eta";

type SpeedStatus = "waiting" | "calibrating" | "live" | "low_accuracy" | "paused";

interface StoredSpeedBucket {
  metersPerMinute: number;
  sampleCount: number;
  confidence: number;
  updatedAt: string;
}

interface StoredSpeedStore {
  version: 1;
  global?: StoredSpeedBucket;
  routes?: Record<string, StoredSpeedBucket>;
}

export interface LearnedWalkingSpeed {
  metersPerMinute: number;
  sampleCount: number;
  confidence: number;
  updatedAt: string;
  source: "route" | "global";
}

interface TrackerPoint {
  lat: number;
  lng: number;
  accuracyMeters: number;
  timestampMs: number;
  speedMetersPerSecond?: number;
}

export interface WalkingSpeedReading {
  status: SpeedStatus;
  currentMetersPerMinute?: number;
  learnedMetersPerMinute?: number;
  fallbackMetersPerMinute: number;
  confidence: number;
  acceptedSamples: number;
  rejectedSamples: number;
  accuracyMeters?: number;
  sourceLabel: string;
  detail: string;
}

export interface WalkingSpeedTrackerState {
  routeKey: string;
  lastPoint?: TrackerPoint;
  recentSpeeds: number[];
  acceptedSamples: number;
  rejectedSamples: number;
  reading: WalkingSpeedReading;
}

const STORAGE_KEY = "bbaru.walkingSpeed.v1";
const MAX_STORED_ROUTES = 12;
const MAX_ACCEPTED_ACCURACY_METERS = 45;
const MAX_LOW_ACCURACY_METERS = 75;
const MIN_SAMPLE_SECONDS = 2;
const MAX_SAMPLE_SECONDS = 35;
const MIN_WALKING_METERS_PER_MINUTE = 15;
const MAX_WALKING_METERS_PER_MINUTE = 175;
const PAUSED_METERS_PER_MINUTE = 12;

export function createWalkingSpeedTrackerState(
  routePlan: RoutePlan
): WalkingSpeedTrackerState {
  const routeKey = getRouteSpeedKey(routePlan);
  const reading = createInitialWalkingSpeedReading(routePlan);

  return {
    routeKey,
    recentSpeeds: [],
    acceptedSamples: 0,
    rejectedSamples: 0,
    reading,
  };
}

export function createInitialWalkingSpeedReading(routePlan: RoutePlan): WalkingSpeedReading {
  const fallbackMetersPerMinute = getFallbackWalkingMetersPerMinute(
    routePlan.request.preferences
  );
  const learnedMetersPerMinute = getLearnedWalkingMetersPerMinute(routePlan);

  return {
    status: "waiting",
    learnedMetersPerMinute,
    fallbackMetersPerMinute,
    confidence: getStoredConfidence(routePlan),
    acceptedSamples: 0,
    rejectedSamples: 0,
    sourceLabel: learnedMetersPerMinute ? "평균 학습" : "프로필",
    detail: "위치 샘플 대기 중",
  };
}

export function addWalkingSpeedPosition(
  state: WalkingSpeedTrackerState,
  point: RoutePoint,
  routePlan: RoutePlan
): WalkingSpeedTrackerState {
  const normalizedPoint = normalizeTrackerPoint(point);
  const fallbackMetersPerMinute = getFallbackWalkingMetersPerMinute(
    routePlan.request.preferences
  );
  const learnedMetersPerMinute = getLearnedWalkingMetersPerMinute(routePlan);

  if (!normalizedPoint) {
    return {
      ...state,
      reading: {
        ...state.reading,
        status: "waiting",
        learnedMetersPerMinute,
        fallbackMetersPerMinute,
        detail: "위치 샘플 대기 중",
      },
    };
  }

  if (normalizedPoint.accuracyMeters > MAX_LOW_ACCURACY_METERS) {
    return {
      ...state,
      rejectedSamples: state.rejectedSamples + 1,
      reading: {
        status: "low_accuracy",
        learnedMetersPerMinute,
        fallbackMetersPerMinute,
        confidence: getStoredConfidence(routePlan),
        acceptedSamples: state.acceptedSamples,
        rejectedSamples: state.rejectedSamples + 1,
        accuracyMeters: Math.round(normalizedPoint.accuracyMeters),
        sourceLabel: learnedMetersPerMinute ? "평균 학습" : "프로필",
        detail: `GPS 오차 ${Math.round(normalizedPoint.accuracyMeters)}m`,
      },
    };
  }

  if (!state.lastPoint) {
    return {
      ...state,
      lastPoint: normalizedPoint,
      reading: {
        status: "calibrating",
        learnedMetersPerMinute,
        fallbackMetersPerMinute,
        confidence: getStoredConfidence(routePlan),
        acceptedSamples: state.acceptedSamples,
        rejectedSamples: state.rejectedSamples,
        accuracyMeters: Math.round(normalizedPoint.accuracyMeters),
        sourceLabel: learnedMetersPerMinute ? "평균 학습" : "프로필",
        detail: "좋은 위치 샘플을 모으는 중",
      },
    };
  }

  const sample = deriveWalkingSpeedSample(state.lastPoint, normalizedPoint);

  if (sample.status === "paused") {
    return {
      ...state,
      lastPoint: normalizedPoint,
      reading: {
        status: "paused",
        learnedMetersPerMinute,
        fallbackMetersPerMinute,
        confidence: getStoredConfidence(routePlan),
        acceptedSamples: state.acceptedSamples,
        rejectedSamples: state.rejectedSamples,
        accuracyMeters: Math.round(normalizedPoint.accuracyMeters),
        sourceLabel: learnedMetersPerMinute ? "평균 학습" : "프로필",
        detail: "정지/대기 구간은 평균에서 제외",
      },
    };
  }

  if (!sample.metersPerMinute) {
    return {
      ...state,
      lastPoint: normalizedPoint,
      rejectedSamples: state.rejectedSamples + 1,
      reading: {
        status:
          normalizedPoint.accuracyMeters > MAX_ACCEPTED_ACCURACY_METERS
            ? "low_accuracy"
            : "calibrating",
        learnedMetersPerMinute,
        fallbackMetersPerMinute,
        confidence: getStoredConfidence(routePlan),
        acceptedSamples: state.acceptedSamples,
        rejectedSamples: state.rejectedSamples + 1,
        accuracyMeters: Math.round(normalizedPoint.accuracyMeters),
        sourceLabel: learnedMetersPerMinute ? "평균 학습" : "프로필",
        detail: sample.reason ?? "불안정한 속도 샘플 제외",
      },
    };
  }

  const recentSpeeds = [...state.recentSpeeds, sample.metersPerMinute].slice(-7);
  const currentMetersPerMinute = Math.round(getMedian(recentSpeeds));
  updateStoredWalkingSpeed(routePlan, currentMetersPerMinute, sample.quality);
  const nextLearnedMetersPerMinute = getLearnedWalkingMetersPerMinute(routePlan);

  return {
    ...state,
    lastPoint: normalizedPoint,
    recentSpeeds,
    acceptedSamples: state.acceptedSamples + 1,
    reading: {
      status: "live",
      currentMetersPerMinute,
      learnedMetersPerMinute: nextLearnedMetersPerMinute,
      fallbackMetersPerMinute,
      confidence: Math.max(getStoredConfidence(routePlan), sample.quality),
      acceptedSamples: state.acceptedSamples + 1,
      rejectedSamples: state.rejectedSamples,
      accuracyMeters: Math.round(normalizedPoint.accuracyMeters),
      sourceLabel: "GPS 실측",
      detail: "실제 보행 속도로 평균 업데이트 중",
    },
  };
}

export function getFallbackWalkingMetersPerMinute(preferences: RoutePreferences) {
  const stepLengthMeters = Math.max(0.45, Math.min(0.95, preferences.stepLengthCm / 100));
  const stepsPerMinute = 104;

  return Math.round(stepLengthMeters * stepsPerMinute);
}

export function getLearnedWalkingSpeed(
  origin?: string,
  destination?: string
): LearnedWalkingSpeed | undefined {
  const store = readWalkingSpeedStore();
  const routeKey = origin && destination ? getRouteSpeedKeyFromText(origin, destination) : undefined;
  const routeBucket = routeKey ? store.routes?.[routeKey] : undefined;

  if (routeBucket && routeBucket.sampleCount >= 4) {
    return toLearnedWalkingSpeed(routeBucket, "route");
  }

  if (store.global) {
    return toLearnedWalkingSpeed(store.global, "global");
  }

  return undefined;
}

export function resetLearnedWalkingSpeed() {
  writeWalkingSpeedStore({ version: 1, routes: {} });
}

function normalizeTrackerPoint(point: RoutePoint): TrackerPoint | undefined {
  const lat = Number(point.lat);
  const lng = Number(point.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return undefined;
  }

  const accuracyMeters = Number.isFinite(point.accuracyMeters)
    ? Math.max(0, Number(point.accuracyMeters))
    : MAX_LOW_ACCURACY_METERS;
  const timestampMs = Number.isFinite(point.timestampMs)
    ? Number(point.timestampMs)
    : Date.now();
  const speedMetersPerSecond = Number.isFinite(point.speedMetersPerSecond)
    ? Math.max(0, Number(point.speedMetersPerSecond))
    : undefined;

  return {
    lat,
    lng,
    accuracyMeters,
    timestampMs,
    speedMetersPerSecond,
  };
}

function deriveWalkingSpeedSample(previous: TrackerPoint, current: TrackerPoint) {
  if (
    current.speedMetersPerSecond !== undefined &&
    current.accuracyMeters <= MAX_ACCEPTED_ACCURACY_METERS
  ) {
    const metersPerMinute = current.speedMetersPerSecond * 60;
    return validateWalkingSpeed(metersPerMinute, current.accuracyMeters);
  }

  const seconds = (current.timestampMs - previous.timestampMs) / 1000;

  if (seconds < MIN_SAMPLE_SECONDS || seconds > MAX_SAMPLE_SECONDS) {
    return {
      reason: "샘플 간격이 불안정해 제외",
    };
  }

  const distanceMeters = getDistanceMeters(previous, current);
  const noiseFloorMeters = Math.max(
    3,
    Math.min(28, (previous.accuracyMeters + current.accuracyMeters) * 0.35)
  );

  if (distanceMeters < noiseFloorMeters) {
    return {
      status: "paused" as const,
      reason: "정지/대기 구간",
    };
  }

  const metersPerMinute = (distanceMeters / seconds) * 60;
  return validateWalkingSpeed(metersPerMinute, current.accuracyMeters);
}

function validateWalkingSpeed(metersPerMinute: number, accuracyMeters: number) {
  if (metersPerMinute <= PAUSED_METERS_PER_MINUTE) {
    return {
      status: "paused" as const,
      reason: "정지/대기 구간",
    };
  }

  if (
    metersPerMinute < MIN_WALKING_METERS_PER_MINUTE ||
    metersPerMinute > MAX_WALKING_METERS_PER_MINUTE
  ) {
    return {
      reason: "보행 범위를 벗어난 속도 제외",
    };
  }

  if (accuracyMeters > MAX_ACCEPTED_ACCURACY_METERS) {
    return {
      reason: `GPS 오차 ${Math.round(accuracyMeters)}m`,
    };
  }

  return {
    metersPerMinute,
    quality: getAccuracyQuality(accuracyMeters),
  };
}

function getAccuracyQuality(accuracyMeters: number) {
  if (accuracyMeters <= 12) {
    return 0.95;
  }

  if (accuracyMeters <= 25) {
    return 0.78;
  }

  return 0.55;
}

function getLearnedWalkingMetersPerMinute(routePlan: RoutePlan) {
  return getLearnedWalkingSpeed(
    routePlan.request.origin,
    routePlan.request.destination
  )?.metersPerMinute;
}

function getStoredConfidence(routePlan: RoutePlan) {
  return (
    getLearnedWalkingSpeed(routePlan.request.origin, routePlan.request.destination)
      ?.confidence ?? 0
  );
}

function updateStoredWalkingSpeed(
  routePlan: RoutePlan,
  metersPerMinute: number,
  quality: number
) {
  const store = readWalkingSpeedStore();
  const now = new Date().toISOString();
  const routeKey = getRouteSpeedKey(routePlan);

  store.global = mergeSpeedBucket(store.global, metersPerMinute, quality, now);
  store.routes = {
    ...(store.routes ?? {}),
    [routeKey]: mergeSpeedBucket(store.routes?.[routeKey], metersPerMinute, quality, now),
  };
  store.routes = trimRouteBuckets(store.routes);

  writeWalkingSpeedStore(store);
}

function mergeSpeedBucket(
  bucket: StoredSpeedBucket | undefined,
  metersPerMinute: number,
  quality: number,
  updatedAt: string
): StoredSpeedBucket {
  if (!bucket) {
    return {
      metersPerMinute,
      sampleCount: 1,
      confidence: Math.min(0.95, 0.25 + quality * 0.45),
      updatedAt,
    };
  }

  const cappedCount = Math.min(bucket.sampleCount, 120);
  const weightedCount = cappedCount + quality;
  const nextMetersPerMinute =
    (bucket.metersPerMinute * cappedCount + metersPerMinute * quality) / weightedCount;
  const sampleCount = bucket.sampleCount + 1;

  return {
    metersPerMinute: Math.round(nextMetersPerMinute),
    sampleCount,
    confidence: Math.min(0.95, Math.max(bucket.confidence, sampleCount / 30) * (0.7 + quality * 0.3)),
    updatedAt,
  };
}

function trimRouteBuckets(routes?: Record<string, StoredSpeedBucket>) {
  const entries = Object.entries(routes ?? {}).sort(
    ([, first], [, second]) =>
      new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime()
  );

  return Object.fromEntries(entries.slice(0, MAX_STORED_ROUTES));
}

function readWalkingSpeedStore(): StoredSpeedStore {
  if (typeof window === "undefined") {
    return { version: 1, routes: {} };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return { version: 1, routes: {} };
    }

    const parsed = JSON.parse(raw) as StoredSpeedStore;

    return {
      version: 1,
      global: normalizeBucket(parsed.global),
      routes: normalizeRoutes(parsed.routes),
    };
  } catch {
    return { version: 1, routes: {} };
  }
}

function writeWalkingSpeedStore(store: StoredSpeedStore) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage failures; live speed still works for the session.
  }
}

function normalizeRoutes(routes?: Record<string, StoredSpeedBucket>) {
  if (!routes) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(routes)
      .map(([key, bucket]) => [key, normalizeBucket(bucket)] as const)
      .filter(([, bucket]) => Boolean(bucket))
  ) as Record<string, StoredSpeedBucket>;
}

function normalizeBucket(bucket?: StoredSpeedBucket) {
  if (
    !bucket ||
    !Number.isFinite(bucket.metersPerMinute) ||
    !Number.isFinite(bucket.sampleCount)
  ) {
    return undefined;
  }

  return {
    metersPerMinute: Math.max(
      MIN_WALKING_METERS_PER_MINUTE,
      Math.min(MAX_WALKING_METERS_PER_MINUTE, Math.round(bucket.metersPerMinute))
    ),
    sampleCount: Math.max(0, Math.round(bucket.sampleCount)),
    confidence: Math.max(0, Math.min(0.95, Number(bucket.confidence) || 0)),
    updatedAt: bucket.updatedAt || new Date().toISOString(),
  };
}

function toLearnedWalkingSpeed(
  bucket: StoredSpeedBucket,
  source: LearnedWalkingSpeed["source"]
): LearnedWalkingSpeed {
  return {
    metersPerMinute: Math.round(bucket.metersPerMinute),
    sampleCount: bucket.sampleCount,
    confidence: bucket.confidence,
    updatedAt: bucket.updatedAt,
    source,
  };
}

function getRouteSpeedKey(routePlan: RoutePlan) {
  return getRouteSpeedKeyFromText(routePlan.request.origin, routePlan.request.destination);
}

function getRouteSpeedKeyFromText(origin: string, destination: string) {
  const source = `${origin}->${destination}`
    .trim()
    .toLowerCase();

  return `route:${hashText(source)}`;
}

function hashText(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function getMedian(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  }

  return sorted[midpoint];
}

function getDistanceMeters(first: TrackerPoint, second: TrackerPoint) {
  const earthRadiusMeters = 6_371_000;
  const firstLat = toRadians(first.lat);
  const secondLat = toRadians(second.lat);
  const deltaLat = toRadians(second.lat - first.lat);
  const deltaLng = toRadians(second.lng - first.lng);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(firstLat) *
      Math.cos(secondLat) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}
