export type EtaMode = "safe" | "balanced" | "punctual";

export interface EtaSearchRequest {
  origin: string;
  destination: string;
  targetTime: string;
  originPoint?: GeoPoint;
  destinationPoint?: GeoPoint;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export type RouteSegmentType = "walk" | "wait_signal" | "subway" | "bus" | "final_walk";

export interface RouteSegment {
  id: string;
  type: RouteSegmentType;
  label: string;
  duration: number;
  distance?: number;
  line?: string;
  route?: string;
  routeColor?: string;
  stationCount?: number;
  geometry?: GeoPoint[];
  detail?: string;
}

export interface AlternativeRoute {
  id: string;
  label: string;
  detail: string;
  duration: number;
  expectedArrival: Date;
  deviationMinutes: number;
  transferCount?: number;
  fare?: number;
  crossingCount?: number;
}

export interface EtaPlan {
  request: EtaSearchRequest;
  mode: EtaMode;
  seed: number;
  segments: RouteSegment[];
  alternatives: AlternativeRoute[];
  targetArrival: Date;
  recommendedDeparture: Date;
  expectedArrival: Date;
  totalDuration: number;
  bufferSeconds: number;
  deviationMinutes: number;
  stats: {
    walking: number;
    waiting: number;
    riding: number;
  };
  status: EtaStatus;
  crossingCount?: number;
  source?: "mock" | "tmap";
  transitMeta?: {
    transferCount?: number;
    fare?: number;
  };
}

export interface EtaStatus {
  kind: "ready" | "wait" | "late" | "target_passed";
  label: string;
  description: string;
  minutesUntilDeparture?: number;
  minutesLate?: number;
}

export const ETA_MODES: Record<EtaMode, { label: string; bufferSeconds: number }> = {
  safe: { label: "안전 우선", bufferSeconds: 5 * 60 },
  balanced: { label: "균형", bufferSeconds: 3 * 60 },
  punctual: { label: "정시 우선", bufferSeconds: 1 * 60 },
};

export interface AlternativeRouteInput {
  id: string;
  label: string;
  detail: string;
  duration: number;
  transferCount?: number;
  fare?: number;
  crossingCount?: number;
}

export interface EtaPlanFromSegmentsInput {
  request: EtaSearchRequest;
  mode: EtaMode;
  now: Date;
  segments: RouteSegment[];
  totalDuration?: number;
  alternatives?: AlternativeRouteInput[];
  crossingCount?: number;
  source?: "mock" | "tmap";
  transitMeta?: EtaPlan["transitMeta"];
}

export function createEtaPlan(
  request: EtaSearchRequest,
  mode: EtaMode,
  now: Date,
): EtaPlan {
  const normalizedRequest = normalizeRequest(request);
  const seed = hashRoute(normalizedRequest);
  const segments = createSegments(normalizedRequest, seed);
  const totalDuration = sumDuration(segments);

  return createEtaPlanFromSegments({
    request: normalizedRequest,
    mode,
    now,
    segments,
    totalDuration,
    alternatives: createMockAlternativeInputs(seed, totalDuration),
    source: "mock",
  });
}

export function createEtaPlanFromSegments({
  request,
  mode,
  now,
  segments,
  totalDuration = sumDuration(segments),
  alternatives = [],
  crossingCount,
  source,
  transitMeta,
}: EtaPlanFromSegmentsInput): EtaPlan {
  const normalizedRequest = normalizeRequest(request);
  const seed = hashRoute(normalizedRequest);
  const targetArrival = parseTargetTime(normalizedRequest.targetTime, now);
  const bufferSeconds = ETA_MODES[mode].bufferSeconds;
  const recommendedDeparture = addSeconds(targetArrival, -(totalDuration + bufferSeconds));
  const status = createStatus(now, targetArrival, recommendedDeparture);
  const effectiveDeparture =
    status.kind === "late" || status.kind === "target_passed" ? now : recommendedDeparture;
  const expectedArrival = addSeconds(effectiveDeparture, totalDuration);
  const deviationMinutes = Math.round((expectedArrival.getTime() - targetArrival.getTime()) / 60000);
  const stats = summarizeSegments(segments);

  return {
    request: normalizedRequest,
    mode,
    seed,
    segments,
    alternatives: alternatives.map((alternative) =>
      createAlternative(
        alternative.id,
        alternative.label,
        alternative.detail,
        alternative.duration,
        effectiveDeparture,
        targetArrival,
        {
          transferCount: alternative.transferCount,
          fare: alternative.fare,
          crossingCount: alternative.crossingCount,
        },
      ),
    ),
    targetArrival,
    recommendedDeparture,
    expectedArrival,
    totalDuration,
    bufferSeconds,
    deviationMinutes,
    stats,
    status,
    crossingCount,
    source,
    transitMeta,
  };
}

export function normalizeRequest(request: EtaSearchRequest): EtaSearchRequest {
  const normalizedRequest: EtaSearchRequest = {
    origin: request.origin.trim(),
    destination: request.destination.trim(),
    targetTime: request.targetTime,
  };

  if (request.originPoint) {
    normalizedRequest.originPoint = request.originPoint;
  }

  if (request.destinationPoint) {
    normalizedRequest.destinationPoint = request.destinationPoint;
  }

  return normalizedRequest;
}

export function parseTargetTime(targetTime: string, baseDate: Date): Date {
  const [hourValue, minuteValue] = targetTime.split(":");
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const target = new Date(baseDate);

  target.setHours(Number.isFinite(hour) ? hour : 10, Number.isFinite(minute) ? minute : 0, 0, 0);

  const elapsedSinceTarget = baseDate.getTime() - target.getTime();
  const rolloverThresholdMs = 6 * 60 * 60 * 1000;

  if (elapsedSinceTarget > rolloverThresholdMs) {
    target.setDate(target.getDate() + 1);
  }

  return target;
}

export function formatClock(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  if (minutes === 0) {
    return `${remainder}초`;
  }

  if (remainder === 0) {
    return `${minutes}분`;
  }

  return `${minutes}분 ${remainder}초`;
}

export function formatDurationCompact(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));

  if (seconds < 60) {
    return `${seconds}초`;
  }

  return `${Math.round(seconds / 60)}분`;
}

