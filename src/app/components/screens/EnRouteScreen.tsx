import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import confetti from "canvas-confetti";
import { ArrowLeft, Clock, Navigation, AlertCircle, Zap, Timer, TrendingUp, Pause, Play } from "lucide-react";
import { MapView } from "../MapView";
import { BottomSheet } from "../BottomSheet";
import { StatusBadge } from "../StatusBadge";
import { ActionCard } from "../ActionCard";
import { RoutePlanState, useRouteState } from "../../context/RouteContext";
import {
  createEtaPlan,
  deviationBadgeVariant,
  EtaMode,
  EtaPlan,
  formatClock,
  formatDeviation,
  formatDuration,
  RouteSegment,
} from "../../lib/eta";
import {
  findCrossedWaitTrigger,
  getCrossingWaitTriggers,
  getDemoSpeedMultiplier,
  getNextEvent,
  getProgressState,
  getRemainingWalkingDistance,
  getSignalWaitDecision,
  interpolateRoutePosition,
  scaleSpeedDelta,
} from "../../lib/enRoute";
import type { CrossingWaitTrigger } from "../../lib/enRoute";
import {
  classifyGeolocationError,
  hasRecentGeolocationPosition,
  queryGeolocationPermission,
  shouldSuggestDemoForWeakGpsSignal,
  watchCurrentPosition,
} from "../../lib/geolocation";
import type { GeoPosition, GeolocationPermissionState } from "../../lib/geolocation";
import {
  adviseCrossing,
  fetchCrossroadsStrict,
  fetchRealtimeSignalsStrict,
  findSignalCrossroadsForRoute,
  getWalkingRoutePoints,
} from "../../lib/signal";
import type { CrossingAdvice, PedestrianSignal } from "../../lib/signal";
import {
  canUseLiveTracking,
  estimateArrival as estimateLiveArrival,
  getDistanceMeters,
  isOffRoute,
  getRouteCoordinates,
  paceAdvice,
  projectOntoRoute,
  selectArrivedState,
  selectProgressPercent,
} from "../../lib/tracking";
import { mapTransitResponseToPlan } from "../../lib/transitMapper";
import {
  createInitialRerouteState,
  recordRerouteAttempt,
  resetRerouteOffRouteTimer,
  REROUTE_FAILURE_BACKOFF_MS,
  shouldReroute,
  updateRerouteStateForPosition,
  type RerouteState,
} from "../../lib/reroute";
import {
  applyWalkProfile,
  collectPaceSample,
  type WalkPaceProjection,
  type WalkProfile,
} from "../../lib/walkProfile";

type SpeedMode = "fast" | "steady" | "relaxed";
type TrackingMode = "live" | "demo";

const speedOptions: Array<{
  id: SpeedMode;
  title: string;
  deltaSeconds: number;
}> = [
  { id: "fast", title: "조금 더 빠르게 이동", deltaSeconds: -120 },
  { id: "steady", title: "현재 속도 유지 (권장)", deltaSeconds: 0 },
  { id: "relaxed", title: "여유롭게 이동", deltaSeconds: 180 },
];

interface ActiveSignalInfo {
  crossroadName: string;
  distanceMeters: number;
  signal: PedestrianSignal;
  fetchedAt: number;
}

interface SignalWaitState {
  trigger: CrossingWaitTrigger;
  remainingDemoSeconds: number;
  totalDemoSeconds: number;
  addedDelaySeconds: number;
}

interface SimulationState {
  elapsedSeconds: number;
  manualPaused: boolean;
  signalWait: SignalWaitState | null;
  accumulatedSignalDelaySeconds: number;
}

interface LiveTrackingState {
  permission: GeolocationPermissionState | "checking";
  position: GeoPosition | null;
  error: string | null;
  weakSignalMessage: string | null;
}

type RerouteStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const TICK_SECONDS = 0.5;
const LIVE_UI_THROTTLE_MS = 2000;

