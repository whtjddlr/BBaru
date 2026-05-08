import {
  AlertCircle,
  ArrowLeft,
  Bus,
  Footprints,
  Loader2,
  Navigation2,
  Route as RouteIcon,
  Timer,
  TrainFront,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  buildRoutePlan,
  createDefaultRouteIntent,
  type RoutePlan,
  type RouteSegment,
  type TransitLeg,
  type TransitRouteEstimate,
} from "../../domain/eta";

interface RouteResultScreenProps {
  routePlan?: RoutePlan;
  routeOptions?: TransitRouteEstimate[];
  isRouteLoading?: boolean;
  routeError?: string;
  onSelectRouteOption?: (estimate: TransitRouteEstimate) => void;
  onRetryRoute?: () => void;
  onBack?: () => void;
  onStartNavigation?: () => void;
}

interface SegmentClock {
  label: string;
  tone: "upcoming" | "active" | "done";
}

export function RouteResultScreen({
  routePlan = buildRoutePlan(createDefaultRouteIntent()),
  routeOptions = [],
  isRouteLoading = false,
  routeError,
  onSelectRouteOption,
  onRetryRoute,
  onBack,
  onStartNavigation,
}: RouteResultScreenProps) {
  const hasReliableRoute = routePlan.summary.isReliableEstimate;
  const boardingWait = routePlan.segments.find((segment) => segment.id === "boarding-wait");
  const autoRetryKeyRef = useRef("");
  const routeKey = `${routePlan.request.origin}->${routePlan.request.destination}`;

  useEffect(() => {
    if (hasReliableRoute || isRouteLoading || !routeError || !onRetryRoute) {
      return;
    }

    if (autoRetryKeyRef.current === routeKey) {
      return;
    }

    autoRetryKeyRef.current = routeKey;
    onRetryRoute();
  }, [hasReliableRoute, isRouteLoading, onRetryRoute, routeError, routeKey]);

  return (
    <div className="w-full h-screen bg-[#F6F8FB] overflow-hidden flex flex-col">
      <header className="shrink-0 bg-white border-b border-neutral-200">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-10 h-10 -ml-1 rounded-full hover:bg-neutral-100 flex items-center justify-center transition-colors"
            aria-label="뒤로"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-900" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-neutral-900 truncate" style={{ fontWeight: 800 }}>
              {routePlan.request.origin} → {routePlan.request.destination}
            </div>
            <div className="text-xs text-neutral-500">{getPlanningCopy(routePlan)}</div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 pb-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="space-y-3">
          <RouteOverviewCard
            routePlan={routePlan}
            isLoading={isRouteLoading}
            routeError={routeError}
            onRetryRoute={onRetryRoute}
          />

          <RouteOptionSelector
            routePlan={routePlan}
            routeOptions={routeOptions}
            onSelectRouteOption={onSelectRouteOption}
          />

          {hasReliableRoute && (
            <CompactStatusGrid
              routePlan={routePlan}
              boardingWait={boardingWait}
            />
          )}

          <section className="space-y-3">
            <SectionTitle
              icon={<RouteIcon className="w-4 h-4" />}
              title="이동 순서"
            />
            <RouteDetailPanel
              routePlan={routePlan}
              isRouteLoading={isRouteLoading}
              routeError={routeError}
            />
          </section>
        </div>
      </main>

      <footer className="shrink-0 bg-white border-t border-neutral-200 px-4 py-3">
        <button
          onClick={onStartNavigation}
          disabled={!hasReliableRoute}
          className="w-full h-[52px] bg-blue-600 text-white rounded-2xl flex items-center justify-center gap-2 disabled:bg-neutral-200 disabled:text-neutral-500"
          style={{ fontWeight: 800 }}
        >
          <Navigation2 className="w-5 h-5" />
          {hasReliableRoute ? "안내 시작" : "경로 확인 후 안내 시작"}
        </button>
      </footer>
    </div>
  );
}

