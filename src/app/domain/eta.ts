export type ArrivalStrategy = "safe" | "balanced" | "ontime";
export type PlanningMode = "leaveNow" | "arriveBy";
export type WalkingPace = "slow" | "normal" | "fast";
export type HealthWalkingSource = "healthkit" | "health-connect";
export type StatusVariant = "early" | "ontime" | "late" | "optimal";
export type GuidanceTone = "primary" | "warning" | "success" | "neutral";

export interface RoutePreferences {
  walkingPace: WalkingPace;
  transferBufferMinutes: number;
  signalBufferMinutes: number;
  heightCm: number;
  stepLengthCm: number;
  manualWalkingMetersPerMinute?: number;
  healthWalkingMetersPerMinute?: number;
  healthWalkingSource?: HealthWalkingSource;
  healthWalkingUpdatedAt?: string;
  learnedWalkingMetersPerMinute?: number;
  learnedWalkingConfidence?: number;
}

export interface RoutePoint {
  lat: number;
  lng: number;
  name?: string;
  accuracyMeters?: number;
  speedMetersPerSecond?: number;
  timestampMs?: number;
}

export interface RouteIntent {
  origin: string;
  destination: string;
  targetArrivalTime?: string;
  departureTime?: string;
  planningMode?: PlanningMode;
  strategy?: ArrivalStrategy;
  naturalLanguage?: string;
  context?: string;
  preferences?: Partial<RoutePreferences>;
  originPoint?: RoutePoint;
  destinationPoint?: RoutePoint;
}

export interface NormalizedRouteIntent {
  origin: string;
  destination: string;
  targetArrivalTime: string;
  departureTime: string;
  planningMode: PlanningMode;
  strategy: ArrivalStrategy;
  naturalLanguage?: string;
  context?: string;
  preferences: RoutePreferences;
  originPoint?: RoutePoint;
  destinationPoint?: RoutePoint;
}

export interface RouteSegment {
  id: string;
  type: "walk" | "wait_signal" | "wait_boarding" | "ride" | "buffer";
  label: string;
  detail: string;
  durationMinutes: number;
  distanceMeters?: number;
  mode?: TransitLeg["mode"];
  isEstimated?: boolean;
  isUnavailable?: boolean;
}

export interface StrategyOption {
  strategy: ArrivalStrategy;
  label: string;
  recommendedDepartureTime: string;
  expectedArrivalTime: string;
  arrivalDeltaMinutes: number;
  badge: string;
}

export interface TrafficSignalPreview {
  id: string;
  crossingName: string;
  phase: "red" | "green";
  phaseLabel: string;
  remainingSeconds: number;
  nextPhaseLabel: string;
  nextPhaseSeconds: number;
  cycleSeconds: number;
  redSeconds: number;
  estimatedReachSeconds: number;
  passDistanceMeters: number;
  gpsAccuracyMeters?: number;
  gpsBufferSeconds: number;
  confidence: "estimated" | "realtime";
  updatedAtLabel: string;
}

export interface TransitLeg {
  mode: "subway" | "bus";
  routeName: string;
  startName: string;
  endName: string;
  durationMinutes: number;
  stationCount?: number;
  direction?: string;
  directionLabel?: string;
  routeId?: string;
  stationId?: string;
  arsId?: string;
  realtimeWaitMinutes?: number;
  realtimeMessage?: string;
  realtimeUpdatedAtLabel?: string;
}

export interface TransitPathStep {
  id: string;
  type: "walk" | "ride";
  durationMinutes: number;
  distanceMeters?: number;
  legIndex?: number;
}

export interface TransitRouteEstimate {
  provider: "odsay";
  routeOptionId: string;
  routeOptionLabel: string;
  routeMode: "bus" | "subway" | "mixed";
  sourceLabel: string;
  updatedAtLabel: string;
  isRealtime: boolean;
  totalDurationMinutes: number;
  firstWalkMinutes: number;
  lastWalkMinutes: number;
  walkDurationMinutes: number;
  walkDistanceMeters?: number;
  transitDurationMinutes: number;
  boardingWaitMinutes: number;
  payment?: number;
  firstStartStation?: string;
  lastEndStation?: string;
  mainTransitLabel: string;
  mainTransitDetail: string;
  legs: TransitLeg[];
  pathSteps?: TransitPathStep[];
}

