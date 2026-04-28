export type ArrivalStrategy = "safe" | "balanced" | "ontime";
export type WalkingPace = "slow" | "normal" | "fast";
export type StatusVariant = "early" | "ontime" | "late" | "optimal";

export interface RoutePreferences {
  walkingPace: WalkingPace;
  transferBufferMinutes: number;
  signalBufferMinutes: number;
}

export interface RouteIntent {
  origin: string;
  destination: string;
  targetArrivalTime: string;
  strategy?: ArrivalStrategy;
  naturalLanguage?: string;
  context?: string;
  preferences?: Partial<RoutePreferences>;
}

export interface NormalizedRouteIntent {
  origin: string;
  destination: string;
  targetArrivalTime: string;
  strategy: ArrivalStrategy;
  naturalLanguage?: string;
  context?: string;
  preferences: RoutePreferences;
}

export interface RouteSegment {
  id: string;
  type: "walk" | "wait_signal" | "wait_boarding" | "ride" | "buffer";
  label: string;
  detail: string;
  durationMinutes: number;
  distanceMeters?: number;
}

export interface StrategyOption {
  strategy: ArrivalStrategy;
  label: string;
  recommendedDepartureTime: string;
  expectedArrivalTime: string;
  arrivalDeltaMinutes: number;
  badge: string;
}

export interface RoutePlan {
  request: NormalizedRouteIntent;
  summary: {
    recommendedDepartureTime: string;
    expectedArrivalTime: string;
    targetArrivalTime: string;
    totalDurationMinutes: number;
    arrivalDeltaMinutes: number;
    arrivalDeltaLabel: string;
    statusVariant: StatusVariant;
  };
  action: {
    title: string;
    description: string;
    tone: "primary" | "warning" | "success" | "neutral";
  };
  segments: RouteSegment[];
  strategies: StrategyOption[];
  alternatives: Array<{
    label: string;
    detail: string;
    durationMinutes: number;
    arrivalDeltaMinutes: number;
  }>;
  explanation: string;
}

const DEFAULT_PREFERENCES: RoutePreferences = {
  walkingPace: "normal",
  transferBufferMinutes: 2,
  signalBufferMinutes: 1,
};

const STRATEGY_LABELS: Record<ArrivalStrategy, string> = {
  safe: "안전 우선",
  balanced: "균형",
  ontime: "정시 우선",
};

const STRATEGY_EARLY_BUFFER: Record<ArrivalStrategy, number> = {
  safe: 5,
  balanced: 3,
  ontime: 0,
};

export function createDefaultRouteIntent(): RouteIntent {
  return {
    origin: "강남역 2번 출구",
    destination: "선릉역",
    targetArrivalTime: "10:00",
    strategy: "balanced",
    preferences: { ...DEFAULT_PREFERENCES },
  };
}

export function normalizeRouteIntent(intent: Partial<RouteIntent>): NormalizedRouteIntent {
  const defaults = createDefaultRouteIntent();
  const strategy = isArrivalStrategy(intent.strategy) ? intent.strategy : "balanced";

  return {
    origin: cleanText(intent.origin) || defaults.origin,
    destination: cleanText(intent.destination) || defaults.destination,
    targetArrivalTime: isTime(intent.targetArrivalTime)
      ? intent.targetArrivalTime
      : defaults.targetArrivalTime,
    strategy,
    preferences: {
      ...DEFAULT_PREFERENCES,
      ...intent.preferences,
      walkingPace: isWalkingPace(intent.preferences?.walkingPace)
        ? intent.preferences.walkingPace
        : DEFAULT_PREFERENCES.walkingPace,
    },
    naturalLanguage: intent.naturalLanguage,
    context: intent.context,
  };
}

export function buildRoutePlan(intent: Partial<RouteIntent>): RoutePlan {
  const request = normalizeRouteIntent(intent);
  const segments = buildSegments(request);
  const totalDurationMinutes = sumDurations(segments);
  const targetMinutes = parseTimeToMinutes(request.targetArrivalTime);
  const strategyBuffer = STRATEGY_EARLY_BUFFER[request.strategy];
  const expectedArrivalMinutes = targetMinutes - strategyBuffer;
  const recommendedDepartureMinutes = expectedArrivalMinutes - totalDurationMinutes;
  const arrivalDeltaMinutes = expectedArrivalMinutes - targetMinutes;

  const strategies = (["safe", "balanced", "ontime"] as ArrivalStrategy[]).map((strategy) => {
    const earlyBuffer = STRATEGY_EARLY_BUFFER[strategy];
    const expected = targetMinutes - earlyBuffer;
    const departure = expected - totalDurationMinutes;
    const delta = expected - targetMinutes;

    return {
      strategy,
      label: STRATEGY_LABELS[strategy],
      recommendedDepartureTime: formatMinutesAsTime(departure),
      expectedArrivalTime: formatMinutesAsTime(expected),
      arrivalDeltaMinutes: delta,
      badge: formatArrivalDelta(delta),
    };
  });

  return {
    request,
    summary: {
      recommendedDepartureTime: formatMinutesAsTime(recommendedDepartureMinutes),
      expectedArrivalTime: formatMinutesAsTime(expectedArrivalMinutes),
      targetArrivalTime: request.targetArrivalTime,
      totalDurationMinutes,
      arrivalDeltaMinutes,
      arrivalDeltaLabel: formatArrivalDelta(arrivalDeltaMinutes),
      statusVariant: getStatusVariant(arrivalDeltaMinutes),
    },
    action: buildAction(request, arrivalDeltaMinutes),
    segments,
    strategies,
    alternatives: buildAlternatives(totalDurationMinutes),
    explanation: buildExplanation(request, totalDurationMinutes, arrivalDeltaMinutes),
  };
}

