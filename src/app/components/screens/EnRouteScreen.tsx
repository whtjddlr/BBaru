import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Clock, Navigation, AlertCircle, Timer, Footprints } from "lucide-react";
import { MapView } from "../MapView";
import { BottomSheet } from "../BottomSheet";
import { StatusBadge } from "../StatusBadge";
import { ActionCard } from "../ActionCard";
import { SignalInsightCard } from "../SignalInsightCard";
import {
  buildRoutePlan,
  createDefaultRouteIntent,
  type RoutePoint,
  type RoutePlan,
} from "../../domain/eta";
import { resolveKnownPlacePoint } from "../../domain/places";
import {
  addWalkingSpeedPosition,
  createInitialWalkingSpeedReading,
  createWalkingSpeedTrackerState,
  type WalkingSpeedReading,
} from "../../services/walkingSpeed";

interface EnRouteScreenProps {
  routePlan?: RoutePlan;
  onBack?: () => void;
  onEndRoute?: () => void;
}

export function EnRouteScreen({
  routePlan = buildRoutePlan(createDefaultRouteIntent()),
  onBack,
  onEndRoute,
}: EnRouteScreenProps) {
  const firstWalk = routePlan.segments.find((segment) => segment.id === "origin-walk");
  const signalWait = routePlan.segments.find((segment) => segment.id === "signal-wait");
  const boardingWait = routePlan.segments.find((segment) => segment.id === "boarding-wait");
  const mainRide = routePlan.segments.find((segment) => segment.id === "main-ride");
  const finalWalk = routePlan.segments.find((segment) => segment.id === "destination-walk");
  const originMapPoint = toMapPoint(routePlan.request.origin, routePlan.request.originPoint);
  const destinationMapPoint = toMapPoint(
    routePlan.request.destination,
    routePlan.request.destinationPoint
  );
  const livePosition = useLiveCurrentPosition(routePlan.request.originPoint);
  const walkingSpeed = useWalkingSpeedTracker(livePosition, routePlan);
  const currentPosition = livePosition
    ? {
        lat: livePosition.lat,
        lng: livePosition.lng,
      }
    : routePlan.request.originPoint
    ? {
        lat: routePlan.request.originPoint.lat,
        lng: routePlan.request.originPoint.lng,
      }
    : undefined;

  return (
    <div className="w-full h-screen bg-[#F8F9FB] relative overflow-hidden">
      {/* Navigation Header */}
      <div className="absolute top-0 left-0 right-0 bg-blue-600 z-30">
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={onBack} className="p-2 -ml-2 hover:bg-blue-500 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={onEndRoute}
              className="px-4 py-2 bg-white/20 backdrop-blur-sm rounded-lg text-white text-sm"
              style={{ fontWeight: 600 }}
            >
              경로 종료
            </button>
          </div>
          <div className="flex items-center gap-3">
            <Navigation className="w-6 h-6 text-white" />
            <div className="flex-1">
              <div className="text-white text-sm mb-1">{routePlan.request.destination}까지</div>
              <div className="text-2xl text-white tabular-nums" style={{ fontWeight: 700 }}>
                {routePlan.summary.expectedArrivalTime} 도착 예정
              </div>
            </div>
            <StatusBadge variant={routePlan.summary.statusVariant}>
              {routePlan.summary.arrivalDeltaLabel}
            </StatusBadge>
          </div>
        </div>
      </div>

      {/* Map with Current Position */}
      <div className="absolute inset-0 top-[121px]">
        <MapView
          origin={originMapPoint}
          destination={destinationMapPoint}
          currentPosition={currentPosition}
          showRoute
        />
      </div>

      {/* Real-time Action Alert */}
      <div className="absolute top-[141px] left-5 right-5 z-20">
        <ActionCard
          icon={Navigation}
          title="다음 확인 지점까지 이동"
          description="GPS가 기준선을 넘으면 다음 신호 기준으로 즉시 다시 맞춥니다."
          variant="primary"
        />
      </div>

      {/* Progress Indicator */}
      <div className="absolute top-[286px] left-5 right-5 z-20">
        <div className="bg-white rounded-2xl p-4 shadow-lg border border-neutral-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-neutral-600">이동 진행도</span>
            <span className="text-sm text-blue-600" style={{ fontWeight: 600 }}>35% 완료</span>
          </div>
          <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full" style={{ width: '35%' }} />
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-neutral-500">
            <span>{routePlan.request.origin}</span>
            <span>{routePlan.request.destination}</span>
          </div>
        </div>
      </div>

      {/* Bottom Sheet with En-route Details */}
      <BottomSheet defaultExpanded={false}>
        <div className="space-y-4">
          {/* Current Status */}
          <div>
            <h3 className="text-neutral-900 mb-3" style={{ fontWeight: 600 }}>현재 상태</h3>
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
              <div className="flex items-start gap-3 mb-3">
                <Timer className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm text-blue-900 mb-1" style={{ fontWeight: 600 }}>이동 중</div>
                  <div className="text-xs text-blue-700">
                    {routePlan.request.origin} → {firstWalk?.detail ?? "다음 이동 지점"}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-blue-600 mb-1">현재 구간</div>
                  <div className="text-base text-blue-900" style={{ fontWeight: 600 }}>
                    {firstWalk?.label ?? "도보 이동"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-blue-600 mb-1">남은 거리</div>
                  <div className="text-base text-blue-900" style={{ fontWeight: 600 }}>
                    {firstWalk?.distanceMeters ?? 180}m
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-neutral-900 mb-3" style={{ fontWeight: 600 }}>다음 신호</h3>
            <SignalInsightCard
              signal={routePlan.trafficSignal}
              signals={routePlan.trafficSignals}
              currentPosition={livePosition}
              originPoint={routePlan.request.originPoint}
            />
          </div>

          {/* Time Comparison */}
          <div>
            <h3 className="text-neutral-900 mb-3" style={{ fontWeight: 600 }}>도착 시각 비교</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white border border-neutral-200 rounded-xl p-3 text-center">
                <div className="text-xs text-neutral-500 mb-1">목표</div>
                <div className="text-xl text-neutral-900 tabular-nums" style={{ fontWeight: 700 }}>
                {routePlan.summary.planningMode === "leaveNow"
                  ? routePlan.summary.recommendedDepartureTime
                  : routePlan.summary.targetArrivalTime}
                </div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                <div className="text-xs text-emerald-600 mb-1">예상</div>
                <div className="text-xl text-emerald-900 tabular-nums" style={{ fontWeight: 700 }}>
                  {routePlan.summary.expectedArrivalTime}
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                <div className="text-xs text-blue-600 mb-1">편차</div>
                <div className="text-xl text-blue-900 tabular-nums" style={{ fontWeight: 700 }}>
                  {routePlan.summary.planningMode === "leaveNow"
                    ? "현재"
                    : `${routePlan.summary.arrivalDeltaMinutes}분`}
                </div>
              </div>
            </div>
          </div>

          {/* Upcoming Events - Visual Progress */}
          <div>
            <h3 className="text-neutral-900 mb-4" style={{ fontWeight: 600 }}>다가오는 구간</h3>

            {/* Visual Mini Timeline */}
            <div className="bg-white rounded-2xl p-4 border border-neutral-200 shadow-sm">
              <div className="space-y-0">
                {/* Current Position Indicator */}
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-neutral-100">
                  <div className="w-3 h-3 rounded-full bg-blue-600 border-4 border-blue-200 animate-pulse" />
                  <div className="flex-1">
                    <div className="text-xs text-blue-600 mb-1" style={{ fontWeight: 600 }}>현재 위치</div>
                    <div className="text-sm text-neutral-900" style={{ fontWeight: 600 }}>
                      {routePlan.request.origin} 앞
                    </div>
                  </div>
                  <div className="text-xs text-neutral-500 bg-neutral-50 px-3 py-1.5 rounded-full">35% 완료</div>
                </div>

                {/* Next: Traffic Light */}
                <div className="flex items-center gap-3 py-3 border-l-4 border-amber-400 -ml-1 pl-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-neutral-900" style={{ fontWeight: 600 }}>
                        {signalWait?.label ?? "횡단보도 신호 대기"}
                      </span>
                      <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded" style={{ fontWeight: 600 }}>120m</span>
                    </div>
                    <div className="text-xs text-amber-700 mb-2">
                      위치가 기준선을 넘으면 다음 신호
                    </div>
                    <div className="flex items-center gap-2 text-xs text-neutral-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      <span>재계산 지점</span>
                    </div>
                  </div>
                </div>

                {/* Then: Subway */}
                <div className="flex items-center gap-3 py-3 border-l-4 border-neutral-200 -ml-1 pl-4">
                  <div className="w-10 h-10 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center">
                    <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center text-white text-xs" style={{ fontWeight: 700 }}>2</div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-neutral-900" style={{ fontWeight: 600 }}>
                        {mainRide?.label ?? "주 이동 구간"}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {formatBoardingWaitLabel(boardingWait?.durationMinutes)}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-500">
                      {mainRide?.detail ?? routePlan.request.destination}
                    </div>
                  </div>
                </div>

                {/* Final: Walk to Destination */}
                <div className="flex items-center gap-3 py-3 border-l-4 border-neutral-200 -ml-1 pl-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-neutral-900 mb-1" style={{ fontWeight: 600 }}>하차 후 도보</div>
                    <div className="text-xs text-neutral-500">
                      {routePlan.request.destination} · 약 {finalWalk?.durationMinutes ?? 2}분
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Time to Next Event */}
            <div className="mt-3 bg-amber-50 rounded-xl p-3 border border-amber-200 flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-600" />
              <div className="flex-1">
                <div className="text-sm text-amber-900" style={{ fontWeight: 600 }}>다음 이벤트까지</div>
                <div className="text-xs text-amber-700">
                  GPS 통과 기준으로 다음 신호 타이머를 재설정합니다.
                </div>
              </div>
            </div>
          </div>

          <WalkingPaceCard
            routePlan={routePlan}
            firstWalk={firstWalk}
            walkingSpeed={walkingSpeed}
          />
        </div>
      </BottomSheet>
    </div>
  );
}