export function formatDeviation(minutes: number): string {
  if (minutes < 0) {
    return `${Math.abs(minutes)}분 빠름`;
  }

  if (minutes > 0) {
    return `${minutes}분 늦음`;
  }

  return "정시";
}

export function deviationBadgeVariant(minutes: number): "early" | "ontime" | "late" {
  if (minutes < 0) {
    return "early";
  }

  if (minutes > 0) {
    return "late";
  }

  return "ontime";
}

function createSegments(request: EtaSearchRequest, seed: number): RouteSegment[] {
  const random = createRandom(seed);
  const line = `${randomInt(random, 2, 9)}호선`;
  const firstWalkMinutes = randomInt(random, 2, 8);
  const finalWalkMinutes = randomInt(random, 1, 4);
  const signalSeconds = randomInt(random, 30, 90);
  const subwayMinutes = randomInt(random, 3, 15);
  const firstWalkDistance = randomInt(random, 180, 620);
  const finalWalkDistance = randomInt(random, 90, 360);
  const stationCount = Math.max(1, Math.round(subwayMinutes / 4));

  return [
    {
      id: "walk-to-station",
      type: "walk",
      label: "도보 이동",
      duration: firstWalkMinutes * 60,
      distance: firstWalkDistance,
      detail: `${request.origin}에서 ${line} 승강장까지`,
    },
    {
      id: "signal-wait",
      type: "wait_signal",
      label: "횡단보도 신호 대기",
      duration: signalSeconds,
      detail: "실시간 신호 반영",
    },
    {
      id: "subway-ride",
      type: "subway",
      label: `${line} 탑승`,
      duration: subwayMinutes * 60,
      line,
      detail: `${request.origin} → ${request.destination} (${stationCount}개 역)`,
    },
    {
      id: "walk-to-destination",
      type: "final_walk",
      label: "하차 후 도보",
      duration: finalWalkMinutes * 60,
      distance: finalWalkDistance,
      detail: `${request.destination}까지 ${finalWalkDistance}m`,
    },
  ];
}