export function EnRouteScreen() {
  const navigate = useNavigate();
  const {
    clearSearch,
    searchRequest,
    selectedMode,
    routePlanState,
    rerouteFromPosition,
    recordWalkPaceSample,
    walkProfile,
  } = useRouteState();
  const [simulation, setSimulation] = useState<SimulationState>({
    elapsedSeconds: 0,
    manualPaused: false,
    signalWait: null,
    accumulatedSignalDelaySeconds: 0,
  });
  const [trackingMode, setTrackingMode] = useState<TrackingMode>("live");
  const [liveUnavailableMessage, setLiveUnavailableMessage] = useState<string | null>(null);
  const [liveTracking, setLiveTracking] = useState<LiveTrackingState>({
    permission: "checking",
    position: null,
    error: null,
    weakSignalMessage: null,
  });
  const [speedMode, setSpeedMode] = useState<SpeedMode>("steady");
  const [activeSignalInfo, setActiveSignalInfo] = useState<ActiveSignalInfo | null>(null);
  const [rerouteStatus, setRerouteStatus] = useState<RerouteStatus>({ kind: "idle" });
  const [rerouteCheckTick, setRerouteCheckTick] = useState(0);
  const [signalNoDataVisible, setSignalNoDataVisible] = useState(false);
  const [signalNoDataDismissed, setSignalNoDataDismissed] = useState(false);
  const [signalNow, setSignalNow] = useState(() => Date.now());
  const celebratedRef = useRef(false);
  const handledWaitTriggerIdsRef = useRef<Set<string>>(new Set());
  const activeSignalInfoRef = useRef<ActiveSignalInfo | null>(null);
  const lastLiveUiUpdateRef = useRef(0);
  const pendingLivePositionRef = useRef<GeoPosition | null>(null);
  const liveThrottleTimerRef = useRef<number | null>(null);
  const transientGeolocationErrorCountRef = useRef(0);
  const lastLivePositionReceivedAtRef = useRef<number | null>(null);
  const signalNoDataDismissedRef = useRef(false);
  const rerouteStateRef = useRef<RerouteState>(createInitialRerouteState());
  const rerouteInFlightRef = useRef(false);
  const walkProfileForPlanRef = useRef<WalkProfile | null>(walkProfile);
  const previousWalkSampleRef = useRef<{ projection: WalkPaceProjection; timestamp: number } | null>(null);
  const plan = useMemo(() => {
    if (!searchRequest) {
      return null;
    }

    const planRequest = routePlanState.status === "success" ? routePlanState.request : searchRequest;

    return buildPlanForMode(planRequest, routePlanState, selectedMode, new Date(), walkProfileForPlanRef.current);
  }, [routePlanState, searchRequest, selectedMode]);

  const crossingWaitTriggers = useMemo(() => (plan ? getCrossingWaitTriggers(plan.segments) : []), [plan]);
  const demoSpeedMultiplier = plan ? getDemoSpeedMultiplier(plan.totalDuration, plan.seed) : 1;
  const routeCoords = useMemo(
    () => (plan ? getRouteCoordinates(plan.segments, [plan.request.originPoint, plan.request.destinationPoint]) : []),
    [plan],
  );
  const liveTrackingAvailable = Boolean(plan && canUseLiveTracking(plan));
  const liveProjection = useMemo(
    () =>
      trackingMode === "live" && liveTracking.position && routeCoords.length > 0
        ? projectOntoRoute(liveTracking.position, routeCoords)
        : null,
    [liveTracking.position, routeCoords, trackingMode],
  );
  const destinationDistance = plan?.request.destinationPoint && liveTracking.position
    ? getDistanceMeters(liveTracking.position, plan.request.destinationPoint)
    : Number.POSITIVE_INFINITY;
  const demoProgress = plan ? Math.min(100, (simulation.elapsedSeconds / plan.totalDuration) * 100) : 0;
  const progress = selectProgressPercent(trackingMode, liveProjection, demoProgress);
  const demoArrived = Boolean(plan && simulation.elapsedSeconds >= plan.totalDuration && !simulation.signalWait);
  const arrived = selectArrivedState({
    mode: trackingMode,
    liveProjection,
    distanceToDestinationMeters: destinationDistance,
    demoArrived,
  });
  const signalLookupPoints = useMemo(
    () => (plan ? getSignalLookupPoints(plan.segments, trackingMode, liveTracking.position) : []),
    [liveTracking.position, plan, trackingMode],
  );
  const signalRouteKey = signalLookupPoints
    .map((point) => `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`)
    .join("|");
  const isLiveMode = trackingMode === "live";
  const elapsedJourneySecondsForState = plan
    ? isLiveMode
      ? plan.totalDuration * (liveProjection?.progressRatio ?? 0)
      : simulation.elapsedSeconds
    : 0;
  const currentSegmentTypeForSampling = plan
    ? getProgressState(plan.segments, elapsedJourneySecondsForState).currentSegment.type
    : null;

  useEffect(() => {
    activeSignalInfoRef.current = activeSignalInfo;
  }, [activeSignalInfo]);

  useEffect(() => {
    signalNoDataDismissedRef.current = signalNoDataDismissed;
  }, [signalNoDataDismissed]);

  useEffect(() => {
    if (!plan) {
      return;
    }

    if (trackingMode === "live" && !liveTrackingAvailable) {
      setLiveUnavailableMessage("실경로 좌표가 없어 실시간 추적을 사용할 수 없습니다. 데모 시뮬레이션으로 진행합니다.");
      setTrackingMode("demo");
      return;
    }

    if (liveTrackingAvailable) {
      setLiveUnavailableMessage(null);
    }
  }, [liveTrackingAvailable, plan, trackingMode]);

  useEffect(() => {
    if (!plan || trackingMode !== "live" || !liveTrackingAvailable) {
      return undefined;
    }

    let cancelled = false;
    let cleanup: (() => void) | undefined;
    lastLiveUiUpdateRef.current = 0;
    pendingLivePositionRef.current = null;
    transientGeolocationErrorCountRef.current = 0;
    lastLivePositionReceivedAtRef.current = null;
    if (liveThrottleTimerRef.current !== null) {
      window.clearTimeout(liveThrottleTimerRef.current);
      liveThrottleTimerRef.current = null;
    }

    setLiveTracking({
      permission: "checking",
      position: null,
      error: null,
      weakSignalMessage: null,
    });

    const startWatching = async () => {
      const permission = await queryGeolocationPermission();

      if (cancelled) {
        return;
      }

      if (permission === "unsupported") {
        setLiveTracking({
          permission,
          position: null,
          error: "이 브라우저는 위치 추적을 지원하지 않습니다. 데모 시뮬레이션으로 전환합니다.",
          weakSignalMessage: null,
        });
        setTrackingMode("demo");
        return;
      }

      if (permission === "denied") {
        setLiveTracking({
          permission,
          position: null,
          error: "위치 권한이 거부되었습니다. 데모 시뮬레이션으로 전환합니다.",
          weakSignalMessage: null,
        });
        setTrackingMode("demo");
        return;
      }

      setLiveTracking({
        permission,
        position: null,
        error: null,
        weakSignalMessage: null,
      });

      try {
        const commitPosition = (position: GeoPosition) => {
          lastLiveUiUpdateRef.current = Date.now();
          pendingLivePositionRef.current = null;
          transientGeolocationErrorCountRef.current = 0;
          lastLivePositionReceivedAtRef.current = Date.now();
          setLiveTracking({
            permission,
            position,
            error: null,
            weakSignalMessage: null,
          });
        };
        const scheduleTrailingPosition = (delayMs: number) => {
          if (liveThrottleTimerRef.current !== null) {
            return;
          }

          liveThrottleTimerRef.current = window.setTimeout(() => {
            liveThrottleTimerRef.current = null;

            if (cancelled || !pendingLivePositionRef.current) {
              return;
            }

            commitPosition(pendingLivePositionRef.current);
          }, delayMs);
        };

        cleanup = watchCurrentPosition({
          onPosition: (position) => {
            const nowMs = Date.now();
            const elapsedMs = nowMs - lastLiveUiUpdateRef.current;
            transientGeolocationErrorCountRef.current = 0;
            lastLivePositionReceivedAtRef.current = nowMs;

            setLiveTracking((current) =>
              current.weakSignalMessage
                ? {
                    ...current,
                    weakSignalMessage: null,
                  }
                : current,
            );

            if (elapsedMs >= LIVE_UI_THROTTLE_MS) {
              if (liveThrottleTimerRef.current !== null) {
                window.clearTimeout(liveThrottleTimerRef.current);
                liveThrottleTimerRef.current = null;
              }
              commitPosition(position);
              return;
            }

            pendingLivePositionRef.current = position;
            scheduleTrailingPosition(LIVE_UI_THROTTLE_MS - elapsedMs);
          },
          onError: (error) => {
            if (cancelled) {
              return;
            }

            if (classifyGeolocationError(error) === "fatal") {
              setLiveTracking((current) => ({
                ...current,
                error: getGeolocationErrorMessage(error),
                weakSignalMessage: null,
              }));
              setTrackingMode("demo");
              return;
            }

            const nowMs = Date.now();

            if (hasRecentGeolocationPosition(lastLivePositionReceivedAtRef.current, nowMs)) {
              transientGeolocationErrorCountRef.current = 0;
              return;
            }

            transientGeolocationErrorCountRef.current += 1;

            if (
              shouldSuggestDemoForWeakGpsSignal({
                transientErrorCount: transientGeolocationErrorCountRef.current,
                lastPositionAt: lastLivePositionReceivedAtRef.current,
                now: nowMs,
              })
            ) {
              setLiveTracking((current) => ({
                ...current,
                weakSignalMessage: "GPS 신호가 약합니다. 위치가 계속 갱신되지 않으면 데모 시뮬레이션으로 전환할 수 있습니다.",
              }));
            }
          },
        });
      } catch (error) {
        setLiveTracking((current) => ({
          ...current,
          error: error instanceof Error ? error.message : "위치 추적을 시작할 수 없습니다.",
          weakSignalMessage: null,
        }));
        setTrackingMode("demo");
      }
    };

    void startWatching();

    return () => {
      cancelled = true;
      if (liveThrottleTimerRef.current !== null) {
        window.clearTimeout(liveThrottleTimerRef.current);
        liveThrottleTimerRef.current = null;
      }
      pendingLivePositionRef.current = null;
      transientGeolocationErrorCountRef.current = 0;
      lastLivePositionReceivedAtRef.current = null;
      cleanup?.();
    };
  }, [liveTrackingAvailable, plan, trackingMode]);

  useEffect(() => {
    if (!plan) {
      return;
    }

    rerouteStateRef.current = resetRerouteOffRouteTimer(rerouteStateRef.current);
    handledWaitTriggerIdsRef.current = new Set();
    celebratedRef.current = false;
    setSimulation({
      elapsedSeconds: 0,
      manualPaused: false,
      signalWait: null,
      accumulatedSignalDelaySeconds: 0,
    });
    setSignalNoDataVisible(false);
    setSignalNoDataDismissed(false);
    signalNoDataDismissedRef.current = false;
    previousWalkSampleRef.current = null;
  }, [plan]);

  useEffect(() => {
    if (!isLiveMode || !liveProjection || !liveTracking.position || arrived) {
      previousWalkSampleRef.current = null;
      return;
    }

    const nextProjection: WalkPaceProjection = {
      traveledDistanceMeters: liveProjection.traveledDistanceMeters,
      accuracy: liveTracking.position.accuracy,
    };
    const previousSample = previousWalkSampleRef.current;

    if (previousSample) {
      const elapsedSeconds = Math.max(0, (liveTracking.position.timestamp - previousSample.timestamp) / 1000);
      const sample = collectPaceSample(
        previousSample.projection,
        nextProjection,
        elapsedSeconds,
        currentSegmentTypeForSampling,
      );

      if (sample) {
        recordWalkPaceSample(sample.speedMps);
      }
    }

    previousWalkSampleRef.current = {
      projection: nextProjection,
      timestamp: liveTracking.position.timestamp,
    };
  }, [
    arrived,
    isLiveMode,
    liveProjection,
    liveTracking.position,
    currentSegmentTypeForSampling,
    recordWalkPaceSample,
  ]);

  useEffect(() => {
    if (!isLiveMode || !liveProjection || !liveTracking.position || arrived) {
      rerouteStateRef.current = resetRerouteOffRouteTimer(rerouteStateRef.current);
      return;
    }

    const now = new Date();
    const nextRerouteState = updateRerouteStateForPosition(
      rerouteStateRef.current,
      now,
      liveProjection.offRouteDistanceMeters,
    );

    rerouteStateRef.current = nextRerouteState;

    if (!shouldReroute(nextRerouteState, now) || rerouteInFlightRef.current) {
      return;
    }

    rerouteInFlightRef.current = true;
    setRerouteStatus({ kind: "loading" });

    rerouteFromPosition(liveTracking.position)
      .then(() => {
        const completedAt = new Date();
        rerouteStateRef.current = recordRerouteAttempt(rerouteStateRef.current, completedAt);
        setRerouteStatus({ kind: "success", message: "새 경로로 안내합니다" });
      })
      .catch(() => {
        const failedAt = new Date();
        rerouteStateRef.current = recordRerouteAttempt(
          rerouteStateRef.current,
          failedAt,
          REROUTE_FAILURE_BACKOFF_MS,
        );
        setRerouteStatus({ kind: "error", message: "재탐색 실패 — 기존 경로로 계속 안내합니다" });
      })
      .finally(() => {
        rerouteInFlightRef.current = false;
      });
  }, [arrived, isLiveMode, liveProjection, liveTracking.position, rerouteCheckTick, rerouteFromPosition]);

  useEffect(() => {
    if (!isLiveMode || !liveProjection || arrived || !isOffRoute(liveProjection.offRouteDistanceMeters)) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setRerouteCheckTick((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [arrived, isLiveMode, liveProjection]);

  useEffect(() => {
    if (rerouteStatus.kind !== "success" && rerouteStatus.kind !== "error") {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setRerouteStatus({ kind: "idle" });
    }, 8000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [rerouteStatus]);

  useEffect(() => {
    if (!arrived || celebratedRef.current) {
      return;
    }

    celebratedRef.current = true;
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.35 } });
  }, [arrived]);

  useEffect(() => {
    if (!plan || arrived || trackingMode !== "demo") {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setSimulation((current) => {
        if (current.manualPaused) {
          return current;
        }

        if (current.signalWait) {
          const nextRemaining = current.signalWait.remainingDemoSeconds - TICK_SECONDS;

          if (nextRemaining > 0) {
            return {
              ...current,
              signalWait: {
                ...current.signalWait,
                remainingDemoSeconds: nextRemaining,
              },
            };
          }

          return {
            ...current,
            signalWait: null,
            accumulatedSignalDelaySeconds:
              current.accumulatedSignalDelaySeconds + current.signalWait.addedDelaySeconds,
          };
        }

        const nextElapsedSeconds = Math.min(
          plan.totalDuration,
          current.elapsedSeconds + demoSpeedMultiplier * TICK_SECONDS,
        );
        const trigger = findCrossedWaitTrigger(
          crossingWaitTriggers,
          current.elapsedSeconds,
          nextElapsedSeconds,
          handledWaitTriggerIdsRef.current,
        );

        if (!trigger) {
          return {
            ...current,
            elapsedSeconds: nextElapsedSeconds,
          };
        }

        handledWaitTriggerIdsRef.current.add(trigger.id);
        const signal = getCurrentSignal(activeSignalInfoRef.current, Date.now());
        const waitDecision = getSignalWaitDecision(signal, demoSpeedMultiplier);

        if (!waitDecision.shouldWait) {
          return {
            ...current,
            elapsedSeconds: nextElapsedSeconds,
          };
        }

        return {
          ...current,
          elapsedSeconds: trigger.elapsedSeconds,
          signalWait: {
            trigger,
            remainingDemoSeconds: waitDecision.demoWaitSeconds,
            totalDemoSeconds: waitDecision.demoWaitSeconds,
            addedDelaySeconds: waitDecision.realDelaySeconds,
          },
        };
      });
    }, TICK_SECONDS * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [arrived, crossingWaitTriggers, demoSpeedMultiplier, plan, trackingMode]);

  useEffect(() => {
    if (!plan || arrived || !signalRouteKey) {
      setActiveSignalInfo(null);
      return undefined;
    }

    let cancelled = false;
    let timer: number | null = null;
    let consecutiveFailures = 0;

    const updateSignalInfo = async () => {
      if (signalLookupPoints.length === 0) {
        if (!cancelled) {
          setActiveSignalInfo(null);
          if (!signalNoDataDismissedRef.current) {
            setSignalNoDataVisible(true);
          }
        }
        return;
      }

      try {
        const [crossroads, realtimeSignals] = await Promise.all([fetchCrossroadsStrict(), fetchRealtimeSignalsStrict()]);
        const [nearestSignalCrossroad] = findSignalCrossroadsForRoute(signalLookupPoints, crossroads, realtimeSignals);
        const selectedSignal = nearestSignalCrossroad
          ? selectPedestrianSignal(nearestSignalCrossroad.signals)
          : null;

        if (cancelled) {
          return;
        }

        consecutiveFailures = 0;
        setSignalNow(Date.now());
        setActiveSignalInfo(
          nearestSignalCrossroad && selectedSignal
            ? {
                crossroadName: nearestSignalCrossroad.crossroad.name,
                distanceMeters: nearestSignalCrossroad.crossroad.distanceMeters,
                signal: selectedSignal,
                fetchedAt: Date.now(),
              }
            : null,
        );
        setSignalNoDataVisible(Boolean(!nearestSignalCrossroad && !signalNoDataDismissedRef.current));
        scheduleNextSignalPoll(15000);
      } catch {
        if (cancelled) {
          return;
        }

        consecutiveFailures += 1;
        setActiveSignalInfo(null);
        setSignalNoDataVisible(false);

        if (consecutiveFailures === 1) {
          scheduleNextSignalPoll(60000);
        }
      }
    };

    const scheduleNextSignalPoll = (delayMs: number) => {
      timer = window.setTimeout(() => {
        timer = null;
        if (cancelled) {
          return;
        }

        void updateSignalInfo();
      }, delayMs);
    };

    void updateSignalInfo();

    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [arrived, signalRouteKey]);

  useEffect(() => {
    if (!activeSignalInfo || arrived) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setSignalNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [activeSignalInfo, arrived]);

  if (!plan) {
    return null;
  }

  const selectedSpeed = speedOptions.find((option) => option.id === speedMode) ?? speedOptions[1];
  const adjustedDeltaSeconds = isLiveMode ? 0 : scaleSpeedDelta(selectedSpeed.deltaSeconds, progress);
  const signalDelaySeconds =
    isLiveMode ? 0 : simulation.accumulatedSignalDelaySeconds + (simulation.signalWait?.addedDelaySeconds ?? 0);
  const liveArrivalEstimate = isLiveMode && liveProjection
    ? estimateLiveArrival(liveProjection.progressRatio, plan, new Date())
    : null;
  const adjustedExpectedArrival = liveArrivalEstimate?.expectedArrival ??
    new Date(plan.expectedArrival.getTime() + (adjustedDeltaSeconds + signalDelaySeconds) * 1000);
  const adjustedDeviation = liveArrivalEstimate?.deviationMinutes ??
    Math.round((adjustedExpectedArrival.getTime() - plan.targetArrival.getTime()) / 60000);
  const elapsedJourneySeconds = elapsedJourneySecondsForState;
  const progressState = getProgressState(plan.segments, elapsedJourneySeconds);
  const upcomingSegments = arrived ? [] : plan.segments.slice(progressState.currentIndex + 1, progressState.currentIndex + 4);
  const remainingWalkingDistance = getRemainingWalkingDistance(plan.segments, elapsedJourneySeconds);
  const nextEvent = getNextEvent(plan.segments, elapsedJourneySeconds);
  const interpolatedPosition = interpolateRoutePosition(plan.segments, progress);
  const currentMapPosition = isLiveMode
    ? liveTracking.position ?? interpolatedPosition
    : interpolatedPosition;
  const liveOffRoute = Boolean(isLiveMode && liveProjection && isOffRoute(liveProjection.offRouteDistanceMeters));
  const currentPaceAdvice = paceAdvice(adjustedDeviation);
  const activeSignal = getCurrentSignal(activeSignalInfo, signalNow);
  const crossingAdvice = activeSignal ? adviseCrossing(activeSignal) : null;
  const demoSpeedLabel = `x${demoSpeedMultiplier.toFixed(1)}`;

  const endRoute = () => {
    clearSearch();
    navigate("/");
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[#F8F9FB]">
      <header className="z-30 shrink-0 bg-blue-600">
        <div className="px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              aria-label="경로 결과로 돌아가기"
              onClick={() => navigate("/route")}
              className="-ml-2 rounded-lg p-2 transition-colors hover:bg-blue-500"
            >
              <ArrowLeft className="size-5 text-white" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={endRoute}
              className="rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm"
            >
              경로 종료
            </button>
          </div>
          <div className="flex items-center gap-3">
            <Navigation className="size-6 text-white" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2 text-sm text-white">
                <span>{plan.request.destination}까지</span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">
                  {isLiveMode ? "실시간 추적" : "데모 시뮬레이션"}
                </span>
              </div>
              <div className="truncate text-2xl font-bold tabular-nums text-white">
                {arrived ? "도착 완료" : `${formatClock(adjustedExpectedArrival)} 도착 예정`}
              </div>
            </div>
            <StatusBadge variant={arrived ? "ontime" : deviationBadgeVariant(adjustedDeviation)}>
              {arrived ? "완료" : formatDeviation(adjustedDeviation)}
            </StatusBadge>
          </div>
        </div>
      </header>

      <main className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-0">
          <MapView
            origin={{
              lat: plan.request.originPoint?.lat ?? 1,
              lng: plan.request.originPoint?.lng ?? 1,
              name: plan.request.origin,
            }}
            destination={{
              lat: plan.request.destinationPoint?.lat ?? 2,
              lng: plan.request.destinationPoint?.lng ?? 2,
              name: plan.request.destination,
            }}
            currentPosition={
              currentMapPosition ?? {
                lat: (plan.request.originPoint?.lat ?? 1) + progress / 100,
                lng: (plan.request.originPoint?.lng ?? 1) + progress / 100,
              }
            }
            route={plan.segments}
            showRoute
          />
        </div>

        <section aria-label="실시간 이동 요약" className="absolute left-5 right-5 top-5 z-20 flex flex-col gap-4">
          <ActionCard
            icon={Zap}
            title={
              isLiveMode && rerouteStatus.kind === "loading"
                ? "경로를 다시 찾는 중..."
                : isLiveMode
                ? getLiveTrackingActionTitle(arrived, liveTracking, liveOffRoute, currentPaceAdvice.title)
                : getDemoActionTitle(arrived, simulation, speedMode)
            }
            description={
              isLiveMode && rerouteStatus.kind === "loading"
                ? "현재 위치에서 목적지까지 새 경로를 조회하고 있습니다."
                : isLiveMode
                ? getLiveTrackingActionDescription(arrived, liveTracking, liveProjection, liveOffRoute, currentPaceAdvice.description)
                : getDemoActionDescription(arrived, simulation, speedMode, adjustedDeviation)
            }
            variant={
              rerouteStatus.kind === "loading" || liveOffRoute || simulation.signalWait
                ? "warning"
                : arrived || currentPaceAdvice.tone === "success"
                  ? "success"
                  : currentPaceAdvice.tone === "neutral"
                    ? "primary"
                    : "warning"
            }
            role={liveOffRoute || rerouteStatus.kind === "loading" ? "status" : undefined}
            ariaLive={liveOffRoute || rerouteStatus.kind === "loading" ? "polite" : undefined}
          >
            <div className="mt-3 border-t border-white/20 pt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="opacity-90">다음 재계산 지점</span>
                <span className="font-semibold">
                  {simulation.signalWait
                    ? `신호 대기 중 · ${Math.ceil(simulation.signalWait.remainingDemoSeconds)}초`
                    : nextEvent?.label ?? "도착 완료"}
                </span>
              </div>
            </div>
          </ActionCard>

          {(rerouteStatus.kind === "success" || rerouteStatus.kind === "error") && (
            <div
              role="status"
              aria-live="polite"
              className={`rounded-2xl border p-4 shadow-lg ${
                rerouteStatus.kind === "success"
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              <div className="flex items-start gap-3">
                <AlertCircle
                  className={`mt-0.5 size-5 shrink-0 ${
                    rerouteStatus.kind === "success" ? "text-emerald-600" : "text-amber-600"
                  }`}
                  aria-hidden="true"
                />
                <div
                  className={`min-w-0 flex-1 text-sm font-semibold ${
                    rerouteStatus.kind === "success" ? "text-emerald-900" : "text-amber-900"
                  }`}
                >
                  {rerouteStatus.message}
                </div>
              </div>
            </div>
          )}

          {activeSignalInfo && activeSignal && crossingAdvice && (
            <SignalStatusCard
              crossroadName={activeSignalInfo.crossroadName}
              distanceMeters={activeSignalInfo.distanceMeters}
              signal={activeSignal}
              advice={crossingAdvice}
            />
          )}

          {signalNoDataVisible && (
            <div role="status" aria-live="polite" className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-neutral-500" aria-hidden="true" />
                <div className="min-w-0 flex-1 text-xs font-semibold text-neutral-600">
                  이 경로 주변 교차로는 현재 실시간 신호 정보가 제공되지 않습니다.
                </div>
                <button
                  type="button"
                  aria-label="실시간 신호 정보 없음 안내 닫기"
                  onClick={() => {
                    setSignalNoDataDismissed(true);
                    setSignalNoDataVisible(false);
                  }}
                  className="-mr-1 -mt-1 rounded-lg px-2 py-1 text-xs font-semibold text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                >
                  닫기
                </button>
              </div>
            </div>
          )}

          {liveUnavailableMessage && (
            <div role="status" aria-live="polite" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-sm font-semibold text-amber-900">실시간 추적 사용 불가</div>
                  <div className="text-xs text-amber-700">{liveUnavailableMessage}</div>
                </div>
              </div>
            </div>
          )}

          {isLiveMode && liveTracking.weakSignalMessage && (
            <div role="status" aria-live="polite" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-lg">
              <div className="mb-3 flex items-start gap-3">
                <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-sm font-semibold text-amber-900">GPS 신호 약함</div>
                  <div className="text-xs text-amber-700">{liveTracking.weakSignalMessage}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTrackingMode("demo")}
                className="w-full rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white"
              >
                데모 시뮬레이션으로 전환
              </button>
            </div>
          )}

          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-sm text-neutral-600">이동 진행도</div>
                <div className="text-xs font-semibold text-blue-600">
                  {isLiveMode
                    ? getLiveModeSummary(liveTracking, liveProjection)
                    : `${liveTracking.error ? "위치 오류로 데모 전환됨" : "데모 시뮬레이션"} · 데모 배속 ${demoSpeedLabel}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isLiveMode && (
                  <button
                    type="button"
                    onClick={() =>
                      setSimulation((current) => ({
                        ...current,
                        manualPaused: !current.manualPaused,
                      }))
                    }
                    className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-700"
                  >
                    {simulation.manualPaused ? (
                      <Play className="size-3.5" aria-hidden="true" />
                    ) : (
                      <Pause className="size-3.5" aria-hidden="true" />
                    )}
                    {simulation.manualPaused ? "재생" : "일시정지"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setTrackingMode(isLiveMode ? "demo" : "live")}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"
                >
                  {isLiveMode ? "데모로 전환" : "실시간 추적"}
                </button>
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
              <span>{plan.request.origin}</span>
              <span className="font-semibold text-blue-600">{Math.round(progress)}% 완료</span>
              <span>{plan.request.destination}</span>
            </div>
          </div>
        </section>

        <BottomSheet defaultExpanded={false}>
          <div className="flex flex-col gap-4">
            <section aria-labelledby="current-status-title">
              <h2 id="current-status-title" className="mb-3 font-semibold text-neutral-900">현재 상태</h2>
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <div className="mb-3 flex items-start gap-3">
                  <Timer className="mt-0.5 size-5 text-blue-600" aria-hidden="true" />
                  <div className="flex-1">
                    <div className="mb-1 text-sm font-semibold text-blue-900">
                      {arrived ? "도착 완료" : "이동 중"}
                    </div>
                    <div className="text-xs text-blue-700">
                      {arrived ? `${plan.request.destination}에 도착했습니다` : progressState.currentSegment.detail}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-1 text-xs text-blue-600">현재 구간</div>
                    <div className="text-base font-semibold text-blue-900">
                      {arrived ? "완료" : progressState.currentSegment.label}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-blue-600">남은 보행 거리</div>
                    <div className="text-base font-semibold text-blue-900">
                      {arrived ? "0m" : `${remainingWalkingDistance}m`}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {arrived && (
              <section aria-label="도착 완료" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="mb-1 text-sm font-semibold text-emerald-900">도착 완료</div>
                <div className="text-xs text-emerald-700">
                  목표 {formatClock(plan.targetArrival)} 기준 {formatDeviation(adjustedDeviation)}으로 경로를 마쳤습니다.
                </div>
              </section>
            )}

            <section aria-labelledby="arrival-comparison-title">
              <h2 id="arrival-comparison-title" className="mb-3 font-semibold text-neutral-900">도착 시각 비교</h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-neutral-200 bg-white p-3 text-center">
                  <div className="mb-1 text-xs text-neutral-500">목표</div>
                  <div className="text-xl font-bold tabular-nums text-neutral-900">
                    {formatClock(plan.targetArrival)}
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
                  <div className="mb-1 text-xs text-emerald-600">예상</div>
                  <div className="text-xl font-bold tabular-nums text-emerald-900">
                    {formatClock(adjustedExpectedArrival)}
                  </div>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center">
                  <div className="mb-1 text-xs text-blue-600">편차</div>
                  <div className="text-xl font-bold tabular-nums text-blue-900">
                    {formatSignedDeviation(adjustedDeviation)}
                  </div>
                </div>
              </div>
            </section>

            <section aria-labelledby="upcoming-segments-title">
              <h2 id="upcoming-segments-title" className="mb-4 font-semibold text-neutral-900">다가오는 구간</h2>

              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div>
                  <div className="mb-4 flex items-center gap-3 border-b border-neutral-100 pb-4">
                    <div className="size-3 animate-pulse rounded-full border-4 border-blue-200 bg-blue-600" />
                    <div className="flex-1">
                      <div className="mb-1 text-xs font-semibold text-blue-600">현재 위치</div>
                      <div className="text-sm font-semibold text-neutral-900">
                        {arrived ? plan.request.destination : progressState.currentSegment.label}
                      </div>
                    </div>
                    <div className="rounded-full bg-neutral-50 px-3 py-1.5 text-xs text-neutral-500">
                      {Math.round(progress)}% 완료
                    </div>
                  </div>

                  {upcomingSegments.length === 0 ? (
                    <div className="-ml-1 flex items-center gap-3 border-l-4 border-emerald-400 py-3 pl-4">
                      <div className="flex size-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50">
                        <Navigation className="size-5 text-emerald-600" aria-hidden="true" />
                      </div>
                      <div className="flex-1">
                        <div className="mb-1 text-sm font-semibold text-neutral-900">
                          {arrived ? "모든 구간 완료" : `${plan.request.destination} 도착`}
                        </div>
                        <div className="text-xs text-neutral-500">
                          {arrived ? "경로 종료를 눌러 메인으로 돌아가세요" : "마지막 구간을 진행 중입니다"}
                        </div>
                      </div>
                    </div>
                  ) : (
                    upcomingSegments.map((segment, index) => (
                      <UpcomingSegment
                        key={segment.id}
                        segment={segment}
                        isNext={index === 0}
                      />
                    ))
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <Clock className="size-5 text-amber-600" aria-hidden="true" />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-amber-900">다음 이벤트까지</div>
                  <div className="text-xs text-amber-700">
                    {nextEvent ? `${nextEvent.label} 약 ${formatDuration(nextEvent.secondsUntil)} 후` : "모든 이벤트를 완료했습니다"}
                  </div>
                </div>
              </div>
            </section>

            {!isLiveMode && (
              <section aria-labelledby="speed-options-title">
                <h2 id="speed-options-title" className="mb-3 font-semibold text-neutral-900">속도 조절 옵션</h2>
                <div className="flex flex-col gap-2">
                  {speedOptions.map((option) => {
                    const optionDeltaSeconds = scaleSpeedDelta(option.deltaSeconds, progress);
                    const optionArrival = new Date(
                      plan.expectedArrival.getTime() + (optionDeltaSeconds + signalDelaySeconds) * 1000,
                    );
                    const optionDeviation = Math.round(
                      (optionArrival.getTime() - plan.targetArrival.getTime()) / 60000,
                    );
                    const isSelected = speedMode === option.id;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSpeedMode(option.id)}
                        className={`w-full rounded-xl border p-4 transition-colors ${
                          isSelected
                            ? "border-2 border-blue-600 bg-blue-600"
                            : "border-neutral-200 bg-neutral-50 hover:bg-neutral-100"
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span className={`text-sm font-semibold ${isSelected ? "text-white" : "text-neutral-900"}`}>
                            {option.title}
                          </span>
                          {option.id === "fast" ? (
                            <TrendingUp className={`size-4 ${isSelected ? "text-white" : "text-neutral-500"}`} aria-hidden="true" />
                          ) : (
                            <div className={`size-2 rounded-full ${isSelected ? "bg-white" : "bg-neutral-400"}`} />
                          )}
                        </div>
                        <div className={`text-left text-xs ${isSelected ? "text-white/90" : "text-neutral-600"}`}>
                          {formatClock(optionArrival)} 도착 · 목표보다 {formatDeviation(optionDeviation)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <section aria-label="다음 재계산 지점" className="rounded-xl bg-neutral-100 p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="size-2 animate-pulse rounded-full bg-blue-600" />
                <span className="text-sm font-semibold text-neutral-700">다음 재계산 지점</span>
              </div>
              <div className="text-xs text-neutral-600">
                {nextEvent
                  ? `${nextEvent.label} 도착 시 ETA를 다시 계산합니다`
                  : "경로가 완료되어 추가 재계산 지점이 없습니다"}
              </div>
            </section>
          </div>
        </BottomSheet>
      </main>
    </div>
  );
}

function UpcomingSegment({ segment, isNext }: { segment: RouteSegment; isNext: boolean }) {
  const isSignal = segment.type === "wait_signal";
  const isSubway = segment.type === "subway";
  const isBus = segment.type === "bus";
  const border = isNext ? (isSignal ? "border-amber-400" : "border-blue-400") : "border-neutral-200";
  const iconContainer = isSignal
    ? "bg-amber-50 border-amber-200"
    : isSubway
      ? "bg-green-50 border-green-200"
      : "bg-blue-50 border-blue-200";

  return (
    <div className={`-ml-1 flex items-center gap-3 border-l-4 py-3 pl-4 ${border}`}>
      <div className={`flex size-10 items-center justify-center rounded-xl border ${iconContainer}`}>
        {isSignal ? (
          <AlertCircle className="size-5 text-amber-600" aria-hidden="true" />
        ) : isSubway ? (
          <div className="flex size-6 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white">
            {segment.line?.replace("호선", "")}
          </div>
        ) : isBus ? (
          <div
            className="flex min-w-7 items-center justify-center rounded-md px-1.5 py-1 text-[10px] font-bold leading-none text-white"
            style={{ backgroundColor: segment.routeColor ?? "#2563EB" }}
          >
            {segment.route}
          </div>
        ) : (
          <svg className="size-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        )}
      </div>
      <div className="flex-1">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-semibold text-neutral-900">{segment.label}</span>
          <span className={`rounded px-2 py-1 text-xs ${isNext ? "bg-amber-50 text-amber-700" : "text-neutral-500"}`}>
            {isNext ? "다음" : formatDuration(segment.duration)}
          </span>
        </div>
        <div className={`text-xs ${isSignal ? "text-amber-700" : "text-neutral-500"}`}>
          {segment.detail}
        </div>
      </div>
    </div>
  );
}

function SignalStatusCard({
  crossroadName,
  distanceMeters,
  signal,
  advice,
}: {
  crossroadName: string;
  distanceMeters: number;
  signal: PedestrianSignal;
  advice: CrossingAdvice;
}) {
  const stateStyle =
    signal.state === "green"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : signal.state === "red"
        ? "bg-red-50 text-red-700 border-red-200"
        : "bg-neutral-50 text-neutral-700 border-neutral-200";
  const stateLabel = signal.state === "green" ? "녹색" : signal.state === "red" ? "적색" : "확인 중";
  const isExpiring = typeof signal.remainingSeconds === "number" && signal.remainingSeconds <= 0;
  const remainingLabel =
    signal.remainingSeconds === null
      ? "잔여시간 정보 없음"
      : isExpiring
        ? "곧 변경"
        : `${Math.ceil(signal.remainingSeconds)}초`;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-lg">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-xs font-semibold text-blue-600">실시간 보행 신호</div>
          <div className="truncate text-sm font-semibold text-neutral-900">{crossroadName}</div>
          <div className="text-xs text-neutral-500">
            {formatSignalDirection(signal.direction)} · 약 {Math.round(distanceMeters)}m
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${stateStyle}`}>
          {stateLabel}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="mb-1 text-xs text-neutral-500">잔여 시간</div>
          <div className="text-xl font-bold tabular-nums text-neutral-900">{remainingLabel}</div>
        </div>
        <div
          className={`rounded-xl px-3 py-2 text-right text-xs font-semibold ${
            advice.action === "go" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {advice.message}
        </div>
      </div>
    </div>
  );
}

function selectPedestrianSignal(signals: PedestrianSignal[]): PedestrianSignal | null {
  return (
    signals.find((signal) => signal.state === "red") ??
    signals.find((signal) => signal.state === "green") ??
    signals[0] ??
    null
  );
}

function formatSignalDirection(direction: string): string {
  const labels: Record<string, string> = {
    nt: "북측 횡단",
    et: "동측 횡단",
    st: "남측 횡단",
    wt: "서측 횡단",
    ne: "북동측 횡단",
    se: "남동측 횡단",
    sw: "남서측 횡단",
    nw: "북서측 횡단",
  };

  return labels[direction] ?? "보행 신호";
}

function getCurrentSignal(info: ActiveSignalInfo | null, nowMs: number): PedestrianSignal | null {
  if (!info) {
    return null;
  }

  if (info.signal.remainingSeconds === null) {
    return info.signal;
  }

  return {
    ...info.signal,
    remainingSeconds: Math.max(0, info.signal.remainingSeconds - (nowMs - info.fetchedAt) / 1000),
  };
}

function getLiveTrackingActionTitle(
  arrived: boolean,
  liveTracking: LiveTrackingState,
  offRoute: boolean,
  paceTitle: string,
): string {
  if (arrived) {
    return "목적지에 도착했습니다";
  }

  if (liveTracking.error) {
    return "데모 시뮬레이션으로 전환했습니다";
  }

  if (!liveTracking.position) {
    return "위치 확인 중...";
  }

  if (offRoute) {
    return "경로에서 벗어났습니다";
  }

  return paceTitle;
}

function getLiveTrackingActionDescription(
  arrived: boolean,
  liveTracking: LiveTrackingState,
  liveProjection: ReturnType<typeof projectOntoRoute> | null,
  offRoute: boolean,
  paceDescription: string,
): string {
  if (arrived) {
    return "실시간 위치 기준으로 목적지 도착을 확인했습니다.";
  }

  if (liveTracking.error) {
    return liveTracking.error;
  }

  if (!liveTracking.position) {
    return "GPS 신호를 확인하고 있습니다. 위치가 잡히면 진행률과 ETA가 자동으로 갱신됩니다.";
  }

  if (offRoute && liveProjection) {
    return `경로에서 약 ${Math.round(liveProjection.offRouteDistanceMeters)}m 벗어났습니다. 경로로 복귀하세요.`;
  }

  return paceDescription;
}

function getDemoActionTitle(arrived: boolean, simulation: SimulationState, speedMode: SpeedMode): string {
  if (arrived) {
    return "목적지에 도착했습니다";
  }

  if (simulation.signalWait) {
    return "횡단보도 신호 대기 중";
  }

  if (simulation.manualPaused) {
    return "데모 시뮬레이션 일시정지";
  }

  return getSpeedActionTitle(speedMode);
}

function getDemoActionDescription(
  arrived: boolean,
  simulation: SimulationState,
  speedMode: SpeedMode,
  deviation: number,
): string {
  if (arrived) {
    return "경로가 완료되었습니다. 이동 기록은 최근 경로에 유지됩니다.";
  }

  if (simulation.signalWait) {
    return `신호 대기 중 · ${Math.ceil(simulation.signalWait.remainingDemoSeconds)}초 후 다시 이동합니다.`;
  }

  if (simulation.manualPaused) {
    return "재생을 누르면 데모 시뮬레이션이 이어집니다.";
  }

  return getSpeedDescription(speedMode, deviation);
}

function getLiveModeSummary(liveTracking: LiveTrackingState, liveProjection: ReturnType<typeof projectOntoRoute> | null): string {
  if (liveTracking.error) {
    return "실시간 추적 · 위치 오류";
  }

  if (liveTracking.weakSignalMessage) {
    return "실시간 추적 · GPS 신호 약함";
  }

  if (!liveTracking.position) {
    return "실시간 추적 · 위치 확인 중";
  }

  const accuracy = `GPS 정확도 ±${Math.round(liveTracking.position.accuracy)}m`;
  const routeDistance = liveProjection
    ? ` · 경로 이탈 ${Math.round(liveProjection.offRouteDistanceMeters)}m`
    : "";

  return `실시간 추적 · ${accuracy}${routeDistance}`;
}

function getSpeedActionTitle(mode: SpeedMode): string {
  if (mode === "fast") {
    return "조금 빠르게 이동 중입니다";
  }

  if (mode === "relaxed") {
    return "여유롭게 이동 중입니다";
  }

  return "지금 속도 유지하세요";
}

function getSpeedDescription(mode: SpeedMode, deviation: number): string {
  if (mode === "fast") {
    return `현재보다 빠른 페이스를 적용했습니다. 예상 편차는 ${formatDeviation(deviation)}입니다.`;
  }

  if (mode === "relaxed") {
    return `여유로운 페이스를 적용했습니다. 예상 편차는 ${formatDeviation(deviation)}입니다.`;
  }

  return `현재 페이스대로 가면 목표 시각 대비 ${formatDeviation(deviation)}입니다.`;
}

function formatSignedDeviation(deviation: number): string {
  if (deviation > 0) {
    return `+${deviation}분`;
  }

  return `${deviation}분`;
}

function getSignalLookupPoints(
  segments: RouteSegment[],
  trackingMode: TrackingMode,
  livePosition: GeoPosition | null,
): Array<{ lat: number; lng: number }> {
  const walkingRoutePoints = getWalkingRoutePoints(segments);

  if (trackingMode !== "live" || !livePosition) {
    return walkingRoutePoints;
  }

  const nearbyCrossingPoints = getCrossingPoints(segments).filter(
    (point) => getDistanceMeters(livePosition, point) <= 150,
  );

  return nearbyCrossingPoints.length > 0 ? nearbyCrossingPoints : walkingRoutePoints;
}

function getCrossingPoints(segments: RouteSegment[]): Array<{ lat: number; lng: number }> {
  return segments.flatMap((segment) => segment.crossings?.map((crossing) => crossing.position) ?? []);
}

function getGeolocationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return "위치 권한이 거부되었습니다. 데모 시뮬레이션으로 전환합니다.";
  }

  if (error.code === error.POSITION_UNAVAILABLE) {
    return "현재 위치를 확인할 수 없습니다. 데모 시뮬레이션으로 전환합니다.";
  }

  if (error.code === error.TIMEOUT) {
    return "위치 확인 시간이 초과되었습니다. 데모 시뮬레이션으로 전환합니다.";
  }

  return "위치 추적 중 오류가 발생했습니다. 데모 시뮬레이션으로 전환합니다.";
}

function buildPlanForMode(
  request: EtaPlan["request"],
  routePlanState: RoutePlanState,
  mode: EtaMode,
  now: Date,
  walkProfile: WalkProfile | null,
): EtaPlan {
  let plan: EtaPlan;

  if (routePlanState.status === "success" && routePlanState.transitResponse && routePlanState.source === "tmap") {
    try {
      plan = mapTransitResponseToPlan(routePlanState.request, routePlanState.transitResponse, mode, now);
      return applyWalkProfile(plan, walkProfile, now);
    } catch {
      plan = createEtaPlan(request, mode, now);
      return applyWalkProfile(plan, walkProfile, now);
    }
  }

  plan = createEtaPlan(request, mode, now);
  return applyWalkProfile(plan, walkProfile, now);
}