export interface RoutePlan {
  request: NormalizedRouteIntent;
  summary: {
    planningMode: PlanningMode;
    departureTime: string;
    recommendedDepartureTime: string;
    expectedArrivalTime: string;
    currentExpectedArrivalTime: string;
    targetArrivalTime: string;
    totalDurationMinutes: number;
    arrivalDeltaMinutes: number;
    arrivalDeltaLabel: string;
    currentArrivalDeltaMinutes: number;
    currentArrivalDeltaLabel: string;
    departureAdjustmentMinutes: number;
    departureAdvice: {
      title: string;
      description: string;
      tone: GuidanceTone;
    };
    statusVariant: StatusVariant;
    isReliableEstimate: boolean;
    routeStatusLabel: string;
  };
  trafficSignal: TrafficSignalPreview;
  trafficSignals: TrafficSignalPreview[];
  action: {
    title: string;
    description: string;
    tone: GuidanceTone;
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
  transitEstimate?: TransitRouteEstimate;
}

export const DEFAULT_PREFERENCES: RoutePreferences = {
  walkingPace: "normal",
  transferBufferMinutes: 2,
  signalBufferMinutes: 1,
  heightCm: 170,
  stepLengthCm: 70,
};

const STRATEGY_LABELS: Record<ArrivalStrategy, string> = {
  safe: "여유 있게",
  balanced: "균형",
  ontime: "딱 맞춰",
};

const STRATEGY_EARLY_BUFFER: Record<ArrivalStrategy, number> = {
  safe: 15,
  balanced: 7,
  ontime: 1,
};
const SIGNAL_CYCLE_SECONDS = 90;
const SIGNAL_RED_SECONDS = 60;
const LATE_REPLAN_THRESHOLD_MINUTES = 2;
const EARLY_REPLAN_THRESHOLD_MINUTES = 5;
const DEFAULT_WALKING_STEPS_PER_MINUTE = 104;
const MIN_LEARNED_WALKING_METERS_PER_MINUTE = 15;
const MAX_LEARNED_WALKING_METERS_PER_MINUTE = 175;

export function createDefaultRouteIntent(): RouteIntent {
  return {
    origin: "",
    destination: "",
    targetArrivalTime: getDefaultArrivalTime(),
    departureTime: formatDateAsTime(new Date()),
    planningMode: "leaveNow",
    strategy: "balanced",
    preferences: { ...DEFAULT_PREFERENCES },
  };
}

export function normalizeRouteIntent(intent: Partial<RouteIntent>): NormalizedRouteIntent {
  const defaults = createDefaultRouteIntent();
  const preferences = normalizePreferences(intent.preferences);
  const planningMode: PlanningMode =
    intent.planningMode === "arriveBy" ? "arriveBy" : "leaveNow";
  const strategy = isArrivalStrategy(intent.strategy) ? intent.strategy : "balanced";

  return {
    origin: cleanText(intent.origin) || defaults.origin,
    destination: cleanText(intent.destination) || defaults.destination,
    targetArrivalTime: isTime(intent.targetArrivalTime)
      ? intent.targetArrivalTime
      : defaults.targetArrivalTime ?? getDefaultArrivalTime(),
    departureTime: isTime(intent.departureTime)
      ? intent.departureTime
      : formatDateAsTime(new Date()),
    planningMode,
    strategy,
    preferences,
    naturalLanguage: intent.naturalLanguage,
    context: intent.context,
    originPoint: normalizeRoutePoint(intent.originPoint),
    destinationPoint: normalizeRoutePoint(intent.destinationPoint),
  };
}

export function buildRoutePlan(
  intent: Partial<RouteIntent>,
  transitEstimate?: TransitRouteEstimate
): RoutePlan {
  const request = normalizeRouteIntent(intent);
  const segments = buildSegments(request, transitEstimate);
  const isReliableEstimate = Boolean(transitEstimate);
  const totalDurationMinutes = isReliableEstimate ? sumDurations(segments) : 0;
  const targetMinutes = parseTimeToMinutes(request.targetArrivalTime);
  const departureMinutes = parseTimeToMinutes(request.departureTime);
  const strategyBuffer = STRATEGY_EARLY_BUFFER[request.strategy];
  const isLeaveNow = request.planningMode === "leaveNow";
  const currentExpectedArrivalMinutes = departureMinutes + totalDurationMinutes;
  const expectedArrivalMinutes = isLeaveNow
    ? departureMinutes + totalDurationMinutes
    : targetMinutes - strategyBuffer;
  const recommendedDepartureMinutes = isLeaveNow
    ? departureMinutes
    : expectedArrivalMinutes - totalDurationMinutes;
  const arrivalDeltaMinutes = isLeaveNow ? 0 : expectedArrivalMinutes - targetMinutes;
  const currentArrivalDeltaMinutes = currentExpectedArrivalMinutes - targetMinutes;
  const departureAdjustmentMinutes = recommendedDepartureMinutes - departureMinutes;
  const trafficSignals = buildTrafficSignalPreviews(request, segments);
  const trafficSignal = trafficSignals[0];
  const expectedArrivalTime = formatMinutesAsTime(expectedArrivalMinutes);
  const currentExpectedArrivalTime = formatMinutesAsTime(currentExpectedArrivalMinutes);
  const recommendedDepartureTime = formatMinutesAsTime(recommendedDepartureMinutes);
  const departureAdvice = buildDepartureAdvice(
    request,
    totalDurationMinutes,
    currentExpectedArrivalTime,
    currentArrivalDeltaMinutes,
    recommendedDepartureTime,
    departureAdjustmentMinutes,
    transitEstimate
  );

  return {
    request,
    summary: {
      planningMode: request.planningMode,
      departureTime: recommendedDepartureTime,
      recommendedDepartureTime,
      expectedArrivalTime,
      currentExpectedArrivalTime,
      targetArrivalTime: request.targetArrivalTime,
      totalDurationMinutes,
      arrivalDeltaMinutes,
      arrivalDeltaLabel: isLeaveNow
        ? "현재 출발 기준"
        : formatArrivalDelta(arrivalDeltaMinutes),
      currentArrivalDeltaMinutes,
      currentArrivalDeltaLabel: formatArrivalDelta(currentArrivalDeltaMinutes),
      departureAdjustmentMinutes,
      departureAdvice,
      statusVariant: isLeaveNow ? "optimal" : getStatusVariant(arrivalDeltaMinutes),
      isReliableEstimate,
      routeStatusLabel: isReliableEstimate ? "실제 경로 반영" : "경로 확인 필요",
    },
    trafficSignal,
    trafficSignals,
    action: buildAction(
      request,
      totalDurationMinutes,
      expectedArrivalTime,
      arrivalDeltaMinutes,
      transitEstimate
    ),
    segments,
    strategies: buildStrategies(request, totalDurationMinutes),
    alternatives: [],
    explanation: buildExplanation(
      request,
      totalDurationMinutes,
      expectedArrivalTime,
      arrivalDeltaMinutes,
      transitEstimate
    ),
    transitEstimate,
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

function buildDepartureAdvice(
  request: RoutePlan["request"],
  totalDurationMinutes: number,
  currentExpectedArrivalTime: string,
  currentArrivalDeltaMinutes: number,
  recommendedDepartureTime: string,
  departureAdjustmentMinutes: number,
  transitEstimate?: TransitRouteEstimate
): RoutePlan["summary"]["departureAdvice"] {
  if (!transitEstimate) {
    return {
      title: "경로 계산 중",
      description: "실제 경로 확인 중",
      tone: "neutral",
    };
  }

  if (request.planningMode === "leaveNow") {
    return {
      title: `도착 ${currentExpectedArrivalTime}`,
      description: `총 ${totalDurationMinutes}분`,
      tone: "primary",
    };
  }

  if (currentArrivalDeltaMinutes > LATE_REPLAN_THRESHOLD_MINUTES) {
    return {
      title: `목표보다 ${currentArrivalDeltaMinutes}분 늦음`,
      description: `지금 출발 기준 ${currentExpectedArrivalTime} 도착`,
      tone: "warning",
    };
  }

  if (currentArrivalDeltaMinutes < -EARLY_REPLAN_THRESHOLD_MINUTES) {
    return {
      title: `${recommendedDepartureTime} 출발 가능`,
      description: `지금보다 ${Math.max(1, departureAdjustmentMinutes)}분 뒤`,
      tone: "success",
    };
  }

  return {
    title: "지금 출발 적정",
    description: `도착 ${currentExpectedArrivalTime}`,
    tone: "primary",
  };
}

export function getEstimatedStepLengthCm(heightCm?: number) {
  const height = Number(heightCm);

  if (!Number.isFinite(height) || height < 120 || height > 220) {
    return DEFAULT_PREFERENCES.stepLengthCm;
  }

  return Math.round(height * 0.415);
}

function buildStrategies(
  request: NormalizedRouteIntent,
  totalDurationMinutes: number
): StrategyOption[] {
  const targetMinutes = parseTimeToMinutes(request.targetArrivalTime);

  return (["safe", "balanced", "ontime"] as ArrivalStrategy[]).map((strategy) => {
    if (request.planningMode === "leaveNow") {
      const expected = parseTimeToMinutes(request.departureTime) + totalDurationMinutes;

      return {
        strategy,
        label: STRATEGY_LABELS[strategy],
        recommendedDepartureTime: request.departureTime,
        expectedArrivalTime: formatMinutesAsTime(expected),
        arrivalDeltaMinutes: 0,
        badge: "현재 출발",
      };
    }

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
}

function buildSegments(
  request: RoutePlan["request"],
  transitEstimate?: TransitRouteEstimate
): RouteSegment[] {
  if (!transitEstimate) {
    return buildPendingSegments(request);
  }

  if (transitEstimate.pathSteps?.length) {
    return buildDetailedSegments(request, transitEstimate);
  }

  return buildLegacySegments(request, transitEstimate);
}

function buildDetailedSegments(
  request: RoutePlan["request"],
  transitEstimate: TransitRouteEstimate
): RouteSegment[] {
  const segments: RouteSegment[] = [];
  const walkSteps = transitEstimate.pathSteps?.filter((step) => step.type === "walk") ?? [];
  let walkIndex = 0;
  let accumulatedMinutes = 0;

  for (const step of transitEstimate.pathSteps ?? []) {
    if (step.type === "walk") {
      const isFirstWalk = walkIndex === 0;
      const isFinalWalk = walkIndex === walkSteps.length - 1;
      const durationMinutes = getProfiledWalkMinutes(
        step.durationMinutes || 1,
        step.distanceMeters ?? 0,
        request.preferences
      );
      const walkSegment = buildWalkSegment(
        step,
        walkIndex,
        durationMinutes,
        transitEstimate,
        isFirstWalk,
        isFinalWalk
      );

      if (isFinalWalk) {
        const signalSegment = buildSignalSegmentForWalk(
          request,
          walkIndex,
          accumulatedMinutes,
          walkSegment,
          isFirstWalk,
          isFinalWalk
        );

        if (signalSegment.durationMinutes > 0) {
          segments.push(signalSegment);
          accumulatedMinutes += signalSegment.durationMinutes;
        }

        segments.push(walkSegment);
        accumulatedMinutes += walkSegment.durationMinutes;
      } else {
        segments.push(walkSegment);
        accumulatedMinutes += walkSegment.durationMinutes;

        const signalSegment = buildSignalSegmentForWalk(
          request,
          walkIndex,
          accumulatedMinutes,
          walkSegment,
          isFirstWalk,
          isFinalWalk
        );

        if (signalSegment.durationMinutes > 0) {
          segments.push(signalSegment);
          accumulatedMinutes += signalSegment.durationMinutes;
        }
      }

      walkIndex += 1;
      continue;
    }

    const leg = step.legIndex !== undefined ? transitEstimate.legs[step.legIndex] : undefined;

    if (!leg) {
      continue;
    }

    const waitSegment = buildBoardingWaitSegment(
      transitEstimate,
      leg,
      step.legIndex ?? 0
    );

    if (waitSegment.durationMinutes > 0) {
      segments.push(waitSegment);
      accumulatedMinutes += waitSegment.durationMinutes;
    }

    const rideSegment: RouteSegment = {
      id: `ride-${step.legIndex ?? segments.length}`,
      type: "ride",
      label: leg.routeName,
      detail: formatRideDetail(leg),
      durationMinutes: Math.max(1, leg.durationMinutes),
      mode: leg.mode,
    };

    segments.push(rideSegment);
    accumulatedMinutes += rideSegment.durationMinutes;
  }

  return segments;
}

function buildLegacySegments(
  request: RoutePlan["request"],
  transitEstimate: TransitRouteEstimate
): RouteSegment[] {
  const walkDistanceMeters = transitEstimate?.walkDistanceMeters;
  const rawFirstWalk = transitEstimate?.firstWalkMinutes ?? 3;
  const rawLastWalk = transitEstimate?.lastWalkMinutes ?? 2;
  const rawWalkTotal = Math.max(1, rawFirstWalk + rawLastWalk);
  const firstWalkDistance = walkDistanceMeters
    ? Math.round(walkDistanceMeters * (rawFirstWalk / rawWalkTotal))
    : 250;
  const lastWalkDistance = walkDistanceMeters
    ? Math.round(walkDistanceMeters * (rawLastWalk / rawWalkTotal))
    : 120;
  const firstWalk = getProfiledWalkMinutes(
    rawFirstWalk,
    firstWalkDistance,
    request.preferences
  );
  const lastWalk = getProfiledWalkMinutes(
    rawLastWalk,
    lastWalkDistance,
    request.preferences
  );
  const signalConfigs = getTrafficSignalConfigs(request);
  const boardingSignalWait = getSignalWaitEstimate(request, signalConfigs[0]);
  const destinationSignalWait = getSignalWaitEstimate(request, signalConfigs[1]);
  const boardingWait = Math.max(0, transitEstimate.boardingWaitMinutes);
  const rideDuration = Math.max(1, transitEstimate.transitDurationMinutes);
  const firstLeg = transitEstimate.legs[0];

  return [
    {
      id: "origin-walk",
      type: "walk",
      label: "도보 이동",
      detail: transitEstimate?.firstStartStation
        ? `${transitEstimate.firstStartStation}까지`
        : "첫 이동 지점까지",
      durationMinutes: firstWalk,
      distanceMeters: firstWalkDistance,
    },
    {
      id: "signal-wait",
      type: "wait_signal",
      label: "승차 전 신호",
      detail: boardingSignalWait.detail,
      durationMinutes: boardingSignalWait.durationMinutes,
      isEstimated: true,
    },
    {
      id: "boarding-wait",
      type: "wait_boarding",
      label: getBoardingWaitLabel(firstLeg),
      detail: getBoardingWaitDetail(transitEstimate, firstLeg),
      durationMinutes: boardingWait,
    },
    {
      id: "main-ride",
      type: "ride",
      label: transitEstimate?.mainTransitLabel ?? "이동 구간",
      detail:
        transitEstimate?.mainTransitDetail ??
        `${request.origin || "출발지"}에서 ${request.destination || "도착지"} 방향`,
      durationMinutes: rideDuration,
    },
    {
      id: "destination-signal-wait",
      type: "wait_signal",
      label: "하차 후 신호",
      detail: destinationSignalWait.detail,
      durationMinutes: destinationSignalWait.durationMinutes,
      isEstimated: true,
    },
    {
      id: "destination-walk",
      type: "walk",
      label: "하차 후 도보",
      detail: "목적지 입구까지",
      durationMinutes: lastWalk,
      distanceMeters: lastWalkDistance,
    },
  ];
}

function buildWalkSegment(
  step: NonNullable<TransitRouteEstimate["pathSteps"]>[number],
  walkIndex: number,
  durationMinutes: number,
  transitEstimate: TransitRouteEstimate,
  isFirstWalk: boolean,
  isFinalWalk: boolean
): RouteSegment {
  const nextLeg = transitEstimate.legs[walkIndex] ?? transitEstimate.legs[0];

  return {
    id: isFirstWalk ? "origin-walk" : isFinalWalk ? "destination-walk" : `transfer-walk-${walkIndex}`,
    type: "walk",
    label: isFirstWalk ? "승차 전 도보" : isFinalWalk ? "하차 후 도보" : "환승 도보",
    detail: isFirstWalk
      ? `${transitEstimate.firstStartStation || nextLeg?.startName || "승차지"}까지`
      : isFinalWalk
      ? "목적지 입구까지"
      : `${nextLeg?.startName || "다음 승차지"}까지`,
    durationMinutes,
    distanceMeters: step.distanceMeters,
  };
}

function buildBoardingWaitSegment(
  transitEstimate: TransitRouteEstimate,
  leg: TransitLeg,
  legIndex: number
): RouteSegment {
  const isFirstLeg = legIndex === 0;
  const waitMinutes = isFirstLeg
    ? Math.max(0, leg.realtimeWaitMinutes ?? transitEstimate.boardingWaitMinutes)
    : getEstimatedTransferWaitMinutes(leg);

  return {
    id: isFirstLeg ? "boarding-wait" : `transfer-wait-${legIndex}`,
    type: "wait_boarding",
    label: isFirstLeg ? getBoardingWaitLabel(leg) : `${leg.routeName} 대기`,
    detail: getBoardingWaitBaseDetail(leg),
    durationMinutes: waitMinutes,
    mode: leg.mode,
    isEstimated: !isFirstLeg,
  };
}

function buildSignalSegmentForWalk(
  request: RoutePlan["request"],
  walkIndex: number,
  accumulatedMinutes: number,
  walkSegment: RouteSegment,
  isFirstWalk: boolean,
  isFinalWalk: boolean
): RouteSegment {
  const signalConfig = buildWalkSignalConfig(
    request,
    walkIndex,
    accumulatedMinutes,
    walkSegment,
    isFirstWalk,
    isFinalWalk
  );
  const signalWait = getSignalWaitEstimate(request, signalConfig);

  return {
    id: isFirstWalk
      ? "signal-wait"
      : isFinalWalk
      ? "destination-signal-wait"
      : `transfer-signal-wait-${walkIndex}`,
    type: "wait_signal",
    label: isFirstWalk ? "승차 전 신호" : isFinalWalk ? "하차 후 신호" : "환승 신호",
    detail: signalWait.detail,
    durationMinutes: signalWait.durationMinutes,
    isEstimated: true,
  };
}

function getEstimatedTransferWaitMinutes(leg: TransitLeg) {
  return leg.mode === "bus" ? 3 : 2;
}

function buildPendingSegments(request: RoutePlan["request"]): RouteSegment[] {
  return [
    {
      id: "origin-walk",
      type: "walk",
      label: "도보 구간",
      detail: "실제 경로를 불러오면 도보 시간이 표시됩니다.",
      durationMinutes: 0,
      isUnavailable: true,
    },
    {
      id: "signal-wait",
      type: "wait_signal",
      label: "승차 전 신호",
      detail: "실제 경로를 불러오면 승차 전 횡단보도 대기를 반영합니다.",
      durationMinutes: 0,
      isEstimated: true,
    },
    {
      id: "boarding-wait",
      type: "wait_boarding",
      label: "탑승 대기",
      detail: "열차/버스 도착 정보 연결 후 표시됩니다.",
      durationMinutes: 0,
      isUnavailable: true,
    },
    {
      id: "main-ride",
      type: "ride",
      label: "대중교통 경로",
      detail: `${request.origin || "출발지"}에서 ${request.destination || "도착지"}까지 실제 경로 확인 필요`,
      durationMinutes: 0,
      isUnavailable: true,
    },
    {
      id: "destination-signal-wait",
      type: "wait_signal",
      label: "하차 후 신호",
      detail: "실제 경로를 불러오면 하차 후 횡단보도 대기를 반영합니다.",
      durationMinutes: 0,
      isEstimated: true,
    },
    {
      id: "destination-walk",
      type: "walk",
      label: "하차 후 도보",
      detail: "실제 경로를 불러오면 목적지까지 도보 시간이 표시됩니다.",
      durationMinutes: 0,
      isUnavailable: true,
    },
  ];
}

function getProfiledWalkMinutes(
  fallbackMinutes: number,
  distanceMeters: number,
  preferences: RoutePreferences
) {
  const metersPerMinute = getWalkingMetersPerMinute(preferences);

  if (Number.isFinite(distanceMeters) && distanceMeters > 0) {
    return Math.max(1, Math.ceil(distanceMeters / metersPerMinute));
  }

  return Math.max(1, Math.round(fallbackMinutes * getWalkMultiplier(preferences)));
}

function getWalkingMetersPerMinute(preferences: RoutePreferences) {
  const preferredMetersPerMinute = getPreferredWalkingMetersPerMinute(preferences);

  if (preferredMetersPerMinute) {
    return preferredMetersPerMinute;
  }

  return getProfileWalkingMetersPerMinute(preferences);
}

function getProfileWalkingMetersPerMinute(preferences: RoutePreferences) {
  const stepLengthMeters = Math.max(0.45, Math.min(0.95, preferences.stepLengthCm / 100));

  return stepLengthMeters * DEFAULT_WALKING_STEPS_PER_MINUTE;
}

function getSignalWaitEstimate(
  request: RoutePlan["request"],
  signal: TrafficSignalConfig
) {
  const signalWaitSeconds = getSignalWaitSecondsAtReach(request, signal);
  const preferenceBufferSeconds = Math.max(0, request.preferences.signalBufferMinutes) * 60;
  const plannedWaitSeconds = Math.max(signalWaitSeconds, preferenceBufferSeconds);
  const durationMinutes =
    plannedWaitSeconds > 0 ? Math.max(1, Math.ceil(plannedWaitSeconds / 60)) : 0;

  return {
    durationMinutes,
    detail: `${signal.crossingName} · ${getSignalWaitDetail(
      signalWaitSeconds,
      preferenceBufferSeconds
    )}`,
  };
}

function getSignalWaitSecondsAtReach(
  request: RoutePlan["request"],
  options: TrafficSignalConfig
) {
  const now = new Date();
  const seedSeconds =
    getRouteSeedSeconds(request.origin, request.destination) + options.seedOffset;
  const cyclePosition =
    (getSecondsSinceMidnight(now) +
      seedSeconds +
      options.estimatedReachSeconds +
      options.gpsBufferSeconds) %
    SIGNAL_CYCLE_SECONDS;

  if (cyclePosition < SIGNAL_RED_SECONDS) {
    return SIGNAL_RED_SECONDS - cyclePosition;
  }

  return 0;
}

function getSignalWaitDetail(signalWaitSeconds: number, preferenceBufferSeconds: number) {
  if (signalWaitSeconds > 0) {
    return `예상 적색 대기 ${formatSeconds(signalWaitSeconds)}와 GPS 여유 반영`;
  }

  if (preferenceBufferSeconds > 0) {
    return "신호 변경 가능성과 GPS 오차 여유 반영";
  }

  return "현재 예측 기준 신호 대기 없음";
}

function getBoardingWaitLabel(firstLeg?: TransitLeg) {
  if (firstLeg?.mode === "subway") {
    return "열차 대기";
  }

  if (firstLeg?.mode === "bus") {
    return "버스 대기";
  }

  return "탑승 대기";
}

function getBoardingWaitDetail(
  transitEstimate: TransitRouteEstimate,
  firstLeg?: TransitLeg
) {
  if (firstLeg) {
    return `${firstLeg.routeName} · ${getBoardingWaitBaseDetail(firstLeg)}`;
  }

  return `${transitEstimate.sourceLabel} 기준`;
}

function formatRideDetail(leg: TransitLeg) {
  const direction = getLegDirectionLabel(leg);

  if (direction) {
    return `${leg.startName} → ${leg.endName} · ${direction}`;
  }

  return `${leg.startName} → ${leg.endName}`;
}

function getBoardingWaitBaseDetail(leg: TransitLeg) {
  const direction = getLegDirectionLabel(leg);

  return direction ? `${leg.startName} · ${direction}` : `${leg.startName} 기준`;
}

function getLegDirectionLabel(leg: TransitLeg) {
  return leg.directionLabel || (leg.direction ? `${leg.direction} 방면` : "");
}

function buildTrafficSignalPreviews(
  request: RoutePlan["request"],
  segments?: RouteSegment[]
): TrafficSignalPreview[] {
  const segmentSignals = segments ? buildSegmentSignalPreviews(request, segments) : [];

  if (segmentSignals.length) {
    return segmentSignals;
  }

  return getTrafficSignalConfigs(request).map((config) =>
    buildTrafficSignalPreview(request, config)
  );
}

function buildSegmentSignalPreviews(
  request: RoutePlan["request"],
  segments: RouteSegment[]
) {
  const signals: TrafficSignalPreview[] = [];
  let elapsedSeconds = 0;
  let distanceMeters = 0;

  for (const [index, segment] of segments.entries()) {
    if (segment.type === "wait_signal") {
      const crossingName = segment.detail.split(" · ")[0] || segment.label;
      const config: TrafficSignalConfig = {
        id: segment.id,
        crossingName,
        seedOffset: index * 17,
        estimatedReachSeconds: Math.max(0, elapsedSeconds),
        passDistanceMeters: Math.max(40, Math.round(distanceMeters)),
        gpsAccuracyMeters: request.originPoint?.accuracyMeters,
        gpsBufferSeconds: getGpsSignalBufferSeconds(request.originPoint?.accuracyMeters),
      };

      signals.push(buildTrafficSignalPreview(request, config));
    }

    elapsedSeconds += Math.max(0, Math.round(segment.durationMinutes * 60));

    if (segment.type === "walk") {
      distanceMeters += segment.distanceMeters ?? segment.durationMinutes * 75;
    }
  }

  return signals;
}

interface TrafficSignalConfig {
  id: string;
  crossingName: string;
  seedOffset: number;
  estimatedReachSeconds: number;
  passDistanceMeters: number;
  gpsAccuracyMeters?: number;
  gpsBufferSeconds: number;
}

function getTrafficSignalConfigs(request: RoutePlan["request"]): TrafficSignalConfig[] {
  const gpsAccuracyMeters = request.originPoint?.accuracyMeters;
  const gpsBufferSeconds = getGpsSignalBufferSeconds(gpsAccuracyMeters);

  return [
    {
      id: "origin-crossing",
      crossingName: getCrossingName(request, "origin"),
      seedOffset: 0,
      estimatedReachSeconds: 25,
      passDistanceMeters: 45,
      gpsAccuracyMeters,
      gpsBufferSeconds,
    },
    {
      id: "destination-crossing",
      crossingName: getCrossingName(request, "destination"),
      seedOffset: 23,
      estimatedReachSeconds: 55,
      passDistanceMeters: 180,
      gpsAccuracyMeters,
      gpsBufferSeconds,
    },
  ];
}

function buildWalkSignalConfig(
  request: RoutePlan["request"],
  walkIndex: number,
  accumulatedMinutes: number,
  walkSegment: RouteSegment,
  isFirstWalk: boolean,
  isFinalWalk: boolean
): TrafficSignalConfig {
  const gpsAccuracyMeters = request.originPoint?.accuracyMeters;
  const gpsBufferSeconds = getGpsSignalBufferSeconds(gpsAccuracyMeters);
  const position = isFirstWalk ? "origin" : isFinalWalk ? "destination" : "transfer";
  const reachWithinWalkSeconds = isFinalWalk
    ? 20
    : Math.min(90, Math.max(20, Math.round(walkSegment.durationMinutes * 30)));

  return {
    id: `${position}-crossing-${walkIndex}`,
    crossingName: getCrossingName(request, position, walkIndex),
    seedOffset: walkIndex * 23,
    estimatedReachSeconds: Math.round(accumulatedMinutes * 60 + reachWithinWalkSeconds),
    passDistanceMeters: Math.max(40, Math.min(220, walkSegment.distanceMeters ?? 80)),
    gpsAccuracyMeters,
    gpsBufferSeconds,
  };
}

function buildTrafficSignalPreview(
  request: RoutePlan["request"],
  options: TrafficSignalConfig
): TrafficSignalPreview {
  const now = new Date();
  const seedSeconds =
    getRouteSeedSeconds(request.origin, request.destination) + options.seedOffset;
  const cyclePosition = (getSecondsSinceMidnight(now) + seedSeconds) % SIGNAL_CYCLE_SECONDS;
  const isRed = cyclePosition < SIGNAL_RED_SECONDS;
  const remainingSeconds = isRed
    ? SIGNAL_RED_SECONDS - cyclePosition
    : SIGNAL_CYCLE_SECONDS - cyclePosition;

  return {
    id: options.id,
    crossingName: options.crossingName,
    phase: isRed ? "red" : "green",
    phaseLabel: isRed ? "보행 대기" : "보행 가능",
    remainingSeconds,
    nextPhaseLabel: isRed ? "다음 녹색" : "다음 적색",
    nextPhaseSeconds: remainingSeconds,
    cycleSeconds: SIGNAL_CYCLE_SECONDS,
    redSeconds: SIGNAL_RED_SECONDS,
    estimatedReachSeconds: options.estimatedReachSeconds,
    passDistanceMeters: options.passDistanceMeters,
    gpsAccuracyMeters: options.gpsAccuracyMeters,
    gpsBufferSeconds: options.gpsBufferSeconds,
    confidence: "estimated",
    updatedAtLabel: formatCurrentTime(now),
  };
}

function buildAction(
  request: RoutePlan["request"],
  totalDurationMinutes: number,
  expectedArrivalTime: string,
  deltaMinutes: number,
  transitEstimate?: TransitRouteEstimate
): RoutePlan["action"] {
  if (!transitEstimate) {
    return {
      title: "실제 경로 확인 중",
      description:
        "대중교통 경로가 연결되면 도착 시간, 환승, 도보 구간을 확정해서 보여줍니다.",
      tone: "neutral",
    };
  }

  if (request.planningMode === "leaveNow") {
    return {
      title: `지금 출발하면 ${expectedArrivalTime}쯤 도착`,
      description: `보폭 ${request.preferences.stepLengthCm}cm와 이동 프로필을 반영해 약 ${totalDurationMinutes}분으로 계산했습니다.`,
      tone: "primary",
    };
  }

  if (deltaMinutes === 0) {
    return {
      title: "목표 시각에 맞춰 출발",
      description: "여유 시간을 최소화해 목표 도착 시각에 맞춥니다.",
      tone: "success",
    };
  }

  if (deltaMinutes < 0) {
    return {
      title: `${STRATEGY_LABELS[request.strategy]} 기준 출발`,
      description: `${Math.abs(deltaMinutes)}분 여유를 두고 도착하도록 계산했습니다.`,
      tone: request.strategy === "safe" ? "success" : "primary",
    };
  }

  return {
    title: "출발 시각 조정 필요",
    description: "현재 조건에서는 목표 도착보다 늦을 수 있어 더 이른 출발이 필요합니다.",
    tone: "warning",
  };
}

function getCrossingName(
  request: RoutePlan["request"],
  position: "origin" | "transfer" | "destination",
  index = 0
) {
  const origin = request.origin.replace(/\s*\d+번\s*출구/g, "").trim();

  if (position === "origin" && origin) {
    return `${origin} 앞 횡단보도`;
  }

  if (position === "transfer") {
    return `환승 이동 횡단보도 ${index}`;
  }

  return `${request.destination || "도착지"} 앞 횡단보도`;
}

function getRouteSeedSeconds(origin: string, destination: string) {
  const source = `${origin}:${destination}`;
  let seed = 0;

  for (const char of source) {
    seed = (seed + char.charCodeAt(0)) % 90;
  }

  return seed;
}

function getGpsSignalBufferSeconds(accuracyMeters?: number) {
  if (!Number.isFinite(accuracyMeters)) {
    return 2;
  }

  const accuracy = Math.max(0, accuracyMeters ?? 0);
  return Math.min(20, Math.ceil(accuracy / 5) + 2);
}

function getSecondsSinceMidnight(date: Date) {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}

function formatCurrentTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")} 기준`;
}

function formatSeconds(seconds: number) {
  const roundedSeconds = Math.max(0, Math.round(seconds));

  if (roundedSeconds < 60) {
    return `${roundedSeconds}초`;
  }

  const minutes = Math.floor(roundedSeconds / 60);
  const remainder = roundedSeconds % 60;

  return remainder ? `${minutes}분 ${remainder}초` : `${minutes}분`;
}

function buildExplanation(
  request: RoutePlan["request"],
  totalDurationMinutes: number,
  expectedArrivalTime: string,
  deltaMinutes: number,
  transitEstimate?: TransitRouteEstimate
): string {
  if (!transitEstimate) {
    return `${request.origin}에서 ${request.destination}까지 실제 대중교통 경로를 확인해야 합니다. 지금은 신호 예측과 입력 조건만 준비했습니다.`;
  }

  const sourcePrefix = transitEstimate
    ? `${transitEstimate.sourceLabel}을 반영해`
    : "현재 조건 기준으로";

  if (request.planningMode === "leaveNow") {
    return `${request.origin}에서 ${request.destination}까지 ${sourcePrefix} 약 ${totalDurationMinutes}분, ${expectedArrivalTime} 도착으로 계산했습니다.`;
  }

  return `${request.origin}에서 ${request.destination}까지 ${sourcePrefix} 약 ${totalDurationMinutes}분입니다. ${request.targetArrivalTime} 목표에 맞춰 ${formatArrivalDelta(deltaMinutes)} 계획입니다.`;
}

function normalizePreferences(preferences?: Partial<RoutePreferences>): RoutePreferences {
  const heightCm = normalizeRange(
    preferences?.heightCm,
    120,
    220,
    DEFAULT_PREFERENCES.heightCm
  );
  const stepLengthCm = normalizeRange(
    preferences?.stepLengthCm,
    45,
    95,
    getEstimatedStepLengthCm(heightCm)
  );

  return {
    ...DEFAULT_PREFERENCES,
    ...preferences,
    walkingPace: isWalkingPace(preferences?.walkingPace)
      ? preferences.walkingPace
      : DEFAULT_PREFERENCES.walkingPace,
    transferBufferMinutes: normalizeRange(
      preferences?.transferBufferMinutes,
      0,
      15,
      DEFAULT_PREFERENCES.transferBufferMinutes
    ),
    signalBufferMinutes: normalizeRange(
      preferences?.signalBufferMinutes,
      0,
      10,
      DEFAULT_PREFERENCES.signalBufferMinutes
    ),
    manualWalkingMetersPerMinute: normalizeOptionalRange(
      preferences?.manualWalkingMetersPerMinute,
      MIN_LEARNED_WALKING_METERS_PER_MINUTE,
      MAX_LEARNED_WALKING_METERS_PER_MINUTE
    ),
    healthWalkingMetersPerMinute: normalizeOptionalRange(
      preferences?.healthWalkingMetersPerMinute,
      MIN_LEARNED_WALKING_METERS_PER_MINUTE,
      MAX_LEARNED_WALKING_METERS_PER_MINUTE
    ),
    healthWalkingSource: isHealthWalkingSource(preferences?.healthWalkingSource)
      ? preferences.healthWalkingSource
      : undefined,
    healthWalkingUpdatedAt:
      typeof preferences?.healthWalkingUpdatedAt === "string"
        ? preferences.healthWalkingUpdatedAt
        : undefined,
    learnedWalkingMetersPerMinute: normalizeOptionalRange(
      preferences?.learnedWalkingMetersPerMinute,
      MIN_LEARNED_WALKING_METERS_PER_MINUTE,
      MAX_LEARNED_WALKING_METERS_PER_MINUTE
    ),
    learnedWalkingConfidence: normalizeOptionalRatio(preferences?.learnedWalkingConfidence),
    heightCm,
    stepLengthCm,
  };
}

function normalizeRange(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number
) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, Math.round(numberValue)));
}

function normalizeOptionalRange(value: unknown, minimum: number, maximum: number) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return undefined;
  }

  return Math.min(maximum, Math.max(minimum, Math.round(numberValue)));
}