function createMockAlternativeInputs(seed: number, totalDuration: number): AlternativeRouteInput[] {
  const random = createRandom(seed ^ 0x9e3779b9);
  const busNumber = randomInt(random, 1000, 7799);
  const busDuration = Math.max(8 * 60, totalDuration + randomInt(random, -180, 720));
  const walkDuration = Math.max(12 * 60, totalDuration + randomInt(random, 900, 2400));
  const walkingDistance = (walkDuration / 60 / 12).toFixed(1);

  return [
    {
      id: "bus_walk",
      label: "버스 + 도보",
      detail: `${busNumber}번 버스 이용`,
      duration: busDuration,
    },
    {
      id: "walk_only",
      label: "도보 전체",
      detail: `직선 거리 ${walkingDistance}km`,
      duration: walkDuration,
    },
  ];
}

function createAlternatives(
  seed: number,
  totalDuration: number,
  departure: Date,
  targetArrival: Date,
): AlternativeRoute[] {
  const random = createRandom(seed ^ 0x9e3779b9);
  const busNumber = randomInt(random, 1000, 7799);
  const busDuration = Math.max(8 * 60, totalDuration + randomInt(random, -180, 720));
  const walkDuration = Math.max(12 * 60, totalDuration + randomInt(random, 900, 2400));
  const walkingDistance = (walkDuration / 60 / 12).toFixed(1);

  return [
    createAlternative("bus_walk", "버스 + 도보", `${busNumber}번 버스 이용`, busDuration, departure, targetArrival),
    createAlternative("walk_only", "도보 전체", `직선 거리 ${walkingDistance}km`, walkDuration, departure, targetArrival),
  ];
}

function createAlternative(
  id: AlternativeRoute["id"],
  label: string,
  detail: string,
  duration: number,
  departure: Date,
  targetArrival: Date,
  meta: Pick<AlternativeRoute, "transferCount" | "fare" | "crossingCount"> = {},
): AlternativeRoute {
  const expectedArrival = addSeconds(departure, duration);

  return {
    id,
    label,
    detail,
    duration,
    expectedArrival,
    deviationMinutes: Math.round((expectedArrival.getTime() - targetArrival.getTime()) / 60000),
    ...meta,
  };
}

export function createStatus(now: Date, targetArrival: Date, recommendedDeparture: Date): EtaStatus {
  if (targetArrival.getTime() < now.getTime()) {
    return {
      kind: "target_passed",
      label: "도착 목표 시각이 지났습니다",
      description: "목표 도착 시각을 현재 시각 이후로 다시 설정하세요.",
    };
  }

  const secondsUntilDeparture = Math.round((recommendedDeparture.getTime() - now.getTime()) / 1000);

  if (secondsUntilDeparture > 60) {
    const minutesUntilDeparture = Math.ceil(secondsUntilDeparture / 60);

    return {
      kind: "wait",
      label: `${minutesUntilDeparture}분 후 출발 권장`,
      description: "조금 기다렸다가 출발하면 목표 시각에 더 가깝게 도착합니다.",
      minutesUntilDeparture,
    };
  }

  if (secondsUntilDeparture < -60) {
    const minutesLate = Math.ceil(Math.abs(secondsUntilDeparture) / 60);

    return {
      kind: "late",
      label: "권장 출발 시각이 지남",
      description: "권장 출발 시각이 지났습니다. 서둘러 이동하세요.",
      minutesLate,
    };
  }

  return {
    kind: "ready",
    label: "지금 출발 가능",
    description: "현재 시각에 출발하면 목표 시각에 가장 가깝게 도착합니다.",
  };
}

function summarizeSegments(segments: RouteSegment[]): EtaPlan["stats"] {
  return {
    walking: segments
      .filter((segment) => segment.type === "walk" || segment.type === "final_walk")
      .reduce((sum, segment) => sum + segment.duration, 0),
    waiting: segments
      .filter((segment) => segment.type === "wait_signal")
      .reduce((sum, segment) => sum + segment.duration, 0),
    riding: segments
      .filter((segment) => segment.type === "subway" || segment.type === "bus")
      .reduce((sum, segment) => sum + segment.duration, 0),
  };
}

function sumDuration(segments: RouteSegment[]): number {
  return segments.reduce((sum, segment) => sum + segment.duration, 0);
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

function hashRoute(request: EtaSearchRequest): number {
  const value = `${request.origin.toLowerCase()}|${request.destination.toLowerCase()}`;
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(random: () => number, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