function formatBoardingWaitLabel(durationMinutes?: number) {
  if (!durationMinutes) {
    return "경로 시간 반영";
  }

  return `${durationMinutes}분 후`;
}

function WalkingPaceCard({
  routePlan,
  firstWalk,
  walkingSpeed,
}: {
  routePlan: RoutePlan;
  firstWalk?: RoutePlan["segments"][number];
  walkingSpeed: WalkingSpeedReading;
}) {
  const guidance = getWalkingPaceGuidance(routePlan, walkingSpeed, firstWalk);
  const paceSpeed =
    walkingSpeed.currentMetersPerMinute ??
    walkingSpeed.learnedMetersPerMinute ??
    walkingSpeed.fallbackMetersPerMinute;
  const walkMinutes = firstWalk?.durationMinutes ?? 0;
  const walkDistance = firstWalk?.distanceMeters;

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${guidance.iconClassName}`}>
          <Footprints className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm text-neutral-950" style={{ fontWeight: 800 }}>
                걷기 페이스
              </h3>
              <div className="mt-1 text-base text-neutral-950" style={{ fontWeight: 900 }}>
                {guidance.title}
              </div>
            </div>
            <div className={`shrink-0 rounded-full px-2.5 py-1 text-xs tabular-nums ${guidance.badgeClassName}`} style={{ fontWeight: 800 }}>
              {guidance.badge}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <PaceMetric label="현재" value={formatWalkingSpeedValue(walkingSpeed.currentMetersPerMinute)} />
            <PaceMetric label="평균" value={formatWalkingSpeedValue(walkingSpeed.learnedMetersPerMinute ?? walkingSpeed.fallbackMetersPerMinute)} />
            <PaceMetric label="오차" value={formatAccuracy(walkingSpeed.accuracyMeters)} />
          </div>

          <div className="mt-3 rounded-xl bg-neutral-50 px-3 py-2 text-xs leading-5 text-neutral-600">
            {getWalkingSpeedDetail(walkingSpeed, walkDistance, walkMinutes, paceSpeed)}
          </div>
        </div>
      </div>
    </section>
  );
}

function PaceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 px-2.5 py-2">
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div className="mt-0.5 truncate text-xs text-neutral-950 tabular-nums" style={{ fontWeight: 800 }}>
        {value}
      </div>
    </div>
  );
}

function getWalkingPaceGuidance(
  routePlan: RoutePlan,
  walkingSpeed: WalkingSpeedReading,
  firstWalk?: RoutePlan["segments"][number]
) {
  if (walkingSpeed.status === "low_accuracy") {
    return {
      title: "GPS 안정화 대기",
      badge: "오차 큼",
      iconClassName: "bg-neutral-100 text-neutral-600",
      badgeClassName: "bg-neutral-100 text-neutral-700",
    };
  }

  if (walkingSpeed.status === "waiting" || walkingSpeed.status === "calibrating") {
    return {
      title: "속도 측정 중",
      badge: "보정 전",
      iconClassName: "bg-blue-50 text-blue-700",
      badgeClassName: "bg-blue-100 text-blue-800",
    };
  }

  if (walkingSpeed.status === "paused") {
    return {
      title: "대기 중",
      badge: "평균 제외",
      iconClassName: "bg-neutral-100 text-neutral-600",
      badgeClassName: "bg-neutral-100 text-neutral-700",
    };
  }

  const adjustedWalkDelta = getAdjustedFirstWalkDelta(routePlan, walkingSpeed, firstWalk);

  if (
    routePlan.summary.planningMode === "arriveBy" &&
    routePlan.summary.currentArrivalDeltaMinutes + adjustedWalkDelta > 2
  ) {
    return {
      title: "조금 빠르게 걷기",
      badge: `${Math.max(
        1,
        Math.round(routePlan.summary.currentArrivalDeltaMinutes + adjustedWalkDelta)
      )}분 늦음`,
      iconClassName: "bg-amber-50 text-amber-700",
      badgeClassName: "bg-amber-100 text-amber-800",
    };
  }

  if (
    routePlan.summary.planningMode === "arriveBy" &&
    routePlan.summary.currentArrivalDeltaMinutes + adjustedWalkDelta < -5
  ) {
    return {
      title: "여유 있게 걸어도 됨",
      badge: `${Math.abs(
        Math.round(routePlan.summary.currentArrivalDeltaMinutes + adjustedWalkDelta)
      )}분 여유`,
      iconClassName: "bg-emerald-50 text-emerald-700",
      badgeClassName: "bg-emerald-100 text-emerald-800",
    };
  }

  return {
    title: "현재 페이스 유지",
    badge: "적정",
    iconClassName: "bg-blue-50 text-blue-700",
    badgeClassName: "bg-blue-100 text-blue-800",
  };
}

function getAdjustedFirstWalkDelta(
  routePlan: RoutePlan,
  walkingSpeed: WalkingSpeedReading,
  firstWalk?: RoutePlan["segments"][number]
) {
  const speed = walkingSpeed.currentMetersPerMinute ?? walkingSpeed.learnedMetersPerMinute;

  if (!speed || !firstWalk?.distanceMeters || firstWalk.durationMinutes <= 0) {
    return 0;
  }

  const adjustedWalkMinutes = Math.max(1, Math.ceil(firstWalk.distanceMeters / speed));

  return adjustedWalkMinutes - firstWalk.durationMinutes;
}

function getWalkingSpeedDetail(
  walkingSpeed: WalkingSpeedReading,
  walkDistance: number | undefined,
  walkMinutes: number,
  paceSpeed: number
) {
  if (walkingSpeed.status === "live" && walkDistance) {
    const adjustedWalkMinutes = Math.max(1, Math.ceil(walkDistance / paceSpeed));
    const diffMinutes = adjustedWalkMinutes - walkMinutes;

    if (diffMinutes > 0) {
      return `현재 속도 기준 도보 구간이 약 ${diffMinutes}분 늘어납니다.`;
    }

    if (diffMinutes < 0) {
      return `현재 속도 기준 도보 구간이 약 ${Math.abs(diffMinutes)}분 줄어듭니다.`;
    }

    return "현재 속도가 계획된 도보 시간과 비슷합니다.";
  }

  return walkingSpeed.detail;
}

function formatWalkingSpeedValue(metersPerMinute?: number) {
  if (!metersPerMinute) {
    return "측정 중";
  }

  return `${Math.round(metersPerMinute)}m/분`;
}

function formatAccuracy(accuracyMeters?: number) {
  if (!accuracyMeters) {
    return "확인 중";
  }

  return `±${Math.round(accuracyMeters)}m`;
}

function toMapPoint(
  name: string,
  point: RoutePoint | undefined
) {
  const resolvedPoint = resolveKnownPlacePoint(name, point ? { ...point, name } : undefined);

  if (!resolvedPoint) {
    return undefined;
  }

  return {
    lat: resolvedPoint.lat,
    lng: resolvedPoint.lng,
    name: resolvedPoint.name || name,
  };
}

function useWalkingSpeedTracker(position: RoutePoint | undefined, routePlan: RoutePlan) {
  const [reading, setReading] = useState<WalkingSpeedReading>(() =>
    createInitialWalkingSpeedReading(routePlan)
  );
  const trackerRef = useRef(createWalkingSpeedTrackerState(routePlan));
  const routeKey = `${routePlan.request.origin}->${routePlan.request.destination}`;

  useEffect(() => {
    trackerRef.current = createWalkingSpeedTrackerState(routePlan);
    setReading(createInitialWalkingSpeedReading(routePlan));
  }, [routeKey, routePlan]);

  useEffect(() => {
    if (!position?.timestampMs) {
      return;
    }

    const nextState = addWalkingSpeedPosition(
      trackerRef.current,
      position,
      routePlan
    );
    trackerRef.current = nextState;
    setReading(nextState.reading);
  }, [position?.timestampMs, routePlan]);

  return reading;
}

function useLiveCurrentPosition(initialPosition?: RoutePoint) {
  const [position, setPosition] = useState<RoutePoint | undefined>(initialPosition);

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (nextPosition) => {
        setPosition({
          lat: nextPosition.coords.latitude,
          lng: nextPosition.coords.longitude,
          name: "현재 위치",
          accuracyMeters: nextPosition.coords.accuracy,
          speedMetersPerSecond:
            typeof nextPosition.coords.speed === "number"
              ? nextPosition.coords.speed
              : undefined,
          timestampMs: nextPosition.timestamp,
        });
      },
      undefined,
      {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: 10_000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return position;
}
