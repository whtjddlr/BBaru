import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Clock, Timer, Play, AlertTriangle } from "lucide-react";
import { MapView } from "../MapView";
import { BottomSheet } from "../BottomSheet";
import { StatusBadge } from "../StatusBadge";
import { ActionCard } from "../ActionCard";
import { TimeDisplay } from "../TimeDisplay";
import { RoutePlanState, useRouteState } from "../../context/RouteContext";
import {
  createEtaPlan,
  deviationBadgeVariant,
  ETA_MODES,
  EtaMode,
  EtaPlan,
  formatClock,
  formatDeviation,
  formatDuration,
  formatDurationCompact,
  RouteSegment,
} from "../../lib/eta";
import {
  createWalkingRouteSignalKey,
  fetchCrossroads,
  fetchRealtimeSignals,
  findSignalCrossroadsForRoute,
  getWalkingRoutePoints,
} from "../../lib/signal";
import { mapTransitResponseToPlan } from "../../lib/transitMapper";

const modeOrder: EtaMode[] = ["safe", "balanced", "punctual"];

export function RouteResultScreen() {
  const navigate = useNavigate();
  const { searchRequest, selectedMode, setSelectedMode, routePlanState, retrySearch } = useRouteState();
  const [now, setNow] = useState(() => new Date());
  const [signalCrossroadCount, setSignalCrossroadCount] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 30000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const planRequest = searchRequest
    ? routePlanState.status === "success"
      ? routePlanState.request
      : searchRequest
    : null;
  const modePlans = planRequest ? buildModePlans(planRequest, routePlanState, now) : null;
  const plan = modePlans?.[selectedMode] ?? null;
  const signalRouteKey = plan ? createWalkingRouteSignalKey(plan.segments) : "";

  useEffect(() => {
    if (!plan || !signalRouteKey) {
      setSignalCrossroadCount(null);
      return undefined;
    }

    let cancelled = false;
    setSignalCrossroadCount(null);

    Promise.all([fetchCrossroads(), fetchRealtimeSignals()])
      .then(([crossroads, realtimeSignals]) => {
        const routePoints = getWalkingRoutePoints(plan.segments);
        const signalCrossroads = findSignalCrossroadsForRoute(routePoints, crossroads, realtimeSignals);

        if (!cancelled) {
          setSignalCrossroadCount(signalCrossroads.length);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSignalCrossroadCount(0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [signalRouteKey]);

  if (!plan || !modePlans) {
    return null;
  }

  const isLoading = routePlanState.status === "loading";
  const isFallback = routePlanState.status === "success" && routePlanState.isFallback;
  const loadError =
    routePlanState.status === "error"
      ? routePlanState.error
      : routePlanState.status === "success"
        ? routePlanState.error
        : undefined;
  const summaryBadge =
    plan.status.kind === "target_passed"
      ? { variant: "late" as const, label: "목표 시각 지남" }
      : { variant: deviationBadgeVariant(plan.deviationMinutes), label: formatDeviation(plan.deviationMinutes) };
  const actionVariant = plan.status.kind === "late" || plan.status.kind === "target_passed" ? "warning" : "primary";

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[#F8F9FB]">
      <header className="z-30 shrink-0 border-b border-neutral-200 bg-white/95 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-5 py-3">
          <button
            type="button"
            aria-label="메인으로 돌아가기"
            onClick={() => navigate("/")}
            className="-ml-2 rounded-lg p-2 transition-colors hover:bg-neutral-100"
          >
            <ArrowLeft className="size-5 text-neutral-900" aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-neutral-900">
              {plan.request.origin} → {plan.request.destination}
            </div>
            <div className="text-xs text-neutral-500">목표 도착: {formatClock(plan.targetArrival)}</div>
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
            route={plan.segments}
            showRoute
          />
        </div>

        <section aria-label="경로 요약" className="absolute left-5 right-5 top-5 z-20">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="size-5 text-blue-600" aria-hidden="true" />
                <span className="font-semibold text-neutral-900">도착 예상</span>
              </div>
              <div className="flex items-center gap-2">
                {isLoading && (
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                    실경로 조회 중
                  </span>
                )}
                {isFallback && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
                    데모 데이터
                  </span>
                )}
                <StatusBadge variant={summaryBadge.variant}>{summaryBadge.label}</StatusBadge>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-4">
              <TimeDisplay label="목표 도착" time={formatClock(plan.targetArrival)} />
              <TimeDisplay
                label="예상 도착"
                time={formatClock(plan.expectedArrival)}
                subtext={formatDeviation(plan.deviationMinutes)}
              />
              <TimeDisplay label="총 소요" time={formatDurationCompact(plan.totalDuration)} />
            </div>

            <div className="my-4 h-px bg-neutral-200" />

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="mb-1 text-xs text-neutral-500">권장 출발 시각</div>
                <div className="text-xl font-bold tabular-nums text-blue-600">
                  {formatClock(plan.recommendedDeparture)}
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2">
                <Timer className="size-4 shrink-0 text-blue-600" aria-hidden="true" />
                <span className="text-sm font-semibold text-blue-600">{plan.status.label}</span>
              </div>
            </div>

            {(isLoading || isFallback || routePlanState.status === "error") && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
                <span className="text-xs text-neutral-600">
                  {isLoading
                    ? "Tmap 대중교통 경로를 조회하고 있습니다."
                    : `실경로 조회 실패: ${loadError ?? "데모 경로로 표시 중입니다."}`}
                </span>
                {!isLoading && (
                  <button
                    type="button"
                    onClick={retrySearch}
                    className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 shadow-sm"
                  >
                    재시도
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        <BottomSheet defaultExpanded={false}>
          <div className="flex flex-col gap-4">
            <section aria-labelledby="departure-guide-title">
              <h2 id="departure-guide-title" className="mb-3 font-semibold text-neutral-900">출발 가이드</h2>
              <ActionCard
                icon={plan.status.kind === "late" || plan.status.kind === "target_passed" ? AlertTriangle : Play}
                title={getActionTitle(plan)}
                description={plan.status.description}
                variant={actionVariant}
              />
            </section>

            <section aria-labelledby="mode-comparison-title">
              <h2 id="mode-comparison-title" className="mb-3 font-semibold text-neutral-900">도착 최적화 모드</h2>
              <div className="grid grid-cols-3 gap-2">
                {modeOrder.map((mode) => {
                  const modePlan = modePlans[mode];
                  const isSelected = selectedMode === mode;

                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedMode(mode)}
                      className={`rounded-xl border-2 p-3 transition-colors ${
                        isSelected
                          ? "border-blue-600 bg-blue-50"
                          : "border-neutral-200 bg-white hover:border-blue-300"
                      }`}
                    >
                      <div className={`mb-1 text-sm font-semibold ${isSelected ? "text-blue-600" : ""}`}>
                        {ETA_MODES[mode].label}
                      </div>
                      <div className={`text-xs ${isSelected ? "text-blue-600" : "text-neutral-500"}`}>
                        {formatClock(modePlan.expectedArrival)} 도착
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section aria-labelledby="route-detail-title">
              <h2 id="route-detail-title" className="mb-4 font-semibold text-neutral-900">경로 상세</h2>

              <div className="rounded-2xl border border-neutral-200 bg-gradient-to-b from-neutral-50 to-white p-5">
                <div>
                  <div className="flex items-center gap-4">
                    <div className="flex w-12 flex-col items-center">
                      <div className="size-4 rounded-full border-4 border-blue-100 bg-blue-600" />
                      <div className="h-12 w-1 bg-gradient-to-b from-blue-200 to-neutral-200" />
                    </div>
                    <div className="flex-1 py-2">
                      <div className="mb-1 text-base font-semibold text-neutral-900">{plan.request.origin}</div>
                      <div className="text-xs text-neutral-500">
                        {formatClock(plan.recommendedDeparture)} 출발
                      </div>
                    </div>
                  </div>

                  {plan.segments.map((segment, index) => (
                    <TimelineSegment
                      key={segment.id}
                      segment={segment}
                      showConnector={index < plan.segments.length - 1}
                    />
                  ))}

                  <div className="flex items-center gap-4">
                    <div className="flex w-12 flex-col items-center">
                      <div className="size-4 rounded-full border-4 border-red-100 bg-red-600" />
                    </div>
                    <div className="flex-1 py-2">
                      <div className="mb-1 text-base font-semibold text-neutral-900">
                        {plan.request.destination} 도착
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-lg font-bold tabular-nums text-blue-600">
                          {formatClock(plan.expectedArrival)}
                        </div>
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-600">
                          {formatGoalComparison(plan.deviationMinutes)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-center">
                  <div className="mb-1 text-xs text-blue-600">도보</div>
                  <div className="text-lg font-bold tabular-nums text-blue-900">
                    {formatDurationCompact(plan.stats.walking)}
                  </div>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-center">
                  <div className="mb-1 text-xs text-amber-600">대기</div>
                  <div className="text-lg font-bold tabular-nums text-amber-900">
                    {formatDuration(plan.stats.waiting)}
                  </div>
                </div>
                <div className="rounded-xl border border-green-100 bg-green-50 p-3 text-center">
                  <div className="mb-1 text-xs text-green-600">탑승</div>
                  <div className="text-lg font-bold tabular-nums text-green-900">
                    {formatDurationCompact(plan.stats.riding)}
                  </div>
                </div>
              </div>

              {typeof plan.crossingCount === "number" && (
                <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3 text-xs text-neutral-600">
                  횡단보도 {plan.crossingCount}회
                  {typeof plan.transitMeta?.transferCount === "number"
                    ? ` · 환승 ${plan.transitMeta.transferCount}회`
                    : ""}
                  {typeof plan.transitMeta?.fare === "number"
                    ? ` · 요금 ${plan.transitMeta.fare.toLocaleString("ko-KR")}원`
                    : ""}
                </div>
              )}

              {signalCrossroadCount ? (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
                  실시간 신호 반영 가능 교차로 {signalCrossroadCount}곳
                </div>
              ) : null}
            </section>

            <section aria-labelledby="alternative-routes-title">
              <h2 id="alternative-routes-title" className="mb-3 font-semibold text-neutral-900">다른 경로</h2>
              <div className="flex flex-col gap-2">
                {plan.alternatives.map((alternative) => (
                  <button
                    key={alternative.id}
                    type="button"
                    className="w-full rounded-xl bg-neutral-50 p-4 transition-colors hover:bg-neutral-100"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-neutral-900">{alternative.label}</span>
                      <StatusBadge variant={deviationBadgeVariant(alternative.deviationMinutes)} size="sm">
                        {formatDeviation(alternative.deviationMinutes)}
                      </StatusBadge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-neutral-500">
                      <span>{alternative.detail}</span>
                      <span>{formatDurationCompact(alternative.duration)} 소요</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <button
              type="button"
              onClick={() => navigate("/en-route")}
              className="mt-2 w-full rounded-xl bg-blue-600 py-4 font-semibold text-white"
            >
              안내 시작
            </button>
          </div>
        </BottomSheet>
      </main>
    </div>
  );
}

function TimelineSegment({ segment, showConnector }: { segment: RouteSegment; showConnector: boolean }) {
  const style = getSegmentStyle(segment);

  return (
    <div className="flex items-center gap-4">
      <div className="flex w-12 flex-col items-center">
        <div className={`flex size-10 items-center justify-center rounded-xl border-2 bg-white shadow-sm ${style.border}`}>
          {segment.type === "subway" ? (
            <div className="flex size-6 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white">
              {segment.line?.replace("호선", "")}
            </div>
          ) : segment.type === "bus" ? (
            <div
              className="flex min-w-7 items-center justify-center rounded-md px-1.5 py-1 text-[10px] font-bold leading-none text-white"
              style={{ backgroundColor: segment.routeColor ?? "#2563EB" }}
            >
              {segment.route}
            </div>
          ) : (
            <svg className={`size-5 ${style.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={style.iconPath} />
            </svg>
          )}
        </div>
        {showConnector && <div className={`h-16 w-1 ${style.connector}`} />}
      </div>
      <div className="flex-1 py-2">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-neutral-900">{segment.label}</span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style.badge}`}>
            {formatDuration(segment.duration)}
          </span>
        </div>
        {segment.distance ? (
          <div className="mb-1 text-xs text-neutral-500">{segment.detail} · {segment.distance}m</div>
        ) : (
          <div className={`text-xs ${style.detail}`}>{segment.detail}</div>
        )}
        {segment.type === "wait_signal" && (
          <div className="mt-2 flex items-center gap-2">
            <div className="size-2 animate-pulse rounded-full bg-amber-400" />
            <span className="text-xs text-amber-700">실시간 신호 반영</span>
          </div>
        )}
      </div>
    </div>
  );
}

function getSegmentStyle(segment: RouteSegment) {
  if (segment.type === "wait_signal") {
    return {
      border: "border-amber-200",
      icon: "text-amber-600",
      iconPath: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
      badge: "bg-amber-50 text-amber-700",
      detail: "text-amber-700",
      connector: "bg-gradient-to-b from-neutral-200 to-neutral-200",
    };
  }

  if (segment.type === "subway") {
    return {
      border: "border-green-200",
      icon: "text-green-600",
      iconPath: "",
      badge: "bg-green-50 text-green-700",
      detail: "text-neutral-500",
      connector: "bg-gradient-to-b from-green-300 to-neutral-200",
    };
  }

  if (segment.type === "bus") {
    return {
      border: "border-blue-200",
      icon: "text-blue-600",
      iconPath: "",
      badge: "bg-blue-50 text-blue-700",
      detail: "text-neutral-500",
      connector: "bg-gradient-to-b from-blue-300 to-neutral-200",
    };
  }

  return {
    border: "border-blue-200",
    icon: "text-blue-600",
    iconPath: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
    badge: "bg-blue-50 text-blue-700",
    detail: "text-neutral-500",
    connector: "bg-gradient-to-b from-neutral-200 to-neutral-200",
  };
}

function buildModePlans(
  request: EtaPlan["request"],
  routePlanState: RoutePlanState,
  now: Date,
): Record<EtaMode, EtaPlan> {
  return Object.fromEntries(
    modeOrder.map((mode) => [mode, buildPlanForMode(request, routePlanState, mode, now)]),
  ) as Record<EtaMode, EtaPlan>;
}

function buildPlanForMode(
  request: EtaPlan["request"],
  routePlanState: RoutePlanState,
  mode: EtaMode,
  now: Date,
): EtaPlan {
  if (routePlanState.status === "success" && routePlanState.transitResponse && routePlanState.source === "tmap") {
    try {
      return mapTransitResponseToPlan(routePlanState.request, routePlanState.transitResponse, mode, now);
    } catch {
      return createEtaPlan(request, mode, now);
    }
  }

  return createEtaPlan(request, mode, now);
}

function getActionTitle(plan: EtaPlan): string {
  if (plan.status.kind === "target_passed") {
    return "목표 시각을 다시 설정하세요";
  }

  if (plan.status.kind === "late") {
    return "서둘러 출발하세요";
  }

  if (plan.status.kind === "wait") {
    return "아직 출발 전입니다";
  }

  return "지금 출발하세요";
}

function formatGoalComparison(deviationMinutes: number): string {
  if (deviationMinutes === 0) {
    return "목표 정시";
  }

  return `목표보다 ${formatDeviation(deviationMinutes)}`;
}