export function formatArrivalDelta(deltaMinutes: number): string {
  if (deltaMinutes === 0) {
    return "정시 도착";
  }

  const absoluteMinutes = Math.abs(deltaMinutes);
  return deltaMinutes < 0
    ? `${absoluteMinutes}분 빠름`
    : `${absoluteMinutes}분 늦음`;
}

export function getStatusVariant(deltaMinutes: number): StatusVariant {
  if (deltaMinutes === 0) {
    return "ontime";
  }

  return deltaMinutes < 0 ? "early" : "late";
}

function buildSegments(request: RoutePlan["request"]): RouteSegment[] {
  const walkMultiplier = getWalkMultiplier(request.preferences.walkingPace);
  const firstWalk = Math.max(2, Math.round(3 * walkMultiplier));
  const lastWalk = Math.max(2, Math.round(2 * walkMultiplier));
  const signalWait = Math.max(1, request.preferences.signalBufferMinutes);
  const rideDuration = inferRideDuration(request.origin, request.destination);

  return [
    {
      id: "origin-walk",
      type: "walk",
      label: "도보 이동",
      detail: "승강장 또는 첫 이동 지점까지",
      durationMinutes: firstWalk,
      distanceMeters: 250,
    },
    {
      id: "signal-wait",
      type: "wait_signal",
      label: "횡단보도 대기",
      detail: "실시간 신호 정보를 반영하는 구간",
      durationMinutes: signalWait,
    },
    {
      id: "boarding-wait",
      type: "wait_boarding",
      label: "탑승 대기",
      detail: "다음 교통수단 도착까지",
      durationMinutes: 3,
    },
    {
      id: "main-ride",
      type: "ride",
      label: "주 이동 구간",
      detail: `${request.origin}에서 ${request.destination} 방향`,
      durationMinutes: rideDuration,
    },
    {
      id: "destination-walk",
      type: "walk",
      label: "하차 후 도보",
      detail: "목적지 입구까지",
      durationMinutes: lastWalk,
      distanceMeters: 120,
    },
  ];
}

function buildAction(
  request: RoutePlan["request"],
  deltaMinutes: number
): RoutePlan["action"] {
  const strategyName = STRATEGY_LABELS[request.strategy];

  if (deltaMinutes === 0) {
    return {
      title: "정시 우선 전략으로 출발하세요",
      description: "여유 시간을 최소화해 목표 시각에 맞춰 도착하도록 계산했습니다",
      tone: "success",
    };
  }

  if (deltaMinutes < 0) {
    return {
      title: `${strategyName} 기준 출발 권장`,
      description: "조금 일찍 도착하는 버퍼를 두고 지각 가능성을 낮추는 판단입니다",
      tone: request.strategy === "safe" ? "success" : "primary",
    };
  }

  return {
    title: "출발 시각을 앞당기세요",
    description: "현재 조건에서는 목표 시각보다 늦을 가능성이 있어 버퍼 조정이 필요합니다",
    tone: "warning",
  };
}

function buildAlternatives(totalDurationMinutes: number): RoutePlan["alternatives"] {
  return [
    {
      label: "버스 + 도보",
      detail: "배차 간격과 신호 대기 영향이 큰 경로",
      durationMinutes: totalDurationMinutes + 4,
      arrivalDeltaMinutes: 1,
    },
    {
      label: "도보 전체",
      detail: "대기 시간은 적지만 전체 소요 시간이 긴 경로",
      durationMinutes: totalDurationMinutes + 18,
      arrivalDeltaMinutes: 15,
    },
  ];
}

function buildExplanation(
  request: RoutePlan["request"],
  totalDurationMinutes: number,
  deltaMinutes: number
): string {
  return `${request.origin}에서 ${request.destination}까지 약 ${totalDurationMinutes}분이 걸리는 경로입니다. ${request.targetArrivalTime} 도착 목표에 맞춰 ${formatArrivalDelta(deltaMinutes)} 전략으로 안내합니다.`;
}

function cleanText(value?: string): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function isTime(value?: string): value is string {
  return Boolean(value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
}

function isArrivalStrategy(value?: string): value is ArrivalStrategy {
  return value === "safe" || value === "balanced" || value === "ontime";
}

function isWalkingPace(value?: string): value is WalkingPace {
  return value === "slow" || value === "normal" || value === "fast";
}

function parseTimeToMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function formatMinutesAsTime(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function sumDurations(segments: RouteSegment[]): number {
  return segments.reduce((sum, segment) => sum + segment.durationMinutes, 0);
}

function getWalkMultiplier(pace: WalkingPace): number {
  if (pace === "slow") {
    return 1.25;
  }

  if (pace === "fast") {
    return 0.85;
  }

  return 1;
}

function inferRideDuration(origin: string, destination: string): number {
  const normalized = `${origin} ${destination}`;

  if (normalized.includes("홍대") || normalized.includes("합정")) {
    return 7;
  }

  if (normalized.includes("서울역") || normalized.includes("광화문")) {
    return 18;
  }

  return 16;
}