function RouteOverviewCard({
  routePlan,
  isLoading,
  routeError,
  onRetryRoute,
}: {
  routePlan: RoutePlan;
  isLoading: boolean;
  routeError?: string;
  onRetryRoute?: () => void;
}) {
  const hasReliableRoute = routePlan.summary.isReliableEstimate;
  const walkMinutes = sumSegmentMinutes(routePlan.segments, "walk");
  const signalMinutes = sumSegmentMinutes(routePlan.segments, "wait_signal");
  const boardingWait = routePlan.segments.find((segment) => segment.id === "boarding-wait");
  const rideMinutes = sumSegmentMinutes(routePlan.segments, "ride");
  const firstLeg = routePlan.transitEstimate?.legs[0];
  const transitTone = getTransitTone(firstLeg);
  const advice = routePlan.summary.departureAdvice;
  const breakdown = [
    {
      key: "walk",
      label: "도보",
      value: formatShortDuration(walkMinutes),
      className: "bg-neutral-200",
    },
    {
      key: "signal",
      label: "신호",
      value: formatShortDuration(signalMinutes),
      className: "bg-amber-300",
    },
    {
      key: "wait",
      label: "대기",
      value: formatShortDuration(boardingWait?.durationMinutes),
      className: firstLeg?.mode === "subway" ? transitTone.barSoft : "bg-sky-300",
    },
    {
      key: "ride",
      label: firstLeg?.routeName ?? "탑승",
      value: formatShortDuration(rideMinutes),
      className: transitTone.bar,
    },
  ].filter((item) => item.value !== "0분");

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {(isLoading || !hasReliableRoute) && (
            <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
              {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{getSourceLabel(routePlan, isLoading)}</span>
            </div>
          )}
          <h1 className="text-2xl leading-tight text-neutral-950 tracking-normal" style={{ fontWeight: 900 }}>
            {getSummaryTitle(routePlan, isLoading)}
          </h1>
          <p className="text-xs text-neutral-500 leading-5 mt-1">
            {hasReliableRoute
              ? getOverviewSubcopy(routePlan)
              : routeError ?? "경로를 불러오는 중입니다."}
          </p>
        </div>
        {hasReliableRoute ? (
          <div className="shrink-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-center text-neutral-950">
            <div className="text-[11px] leading-none text-neutral-500">소요</div>
            <div className="mt-1 text-lg tabular-nums leading-none" style={{ fontWeight: 900 }}>
              {routePlan.summary.totalDurationMinutes}분
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onRetryRoute}
            disabled={isLoading}
            className="shrink-0 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-center text-blue-700 disabled:border-neutral-200 disabled:bg-neutral-50 disabled:text-neutral-400"
          >
            <div className="text-[11px] leading-none">경로</div>
            <div className="mt-1 text-sm leading-none" style={{ fontWeight: 900 }}>
              {isLoading ? "확인 중" : "다시 확인"}
            </div>
          </button>
        )}
      </div>

      {hasReliableRoute && (
        <>
          {routePlan.summary.planningMode === "arriveBy" && (
            <div className={`mt-4 flex items-center justify-between gap-3 rounded-2xl border px-3 py-3 ${getAdviceToneClassName(advice.tone)}`}>
              <div className="min-w-0">
                <div className="text-sm leading-5 truncate" style={{ fontWeight: 900 }}>
                  {advice.title}
                </div>
                {advice.description && (
                  <div className="text-xs leading-5 opacity-80 truncate">
                    {advice.description}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-xs tabular-nums opacity-80">
                목표 {routePlan.summary.targetArrivalTime}
              </div>
            </div>
          )}
          <div className="mt-3 flex items-center gap-1.5">
            {breakdown.map((item) => (
              <div key={item.key} className="min-w-0 flex-1">
                <div className={`h-2 rounded-full ${item.className}`} />
                <div className="mt-1 text-[11px] text-neutral-500 truncate">
                  {item.label} {item.value}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function SectionTitle({
  icon,
  title,
  caption,
}: {
  icon: ReactNode;
  title: string;
  caption?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-white border border-neutral-200 text-neutral-700 flex items-center justify-center">
          {icon}
        </div>
        <h2 className="text-base text-neutral-950" style={{ fontWeight: 900 }}>
          {title}
        </h2>
      </div>
      {caption && <div className="text-xs text-neutral-500 truncate">{caption}</div>}
    </div>
  );
}

function RouteOptionSelector({
  routePlan,
  routeOptions,
  onSelectRouteOption,
}: {
  routePlan: RoutePlan;
  routeOptions: TransitRouteEstimate[];
  onSelectRouteOption?: (estimate: TransitRouteEstimate) => void;
}) {
  if (routeOptions.length <= 1) {
    return null;
  }

  const representativeOptions = getRepresentativeRouteOptions(routeOptions);
  const fastestId = representativeOptions[0]?.routeOptionId;
  const selectedId = routePlan.transitEstimate?.routeOptionId;

  if (representativeOptions.length <= 1) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm text-neutral-950" style={{ fontWeight: 900 }}>
          추천 경로
        </div>
        <div className="text-xs text-neutral-500">분류별 빠른 순</div>
      </div>
      <div className="space-y-2">
        {representativeOptions.map((option) => {
          const isSelected = option.routeOptionId === selectedId;
          const isFastest = option.routeOptionId === fastestId;
          const firstLeg = option.legs[0];
          const tone = getTransitTone(firstLeg, option.routeMode);

          return (
            <button
              key={option.routeOptionId}
              type="button"
              onClick={() => onSelectRouteOption?.(option)}
              className={`w-full rounded-2xl border bg-white p-3 text-left transition ${
                isSelected ? tone.optionSelected : tone.optionIdle
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`h-10 w-1.5 rounded-full ${tone.bar}`} />
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white ${tone.icon}`}>
                  {getRouteModeIcon(option.routeMode)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 text-base leading-5 text-neutral-950 break-keep truncate" style={{ fontWeight: 900 }}>
                      {getRouteOptionTitle(option)}
                    </div>
                    {isFastest && (
                      <span className="shrink-0 rounded-full bg-neutral-950 px-2 py-0.5 text-[10px] text-white">
                        추천
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-neutral-500 truncate">
                    {getRouteOptionMeta(option)}
                  </div>
                </div>
                <div
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm tabular-nums ${tone.subtleBadge}`}
                  style={{ fontWeight: 900 }}
                >
                  {option.totalDurationMinutes}분
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function getRouteModeIcon(routeMode: TransitRouteEstimate["routeMode"]) {
  if (routeMode === "subway") {
    return <TrainFront className="w-4 h-4 shrink-0" />;
  }

  if (routeMode === "mixed") {
    return <RouteIcon className="w-4 h-4 shrink-0" />;
  }

  return <Bus className="w-4 h-4 shrink-0" />;
}

function getRepresentativeRouteOptions(routeOptions: TransitRouteEstimate[]) {
  const bestByGroup = new Map<string, TransitRouteEstimate>();

  for (const option of routeOptions) {
    const groupKey = getRouteGroupKey(option);
    const current = bestByGroup.get(groupKey);

    if (!current || option.totalDurationMinutes < current.totalDurationMinutes) {
      bestByGroup.set(groupKey, option);
    }
  }

  return [...bestByGroup.values()]
    .sort((first, second) => first.totalDurationMinutes - second.totalDurationMinutes)
    .slice(0, 4);
}

function getRouteGroupKey(option: TransitRouteEstimate) {
  if (option.routeMode === "bus") {
    return "bus";
  }

  const transferCount = getTransferCount(option);

  if (option.routeMode === "subway") {
    return `subway-${transferCount}`;
  }

  return `mixed-${transferCount}`;
}

function getRouteOptionTitle(option: TransitRouteEstimate) {
  const routeNames = option.legs.map((leg) => formatRouteName(leg.routeName)).filter(Boolean);

  if (option.routeMode === "bus") {
    return routeNames[0] ? `${routeNames[0]} 버스` : "버스";
  }

  if (routeNames.length > 2) {
    return `${routeNames[0]} + ${routeNames[routeNames.length - 1]} 외 ${routeNames.length - 2}`;
  }

  if (routeNames.length > 1) {
    return routeNames.join(" + ");
  }

  if (routeNames[0]) {
    return routeNames[0];
  }

  if (option.routeMode === "subway") {
    return "지하철";
  }

  if (option.routeMode === "mixed") {
    return "환승";
  }

  return "버스";
}

function getRouteOptionMeta(option: TransitRouteEstimate) {
  const firstLeg = option.legs[0];
  const transferCount = getTransferCount(option);

  if (!firstLeg) {
    return getRouteFallbackLabel(option);
  }

  return [
    getTransitWaitLabel(firstLeg),
    transferCount > 0 ? `환승 ${transferCount}회` : "",
    `${firstLeg.startName} 승차`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function getRouteFallbackLabel(option: TransitRouteEstimate) {
  if (option.routeMode === "bus") {
    return "버스";
  }

  if (option.routeMode === "mixed") {
    return "버스+지하철";
  }

  return "지하철";
}

function getTransferCount(option: TransitRouteEstimate) {
  return Math.max(0, option.legs.length - 1);
}

function formatRouteName(routeName: string) {
  const cleaned = routeName.replace(/^수도권\s*/, "").trim();
  const primaryRoute = cleaned.split(/\s*\/\s*/)[0]?.trim() || cleaned;

  return primaryRoute.replace(/\([^)]*\)/g, "").trim();
}

function getTransitTone(
  leg?: TransitLeg,
  routeMode?: TransitRouteEstimate["routeMode"]
) {
  const routeName = leg?.routeName ?? "";

  if (leg?.mode === "bus" || routeMode === "bus") {
    return {
      bar: "bg-blue-600",
      barSoft: "bg-sky-300",
      badge: "bg-blue-600 text-white",
      subtleBadge: "bg-blue-100 text-blue-800",
      card: "bg-blue-50 border-blue-100 text-blue-800",
      icon: "bg-blue-600",
      optionIdle: "border-blue-100 text-blue-900",
      optionSelected: "border-blue-500 bg-blue-50 text-blue-900 ring-1 ring-blue-200",
    };
  }

  if (routeName.includes("1호선")) {
    return {
      bar: "bg-[#0052A4]",
      barSoft: "bg-[#0052A4]/30",
      badge: "bg-[#0052A4] text-white",
      subtleBadge: "bg-[#0052A4]/15 text-[#003C78]",
      card: "bg-[#0052A4]/10 border-[#0052A4]/20 text-[#003C78]",
      icon: "bg-[#0052A4]",
      optionIdle: "border-[#0052A4]/20 text-[#003C78]",
      optionSelected: "border-[#0052A4] bg-[#0052A4]/10 text-[#003C78] ring-1 ring-[#0052A4]/25",
    };
  }

  if (routeName.includes("2호선")) {
    return {
      bar: "bg-[#00A84D]",
      barSoft: "bg-[#00A84D]/30",
      badge: "bg-[#00A84D] text-white",
      subtleBadge: "bg-[#00A84D]/15 text-[#006B32]",
      card: "bg-[#00A84D]/10 border-[#00A84D]/20 text-[#006B32]",
      icon: "bg-[#00A84D]",
      optionIdle: "border-[#00A84D]/20 text-[#006B32]",
      optionSelected: "border-[#00A84D] bg-[#00A84D]/10 text-[#006B32] ring-1 ring-[#00A84D]/25",
    };
  }

  if (routeName.includes("3호선")) {
    return {
      bar: "bg-[#EF7C1C]",
      barSoft: "bg-[#EF7C1C]/30",
      badge: "bg-[#EF7C1C] text-white",
      subtleBadge: "bg-[#EF7C1C]/15 text-[#934A0C]",
      card: "bg-[#EF7C1C]/10 border-[#EF7C1C]/20 text-[#934A0C]",
      icon: "bg-[#EF7C1C]",
      optionIdle: "border-[#EF7C1C]/20 text-[#934A0C]",
      optionSelected: "border-[#EF7C1C] bg-[#EF7C1C]/10 text-[#934A0C] ring-1 ring-[#EF7C1C]/25",
    };
  }

  if (routeName.includes("4호선")) {
    return {
      bar: "bg-[#00A5DE]",
      barSoft: "bg-[#00A5DE]/30",
      badge: "bg-[#00A5DE] text-white",
      subtleBadge: "bg-[#00A5DE]/15 text-[#006A8F]",
      card: "bg-[#00A5DE]/10 border-[#00A5DE]/20 text-[#006A8F]",
      icon: "bg-[#00A5DE]",
      optionIdle: "border-[#00A5DE]/20 text-[#006A8F]",
      optionSelected: "border-[#00A5DE] bg-[#00A5DE]/10 text-[#006A8F] ring-1 ring-[#00A5DE]/25",
    };
  }

  if (routeName.includes("7호선")) {
    return {
      bar: "bg-[#747F00]",
      barSoft: "bg-[#747F00]/30",
      badge: "bg-[#747F00] text-white",
      subtleBadge: "bg-[#747F00]/15 text-[#4C5400]",
      card: "bg-[#747F00]/10 border-[#747F00]/20 text-[#4C5400]",
      icon: "bg-[#747F00]",
      optionIdle: "border-[#747F00]/20 text-[#4C5400]",
      optionSelected: "border-[#747F00] bg-[#747F00]/10 text-[#4C5400] ring-1 ring-[#747F00]/25",
    };
  }

  if (routeName.includes("9호선")) {
    return {
      bar: "bg-[#BDB092]",
      barSoft: "bg-[#BDB092]/40",
      badge: "bg-[#8C8064] text-white",
      subtleBadge: "bg-[#BDB092]/25 text-[#675C42]",
      card: "bg-[#BDB092]/15 border-[#BDB092]/30 text-[#675C42]",
      icon: "bg-[#8C8064]",
      optionIdle: "border-[#BDB092]/30 text-[#675C42]",
      optionSelected: "border-[#8C8064] bg-[#BDB092]/15 text-[#675C42] ring-1 ring-[#8C8064]/25",
    };
  }

  if (routeName.includes("신분당")) {
    return {
      bar: "bg-[#D4003B]",
      barSoft: "bg-[#D4003B]/30",
      badge: "bg-[#D4003B] text-white",
      subtleBadge: "bg-[#D4003B]/15 text-[#8F0028]",
      card: "bg-[#D4003B]/10 border-[#D4003B]/20 text-[#8F0028]",
      icon: "bg-[#D4003B]",
      optionIdle: "border-[#D4003B]/20 text-[#8F0028]",
      optionSelected: "border-[#D4003B] bg-[#D4003B]/10 text-[#8F0028] ring-1 ring-[#D4003B]/25",
    };
  }

  return {
    bar: "bg-emerald-600",
    barSoft: "bg-emerald-300",
    badge: "bg-emerald-600 text-white",
    subtleBadge: "bg-emerald-100 text-emerald-800",
    card: "bg-emerald-50 border-emerald-100 text-emerald-800",
    icon: "bg-emerald-600",
    optionIdle: "border-emerald-100 text-emerald-900",
    optionSelected: "border-emerald-500 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200",
  };
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 px-3 py-2 min-w-0">
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div className="text-sm text-neutral-950 truncate tabular-nums" style={{ fontWeight: 900 }}>
        {value}
      </div>
    </div>
  );
}

function CompactStatusGrid({
  routePlan,
  boardingWait,
}: {
  routePlan: RoutePlan;
  boardingWait?: RouteSegment;
}) {
  const firstLeg = routePlan.transitEstimate?.legs[0];
  const signal = routePlan.trafficSignal;
  const transitTone = getTransitTone(firstLeg);
  const tick = useSecondTick(
    `${signal.id}:${signal.phase}:${signal.remainingSeconds}:${firstLeg?.routeName ?? ""}:${firstLeg?.realtimeWaitMinutes ?? ""}`
  );
  const liveSignal = getLiveSignalCountdown(signal, tick);
  const transitCountdown = getTransitCountdown(firstLeg, tick);
  const items = [
    {
      key: "signal",
      icon: <Timer className="w-4 h-4" />,
      title: "신호",
      value: formatSecondsCountdown(liveSignal.remainingSeconds),
      detail: getCompactCrossingName(signal.crossingName),
      className: "bg-emerald-50 border-emerald-100 text-emerald-800",
    },
    {
      key: "transit",
      icon: firstLeg?.mode === "bus" ? <Bus className="w-4 h-4" /> : <TrainFront className="w-4 h-4" />,
      title: firstLeg ? formatRouteName(firstLeg.routeName) : "대중교통",
      value: transitCountdown.label,
      detail: firstLeg ? getTransitStatusDetail(firstLeg, transitCountdown.detail) : "경로 확인",
      className: transitTone.card,
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <div key={item.key} className={`rounded-2xl border px-3 py-2.5 min-w-0 ${item.className}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shrink-0">
              {item.icon}
            </div>
            <div className="text-lg tabular-nums leading-none" style={{ fontWeight: 900 }}>
              {item.value}
            </div>
          </div>
          <div className="mt-1.5 text-sm truncate" style={{ fontWeight: 900 }}>
            {item.title}
          </div>
          <div className="text-xs opacity-80 truncate">{item.detail}</div>
        </div>
      ))}
    </section>
  );
}

function useSecondTick(resetKey: string) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setTick(0);
    const timerId = window.setInterval(() => {
      setTick((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [resetKey]);

  return tick;
}

function getLiveSignalCountdown(
  signal: RoutePlan["trafficSignal"],
  elapsedSeconds: number
) {
  const cycleSeconds = Math.max(1, signal.cycleSeconds);
  const redSeconds = Math.min(cycleSeconds, Math.max(1, signal.redSeconds));
  const initialCyclePosition =
    signal.phase === "red"
      ? redSeconds - signal.remainingSeconds
      : cycleSeconds - signal.remainingSeconds;
  const cyclePosition =
    (((initialCyclePosition + elapsedSeconds) % cycleSeconds) + cycleSeconds) %
    cycleSeconds;
  const isRed = cyclePosition < redSeconds;
  const remainingSeconds = Math.max(
    0,
    Math.ceil(isRed ? redSeconds - cyclePosition : cycleSeconds - cyclePosition)
  );

  return {
    phase: isRed ? "red" : "green",
    phaseLabel: isRed ? "보행 대기" : "보행 가능",
    remainingSeconds,
  };
}

function getCompactCrossingName(crossingName: string) {
  return crossingName
    .replace(/\s*앞\s*횡단보도$/, " 앞")
    .replace(/\s*횡단보도$/, "")
    .trim();
}

function getTransitCountdown(firstLeg: TransitLeg | undefined, elapsedSeconds: number) {
  if (!firstLeg) {
    return {
      label: "확인",
      detail: "경로 확인",
    };
  }

  if (firstLeg.realtimeWaitMinutes !== undefined) {
    if (firstLeg.realtimeWaitMinutes <= 0) {
      return {
        label: "곧 도착",
        detail: "도착 임박",
      };
    }

    const remainingSeconds = Math.max(0, firstLeg.realtimeWaitMinutes * 60 - elapsedSeconds);

    return {
      label: remainingSeconds === 0 ? "곧 도착" : formatClockCountdown(remainingSeconds),
      detail: remainingSeconds === 0 ? "도착 임박" : "실시간 기준",
    };
  }

  return {
    label: `${firstLeg.durationMinutes}분`,
    detail: "예상 기준",
  };
}

function getTransitStatusDetail(leg: TransitLeg, countdownDetail: string) {
  const direction = getShortDirectionCopy(leg);

  if (leg.realtimeWaitMinutes !== undefined) {
    const realtimeMessage = leg.realtimeMessage?.trim();

    return [realtimeMessage || countdownDetail, direction].filter(Boolean).join(" · ");
  }

  return [countdownDetail, direction].filter(Boolean).join(" · ");
}

function formatSecondsCountdown(seconds: number) {
  if (seconds < 60) {
    return `${seconds}초`;
  }

  return formatClockCountdown(seconds);
}

function formatClockCountdown(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function TransitEstimatePanel({ estimate }: { estimate: TransitRouteEstimate }) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-sm text-emerald-950" style={{ fontWeight: 900 }}>
            {estimate.sourceLabel}
          </div>
          <div className="text-xs text-emerald-700 mt-0.5">
            {estimate.updatedAtLabel} · {estimate.isRealtime ? "실시간 도착 반영" : "경로 시간 반영"}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-emerald-700">전체</div>
          <div className="text-lg tabular-nums text-emerald-950" style={{ fontWeight: 900 }}>
            {estimate.totalDurationMinutes}분
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {estimate.legs.map((leg, index) => (
          <div
            key={`${leg.routeName}-${leg.startName}-${leg.endName}-${index}`}
            className="rounded-xl bg-white/85 px-3 py-3 border border-emerald-100"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-neutral-900 truncate" style={{ fontWeight: 900 }}>
                  {formatRouteName(leg.routeName)}
                </div>
                <div className="text-xs text-neutral-500 truncate">
                  {leg.startName} → {leg.endName}
                </div>
              </div>
              <div className="text-sm text-emerald-800 tabular-nums shrink-0" style={{ fontWeight: 900 }}>
                {getTransitWaitLabel(leg)}
              </div>
            </div>
            {getLegDirectionLabel(leg) && (
              <div className="mt-2 text-xs text-emerald-700 truncate">
                {getShortDirectionCopy(leg)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TransitUnavailablePanel({
  isLoading,
  routeError,
}: {
  isLoading: boolean;
  routeError?: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-neutral-100 text-neutral-600 flex items-center justify-center shrink-0">
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
        </div>
        <div className="min-w-0">
          <div className="text-sm text-neutral-950" style={{ fontWeight: 900 }}>
            {isLoading ? "대중교통 경로 확인 중" : "대중교통 경로 확인 필요"}
          </div>
          <div className="text-xs text-neutral-500 leading-5 mt-1">
            {routeError ??
              "ODsay 결과가 없으면 도착 시간과 이동 구간을 확정하지 않습니다."}
          </div>
        </div>
      </div>
    </div>
  );
}

function RouteCalculationBreakdown({ routePlan }: { routePlan: RoutePlan }) {
  if (!routePlan.summary.isReliableEstimate) {
    return null;
  }

  const walkMinutes = sumSegmentMinutes(routePlan.segments, "walk");
  const signalMinutes = sumSegmentMinutes(routePlan.segments, "wait_signal");
  const boardingWait = routePlan.segments.find((segment) => segment.id === "boarding-wait");
  const rideMinutes = sumSegmentMinutes(routePlan.segments, "ride");
  const boardingLabel = boardingWait?.label ?? "탑승 대기";

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-sm text-neutral-950" style={{ fontWeight: 900 }}>
            시간 계산
          </div>
          <div className="text-xs text-neutral-500 mt-0.5">
            총 소요에 대기 시간을 포함합니다.
          </div>
        </div>
        <div className="rounded-full bg-neutral-950 px-3 py-1 text-xs text-white tabular-nums" style={{ fontWeight: 900 }}>
          {routePlan.summary.totalDurationMinutes}분
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <BreakdownItem
          icon={<Footprints className="w-4 h-4" />}
          label="도보"
          value={formatShortDuration(walkMinutes)}
          tone="neutral"
        />
        <BreakdownItem
          icon={<Timer className="w-4 h-4" />}
          label="신호"
          value={formatShortDuration(signalMinutes)}
          tone="amber"
        />
        <BreakdownItem
          icon={routePlan.transitEstimate?.legs[0]?.mode === "bus" ? <Bus className="w-4 h-4" /> : <TrainFront className="w-4 h-4" />}
          label={boardingLabel.replace(" 대기", "")}
          value={formatShortDuration(boardingWait?.durationMinutes)}
          tone="blue"
        />
        <BreakdownItem
          icon={routePlan.transitEstimate?.legs[0]?.mode === "bus" ? <Bus className="w-4 h-4" /> : <TrainFront className="w-4 h-4" />}
          label="탑승"
          value={formatShortDuration(rideMinutes)}
          tone="green"
        />
      </div>

      {(signalMinutes > 0 || boardingWait) && (
        <div className="mt-3 rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-600 leading-5">
          신호: {formatShortDuration(signalMinutes)}
          {boardingWait ? ` · ${boardingWait.label}: ${boardingWait.detail}` : ""}
        </div>
      )}
    </section>
  );
}

function BreakdownItem({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "neutral" | "amber" | "blue" | "green";
}) {
  const toneClassName = {
    neutral: "bg-neutral-50 text-neutral-700 border-neutral-200",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
  }[tone];

  return (
    <div className={`rounded-xl border px-2 py-3 text-center min-w-0 ${toneClassName}`}>
      <div className="mx-auto mb-1 flex w-7 h-7 items-center justify-center rounded-full bg-white/80">
        {icon}
      </div>
      <div className="text-[11px] truncate">{label}</div>
      <div className="text-sm tabular-nums" style={{ fontWeight: 900 }}>
        {value}
      </div>
    </div>
  );
}

function RouteDetailPanel({
  routePlan,
  isRouteLoading,
  routeError,
}: {
  routePlan: RoutePlan;
  isRouteLoading: boolean;
  routeError?: string;
}) {
  if (!routePlan.summary.isReliableEstimate) {
    return (
      <div className="bg-white rounded-2xl p-4 border border-neutral-200 shadow-sm">
        <TimelineRow
          icon={
            isRouteLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )
          }
          title={isRouteLoading ? "실제 경로 계산 중" : "실제 경로 확인 필요"}
          detail={
            routeError ??
            "대중교통 API 결과가 들어오기 전까지는 시간을 확정하지 않습니다."
          }
          meta={isRouteLoading ? "계산 중" : "확인 필요"}
          isLast
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
      <LiveRouteSteps routePlan={routePlan} />
    </div>
  );
}

function LiveRouteSteps({ routePlan }: { routePlan: RoutePlan }) {
  return (
    <div className="px-4 py-4 space-y-3">
      <EndpointRow
        title={routePlan.request.origin}
        detail={getTimelineDepartureCopy(routePlan)}
        tone="origin"
      />
      {routePlan.segments.map((segment, index) => (
        <RouteSegmentStep
          key={`${segment.id}-${index}`}
          segment={segment}
          clock={getStaticSegmentClock(segment)}
        />
      ))}
      <EndpointRow
        title={routePlan.request.destination}
        detail={getTimelineArrivalCopy(routePlan)}
        tone="destination"
      />
    </div>
  );
}

function RouteModeStrip({
  firstWalk,
  boardingWait,
  legs,
  finalWalk,
}: {
  firstWalk?: RouteSegment;
  boardingWait?: RouteSegment;
  legs: TransitLeg[];
  finalWalk?: RouteSegment;
}) {
  const items = [
    {
      key: "first-walk",
      label: "도보",
      value: formatShortDuration(firstWalk?.durationMinutes),
      className: "bg-neutral-200",
    },
    ...legs.map((leg, index) => ({
      key: `${leg.routeName}-${index}`,
      label: formatRouteName(leg.routeName),
      value: formatShortDuration(getTransitLegTotalMinutes(leg, index, boardingWait)),
      className: getTransitTone(leg).bar,
    })),
    {
      key: "final-walk",
      label: "도보",
      value: formatShortDuration(finalWalk?.durationMinutes),
      className: "bg-neutral-200",
    },
  ].filter((item) => item.value !== "0분");

  return (
    <div className="mt-4 flex items-center gap-1.5">
      {items.map((item) => (
        <div key={item.key} className="min-w-0 flex-1">
          <div className={`h-2 rounded-full ${item.className}`} />
          <div className="mt-1 text-[11px] text-neutral-500 truncate">
            {item.label} {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function EndpointRow({
  title,
  detail,
  tone,
}: {
  title: string;
  detail: string;
  tone: "origin" | "destination";
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`w-3 h-3 rounded-full shrink-0 ${
          tone === "origin" ? "bg-blue-600" : "bg-red-600"
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-neutral-950 truncate" style={{ fontWeight: 900 }}>
          {title}
        </div>
        <div className="text-xs text-neutral-500">{detail}</div>
      </div>
    </div>
  );
}

function RouteSegmentStep({
  segment,
  clock,
}: {
  segment: RouteSegment;
  clock: SegmentClock;
}) {
  if (segment.type === "walk") {
    return (
      <WalkStep
        segment={segment}
        clock={clock}
        isFinal={segment.id.includes("destination")}
      />
    );
  }

  if (segment.type === "wait_signal") {
    return <SignalStep segment={segment} clock={clock} />;
  }

  if (segment.type === "wait_boarding") {
    return <BoardingWaitStep segment={segment} clock={clock} />;
  }

  if (segment.type === "ride") {
    return <RideStep segment={segment} clock={clock} />;
  }

  return (
    <TimelineRow
      icon={<Timer className="w-4 h-4" />}
      title={segment.label}
      detail={segment.detail}
      meta={clock.label}
    />
  );
}

function WalkStep({
  segment,
  destination,
  clock,
  isFinal = false,
}: {
  segment?: RouteSegment;
  destination?: string;
  clock?: SegmentClock;
  isFinal?: boolean;
}) {
  if (!segment || segment.durationMinutes <= 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 pl-0">
      <div className="w-9 h-9 rounded-full bg-neutral-100 text-neutral-600 flex items-center justify-center shrink-0">
        <Footprints className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-neutral-900" style={{ fontWeight: 800 }}>
          {isFinal ? "하차 후 도보" : "도보 이동"}
        </div>
        <div className="text-xs text-neutral-500 truncate">
          {destination ? `${destination}까지` : segment.detail}
        </div>
      </div>
      <SegmentTimeBadge clock={clock} segment={segment} />
    </div>
  );
}

function BoardingWaitStep({
  segment,
  clock,
}: {
  segment: RouteSegment;
  clock: SegmentClock;
}) {
  if (segment.durationMinutes <= 0) {
    return null;
  }

  const Icon = segment.mode === "bus" ? Bus : TrainFront;

  return (
    <div className="flex items-center gap-3 pl-0">
      <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-neutral-900" style={{ fontWeight: 800 }}>
          {segment.label}
        </div>
        <div className="text-xs text-neutral-500 truncate">{segment.detail}</div>
      </div>
      <SegmentTimeBadge clock={clock} segment={segment} />
    </div>
  );
}

function SignalStep({
  segment,
  clock,
}: {
  segment?: RouteSegment;
  clock?: SegmentClock;
}) {
  if (!segment || segment.durationMinutes <= 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 pl-0">
      <div className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
        <Timer className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-neutral-900" style={{ fontWeight: 800 }}>
          {segment.label}
        </div>
        <div className="text-xs text-neutral-500 truncate">{segment.detail}</div>
      </div>
      <SegmentTimeBadge clock={clock} segment={segment} />
    </div>
  );
}

function RideStep({
  segment,
  clock,
}: {
  segment: RouteSegment;
  clock: SegmentClock;
}) {
  const isBus = segment.mode === "bus";
  const Icon = isBus ? Bus : TrainFront;
  const tone = getTransitTone({
    mode: segment.mode ?? "subway",
    routeName: segment.label,
    startName: "",
    endName: "",
    durationMinutes: segment.durationMinutes,
  });

  return (
    <div className={`rounded-2xl border p-3 ${tone.card}`}>
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-2xl text-white flex items-center justify-center shrink-0 ${tone.icon}`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-base text-neutral-950 truncate" style={{ fontWeight: 900 }}>
                {formatRouteName(segment.label)}
              </div>
              <div className="text-xs text-neutral-600 truncate">{segment.detail}</div>
            </div>
            <div
              className={`rounded-full px-2.5 py-1 text-xs tabular-nums shrink-0 ${tone.subtleBadge}`}
              style={{ fontWeight: 900 }}
            >
              {clock.label}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SegmentTimeBadge({
  clock,
  segment,
}: {
  clock?: SegmentClock;
  segment?: RouteSegment;
}) {
  const label = clock?.label ?? (segment ? formatSegmentMeta(segment) : undefined);

  if (!label) {
    return null;
  }

  const className =
    clock?.tone === "active"
      ? "bg-blue-600 text-white"
      : clock?.tone === "done"
      ? "bg-neutral-100 text-neutral-400"
      : "bg-neutral-100 text-neutral-700";

  return (
    <div
      className={`rounded-full px-2.5 py-1 text-xs tabular-nums shrink-0 ${className}`}
      style={{ fontWeight: 900 }}
    >
      {label}
    </div>
  );
}

function TransitStep({ leg }: { leg: TransitLeg }) {
  const isBus = leg.mode === "bus";
  const Icon = isBus ? Bus : TrainFront;
  const tone = getTransitTone(leg);

  return (
    <div className={`rounded-2xl border p-3 ${tone.card}`}>
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-2xl text-white flex items-center justify-center shrink-0 ${tone.icon}`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-base text-neutral-950 truncate" style={{ fontWeight: 900 }}>
                {formatRouteName(leg.routeName)}
              </div>
              <div className="text-xs text-neutral-600 truncate">
                {leg.startName} 승차 → {leg.endName} 하차
              </div>
            </div>
            <div
              className={`rounded-full px-2.5 py-1 text-xs tabular-nums shrink-0 ${tone.subtleBadge}`}
              style={{ fontWeight: 900 }}
            >
              {getTransitWaitLabel(leg)}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-xs">
            <div className="text-neutral-600 truncate">
              {getShortDirectionCopy(leg)}
            </div>
            <div className="text-neutral-500 tabular-nums shrink-0">
              탑승 {leg.durationMinutes}분
              {leg.stationCount ? ` · ${leg.stationCount}개 정류장` : ""}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SegmentRow({
  segment,
  icon,
}: {
  segment?: RouteSegment;
  icon: "walk" | "wait" | "ride";
}) {
  if (!segment) {
    return null;
  }

  const Icon = icon === "walk" ? Footprints : icon === "ride" ? TrainFront : Timer;

  return (
    <TimelineRow
      icon={<Icon className="w-4 h-4" />}
      title={segment.label}
      detail={segment.detail}
      meta={formatSegmentMeta(segment)}
    />
  );
}

function TransitLegRow({ leg }: { leg: TransitLeg }) {
  const Icon = leg.mode === "bus" ? Bus : TrainFront;

  return (
    <TimelineRow
      icon={<Icon className="w-4 h-4" />}
      title={formatRouteName(leg.routeName)}
      detail={`${getShortDirectionCopy(leg)} → ${leg.endName} 하차`}
      meta={getTransitWaitLabel(leg)}
    />
  );
}

function TimelineRow({
  title,
  detail,
  meta,
  icon,
  dotClassName = "bg-neutral-200",
  isLast = false,
}: {
  title: string;
  detail: string;
  meta?: string;
  icon?: ReactNode;
  dotClassName?: string;
  isLast?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center pt-1">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center ${
            icon ? "bg-neutral-100 text-neutral-700" : dotClassName
          }`}
        >
          {icon}
        </div>
        {!isLast && <div className="w-px h-8 bg-neutral-200" />}
      </div>
      <div className="min-w-0 flex-1 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm text-neutral-900 truncate" style={{ fontWeight: 900 }}>
              {title}
            </div>
            <div className="text-xs text-neutral-500 leading-5 truncate">{detail}</div>
          </div>
          {meta && (
            <div className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700 tabular-nums">
              {meta}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function sumSegmentMinutes(segments: RouteSegment[], type: RouteSegment["type"]) {
  return segments
    .filter((segment) => segment.type === type)
    .reduce((sum, segment) => sum + segment.durationMinutes, 0);
}

function getPlanningCopy(routePlan: RoutePlan) {
  if (routePlan.summary.planningMode === "leaveNow") {
    return "지금 출발 기준";
  }

  return `목표 ${routePlan.summary.targetArrivalTime}`;
}

function getOverviewSubcopy(routePlan: RoutePlan) {
  if (routePlan.summary.planningMode === "leaveNow") {
    return `도착 ${routePlan.summary.expectedArrivalTime}`;
  }

  if (isLateToTarget(routePlan)) {
    return `지금 출발 ${routePlan.summary.currentExpectedArrivalTime} 도착`;
  }

  if (isTooEarlyForTarget(routePlan)) {
    return `추천 ${routePlan.summary.recommendedDepartureTime} · 도착 ${routePlan.summary.expectedArrivalTime}`;
  }

  return `지금 출발 ${routePlan.summary.currentExpectedArrivalTime} 도착`;
}

function getDetailTimingCopy(routePlan: RoutePlan) {
  if (routePlan.summary.planningMode === "leaveNow") {
    return `${routePlan.summary.recommendedDepartureTime} 출발 · ${routePlan.summary.expectedArrivalTime} 도착`;
  }

  return `추천 ${routePlan.summary.recommendedDepartureTime} 출발 · 지금 출발 ${routePlan.summary.currentExpectedArrivalTime}`;
}

function getTimelineDepartureCopy(routePlan: RoutePlan) {
  if (routePlan.summary.planningMode === "leaveNow" || isLateToTarget(routePlan)) {
    return "지금 출발";
  }

  return `${routePlan.summary.recommendedDepartureTime} 출발`;
}

function getTimelineArrivalCopy(routePlan: RoutePlan) {
  if (routePlan.summary.planningMode === "arriveBy" && isLateToTarget(routePlan)) {
    return `${routePlan.summary.currentExpectedArrivalTime} 도착`;
  }

  return `${routePlan.summary.expectedArrivalTime} 도착`;
}

function getAdviceToneClassName(
  tone: RoutePlan["summary"]["departureAdvice"]["tone"]
) {
  if (tone === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }

  if (tone === "neutral") {
    return "border-neutral-200 bg-neutral-50 text-neutral-800";
  }

  return "border-blue-200 bg-blue-50 text-blue-900";
}

function getSourceLabel(routePlan: RoutePlan, isLoading: boolean) {
  if (isLoading && !routePlan.transitEstimate) {
    return "계산 중";
  }

  if (routePlan.transitEstimate?.isRealtime) {
    return "실시간 반영";
  }

  if (routePlan.transitEstimate) {
    return "경로 반영";
  }

  return routePlan.summary.routeStatusLabel;
}

function getSummaryTitle(routePlan: RoutePlan, isLoading: boolean) {
  if (!routePlan.summary.isReliableEstimate) {
    return isLoading ? "경로 확인 중" : "경로 확인 필요";
  }

  if (routePlan.summary.planningMode === "leaveNow") {
    return "지금 출발";
  }

  if (isLateToTarget(routePlan)) {
    return "지금 출발";
  }

  return `${routePlan.summary.recommendedDepartureTime} 출발`;
}

function getDepartureValue(routePlan: RoutePlan) {
  if (routePlan.summary.planningMode === "leaveNow") {
    return "지금";
  }

  return routePlan.summary.isReliableEstimate
    ? routePlan.summary.recommendedDepartureTime
    : "계산 중";
}

function getDepartureMetricLabel(routePlan: RoutePlan) {
  return routePlan.summary.planningMode === "leaveNow" ? "출발" : "추천 출발";
}

function getArrivalMetricLabel(routePlan: RoutePlan) {
  return routePlan.summary.planningMode === "leaveNow" ? "도착" : "지금 도착";
}

function getArrivalMetricValue(routePlan: RoutePlan) {
  return routePlan.summary.planningMode === "leaveNow"
    ? routePlan.summary.expectedArrivalTime
    : routePlan.summary.currentExpectedArrivalTime;
}

function getDeltaMetricLabel(routePlan: RoutePlan) {
  return routePlan.summary.planningMode === "leaveNow" ? "상태" : "목표 차이";
}

function getDeltaMetricValue(routePlan: RoutePlan) {
  return routePlan.summary.planningMode === "leaveNow"
    ? routePlan.summary.arrivalDeltaLabel
    : routePlan.summary.currentArrivalDeltaLabel;
}

function isLateToTarget(routePlan: RoutePlan) {
  return (
    routePlan.summary.planningMode === "arriveBy" &&
    routePlan.summary.currentArrivalDeltaMinutes > 2
  );
}

function isTooEarlyForTarget(routePlan: RoutePlan) {
  return (
    routePlan.summary.planningMode === "arriveBy" &&
    routePlan.summary.currentArrivalDeltaMinutes < -5
  );
}

function getSegmentClock(
  segments: RouteSegment[],
  index: number,
  elapsedSeconds: number
): SegmentClock {
  const startSeconds = segments
    .slice(0, index)
    .reduce((sum, segment) => sum + getSegmentDurationSeconds(segment), 0);
  const durationSeconds = getSegmentDurationSeconds(segments[index]);
  const endSeconds = startSeconds + durationSeconds;

  if (elapsedSeconds >= endSeconds) {
    return {
      label: "완료",
      tone: "done",
    };
  }

  if (elapsedSeconds >= startSeconds) {
    return {
      label: formatSecondsCountdown(endSeconds - elapsedSeconds),
      tone: "active",
    };
  }

  return {
    label: formatSecondsCountdown(durationSeconds),
    tone: "upcoming",
  };
}

function getStaticSegmentClock(segment: RouteSegment): SegmentClock {
  return {
    label: formatSegmentMeta(segment) ?? "확인",
    tone: "upcoming",
  };
}

function getSegmentDurationSeconds(segment?: RouteSegment) {
  const minutes = Number(segment?.durationMinutes);

  if (!Number.isFinite(minutes) || minutes <= 0) {
    return 0;
  }

  return Math.max(1, Math.round(minutes * 60));
}

function formatSegmentMeta(segment: RouteSegment) {
  if (segment.isUnavailable) {
    return "확인 필요";
  }

  if (segment.durationMinutes <= 0) {
    return undefined;
  }

  return `${segment.durationMinutes}분${
    segment.distanceMeters ? ` · ${segment.distanceMeters}m` : ""
  }`;
}

function formatShortDuration(durationMinutes?: number) {
  const minutes = Number(durationMinutes);

  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "0분";
  }

  return `${Math.round(minutes)}분`;
}

function getTransitLegTotalMinutes(
  leg: TransitLeg,
  index: number,
  boardingWait?: RouteSegment
) {
  const waitMinutes = index === 0 ? boardingWait?.durationMinutes ?? 0 : 0;

  return waitMinutes + leg.durationMinutes;
}

function getTransitWaitLabel(leg: TransitLeg) {
  if (leg.realtimeWaitMinutes !== undefined) {
    if (leg.realtimeWaitMinutes <= 0) {
      return "곧 도착";
    }

    return `${leg.realtimeWaitMinutes}분 후`;
  }

  return `${leg.durationMinutes}분`;
}

function getBoardingDirectionCopy(leg: TransitLeg) {
  const direction = getLegDirectionLabel(leg);

  return direction ? `${leg.startName} 승차 · ${direction}` : `${leg.startName} 승차`;
}

function getShortDirectionCopy(leg: TransitLeg) {
  const direction = getLegDirectionLabel(leg);

  return direction || `${leg.startName} 승차`;
}

function getLegDirectionLabel(leg: TransitLeg) {
  return leg.directionLabel || (leg.direction ? `${leg.direction} 방면` : "");
}