function normalizeOptionalRatio(value: unknown) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return undefined;
  }

  return Math.min(0.95, Math.max(0, numberValue));
}

function cleanText(value?: string): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function normalizeRoutePoint(point?: Partial<RoutePoint>): RoutePoint | undefined {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  const accuracyMeters = Number(point?.accuracyMeters);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return undefined;
  }

  return {
    lat,
    lng,
    name: cleanText(point?.name),
    accuracyMeters: Number.isFinite(accuracyMeters)
      ? Math.max(0, Math.round(accuracyMeters))
      : undefined,
  };
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

function isHealthWalkingSource(value?: string): value is HealthWalkingSource {
  return value === "healthkit" || value === "health-connect";
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

function formatDateAsTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

function getDefaultArrivalTime(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30);

  return formatDateAsTime(now);
}

function sumDurations(segments: RouteSegment[]): number {
  return segments.reduce((sum, segment) => sum + segment.durationMinutes, 0);
}

function getWalkMultiplier(preferences: RoutePreferences): number {
  const preferredMetersPerMinute = getPreferredWalkingMetersPerMinute(preferences);

  if (preferredMetersPerMinute) {
    return getProfileWalkingMetersPerMinute(DEFAULT_PREFERENCES) / preferredMetersPerMinute;
  }

  const baseStep = DEFAULT_PREFERENCES.stepLengthCm / preferences.stepLengthCm;

  return baseStep;
}

function getPreferredWalkingMetersPerMinute(preferences: RoutePreferences) {
  return (
    getBoundedWalkingMetersPerMinute(preferences.manualWalkingMetersPerMinute) ??
    getBoundedWalkingMetersPerMinute(preferences.healthWalkingMetersPerMinute) ??
    getBoundedWalkingMetersPerMinute(preferences.learnedWalkingMetersPerMinute)
  );
}

function getBoundedWalkingMetersPerMinute(value: unknown) {
  const metersPerMinute = Number(value);

  if (!Number.isFinite(metersPerMinute)) {
    return undefined;
  }

  return Math.min(
    MAX_LEARNED_WALKING_METERS_PER_MINUTE,
    Math.max(MIN_LEARNED_WALKING_METERS_PER_MINUTE, metersPerMinute)
  );
}
