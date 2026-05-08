import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Timer } from "lucide-react";
import { type RoutePoint, type TrafficSignalPreview } from "../domain/eta";

interface SignalInsightCardProps {
  signal: TrafficSignalPreview;
  signals?: TrafficSignalPreview[];
  currentPosition?: RoutePoint;
  originPoint?: RoutePoint;
  compact?: boolean;
}

interface LiveSignalState extends TrafficSignalPreview {
  activeIndex: number;
  reachRemainingSeconds: number;
  delaySeconds: number;
  elapsedSeconds: number;
}

export function SignalInsightCard({
  signal,
  signals,
  currentPosition,
  originPoint,
  compact = false,
}: SignalInsightCardProps) {
  const signalList = useMemo(
    () => (signals?.length ? signals : [signal]),
    [signal, signals]
  );
  const signalVersion = signalList
    .map((item) => `${item.id}:${item.remainingSeconds}:${item.estimatedReachSeconds}`)
    .join("|");
  const [liveSignal, setLiveSignal] = useState(() =>
    createLiveSignal(signalList[0], 0, 0)
  );

  useEffect(() => {
    setLiveSignal(createLiveSignal(signalList[0], 0, 0));
  }, [signalList, signalVersion]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setLiveSignal((current) =>
        tickLiveSignal(current, signalList, currentPosition, originPoint)
      );
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [currentPosition, originPoint, signalList]);

  const isRed = liveSignal.phase === "red";
  const hasNextSignal = liveSignal.activeIndex < signalList.length - 1;
  const canUseLocation = Boolean(currentPosition && originPoint);
  const hasReachedByTime = liveSignal.reachRemainingSeconds === 0;
  const isDelayedByLocation = canUseLocation && hasReachedByTime && hasNextSignal;
  const tone = isRed
    ? {
        border: "border-amber-200",
        bg: "bg-amber-50",
        text: "text-amber-900",
        muted: "text-amber-700",
        badge: "bg-amber-100 text-amber-800",
        dot: "bg-red-500",
      }
    : {
        border: "border-emerald-200",
        bg: "bg-emerald-50",
        text: "text-emerald-900",
        muted: "text-emerald-700",
        badge: "bg-emerald-100 text-emerald-800",
        dot: "bg-emerald-500",
      };

  return (
    <div className={`rounded-2xl border ${tone.border} ${tone.bg} ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/80 border border-white flex items-center justify-center shrink-0">
          {isRed ? (
            <AlertCircle className={`w-5 h-5 ${tone.muted}`} />
          ) : (
            <Timer className={`w-5 h-5 ${tone.muted}`} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 mb-1">
            <div className={`text-sm ${tone.text}`} style={{ fontWeight: 700 }}>
              {liveSignal.crossingName}
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${tone.badge}`}
              style={{ fontWeight: 700 }}
            >
              예상 {liveSignal.activeIndex + 1}/{signalList.length}
            </span>
          </div>

          <div className="flex items-end justify-between gap-3">
            <div>
              <div className={`text-xs ${tone.muted}`}>{liveSignal.phaseLabel}</div>
              <div className={`text-2xl tabular-nums ${tone.text}`} style={{ fontWeight: 800 }}>
                {formatSignalSeconds(liveSignal.remainingSeconds)}
              </div>
              {!compact && (
                <div className={`text-xs ${tone.muted}`} style={{ fontWeight: 600 }}>
                  {getLocationStatusLabel(
                    hasNextSignal,
                    canUseLocation,
                    isDelayedByLocation,
                    liveSignal
                  )}
                </div>
              )}
              {!compact && currentPosition?.accuracyMeters && (
                <div className="mt-1 text-[11px] text-neutral-500">
                  GPS 오차 ±{Math.round(currentPosition.accuracyMeters)}m 반영
                </div>
              )}
            </div>
            <div className="text-right">
              <div className={`text-xs ${tone.muted}`}>{liveSignal.nextPhaseLabel}</div>
              <div className={`text-sm tabular-nums ${tone.text}`} style={{ fontWeight: 700 }}>
                {formatSignalSeconds(liveSignal.nextPhaseSeconds)}
              </div>
            </div>
          </div>

          {!compact && (
            <div className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
              <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
              <span>
                {liveSignal.updatedAtLabel} · 실제 신호 연동 전 예측값
                {getLocationProgressLabel(
                  hasNextSignal,
                  canUseLocation,
                  isDelayedByLocation,
                  liveSignal
                )}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function createLiveSignal(
  signal: TrafficSignalPreview,
  activeIndex: number,
  elapsedSeconds: number,
  delaySeconds = 0
): LiveSignalState {
  const liveSignal = applySignalElapsed(signal, elapsedSeconds);

  return {
    ...liveSignal,
    activeIndex,
    reachRemainingSeconds: Math.max(0, signal.estimatedReachSeconds - elapsedSeconds),
    delaySeconds,
    elapsedSeconds,
  };
}

function tickLiveSignal(
  signal: LiveSignalState,
  signals: TrafficSignalPreview[],
  currentPosition: RoutePoint | undefined,
  originPoint: RoutePoint | undefined
): LiveSignalState {
  const nextElapsedSeconds = signal.elapsedSeconds + 1;
  const activeSignal = signals[signal.activeIndex] ?? signal;
  const nextPhaseSignal = createLiveSignal(
    activeSignal,
    signal.activeIndex,
    nextElapsedSeconds,
    signal.delaySeconds
  );
  const hasNextSignal = signal.activeIndex < signals.length - 1;

  if (!hasNextSignal) {
    return nextPhaseSignal;
  }

  if (hasPassedSignal(signal, currentPosition, originPoint)) {
    return createLiveSignal(
      signals[signal.activeIndex + 1],
      signal.activeIndex + 1,
      nextElapsedSeconds
    );
  }

  if (nextPhaseSignal.reachRemainingSeconds > 0) {
    return nextPhaseSignal;
  }

  return {
    ...nextPhaseSignal,
    reachRemainingSeconds: 0,
    delaySeconds: currentPosition && originPoint ? signal.delaySeconds + 1 : signal.delaySeconds,
  };
}

function applySignalElapsed(
  signal: TrafficSignalPreview,
  elapsedSeconds: number
): TrafficSignalPreview {
  let phase = signal.phase;
  let remainingSeconds = signal.remainingSeconds;
  let elapsed = Math.max(0, elapsedSeconds);
  const greenSeconds = Math.max(1, signal.cycleSeconds - signal.redSeconds);
  const redSeconds = Math.max(1, signal.redSeconds);

  while (elapsed >= remainingSeconds) {
    elapsed -= remainingSeconds;
    phase = phase === "red" ? "green" : "red";
    remainingSeconds = phase === "red" ? redSeconds : greenSeconds;
  }

  const nextRemainingSeconds = Math.max(0, Math.ceil(remainingSeconds - elapsed));

  return {
    ...signal,
    phase,
    phaseLabel: phase === "red" ? "보행 대기" : "보행 가능",
    remainingSeconds: nextRemainingSeconds,
    nextPhaseLabel: phase === "red" ? "다음 녹색" : "다음 적색",
    nextPhaseSeconds: nextRemainingSeconds,
  };
}

function hasPassedSignal(
  signal: LiveSignalState,
  currentPosition: RoutePoint | undefined,
  originPoint: RoutePoint | undefined
) {
  if (!currentPosition || !originPoint) {
    return false;
  }

  const accuracyBuffer = Math.min(currentPosition.accuracyMeters ?? 0, 30);
  const distanceFromOrigin = getDistanceMeters(originPoint, currentPosition);

  return distanceFromOrigin >= signal.passDistanceMeters + accuracyBuffer;
}

function getLocationProgressLabel(
  hasNextSignal: boolean,
  canUseLocation: boolean,
  isDelayedByLocation: boolean,
  signal: LiveSignalState
) {
  if (!hasNextSignal) {
    return "";
  }

  if (!canUseLocation) {
    return " · 안내 시작 후 위치 판단";
  }

  if (isDelayedByLocation) {
    return ` · 위치상 미통과 +${formatSignalSeconds(signal.delaySeconds)}${formatGpsBuffer(signal)}`;
  }

  return ` · 위치가 기준선을 넘으면 다음 신호${formatGpsBuffer(signal)}`;
}

function getLocationStatusLabel(
  hasNextSignal: boolean,
  canUseLocation: boolean,
  isDelayedByLocation: boolean,
  signal: LiveSignalState
) {
  if (!hasNextSignal) {
    return "마지막 확인 신호";
  }

  if (!canUseLocation) {
    return "안내 시작 후 위치 기반 판단";
  }

  if (isDelayedByLocation) {
    return `기준선 미통과 +${formatSignalSeconds(signal.delaySeconds)}`;
  }

  return `통과 기준 ${signal.passDistanceMeters}m`;
}

function formatGpsBuffer(signal: LiveSignalState) {
  if (!signal.gpsAccuracyMeters) {
    return "";
  }

  return ` · GPS ±${Math.round(signal.gpsAccuracyMeters)}m`;
}

function getDistanceMeters(a: RoutePoint, b: RoutePoint) {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h));
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function formatSignalSeconds(seconds: number) {
  return `${Math.max(0, Math.round(seconds))}초`;
}
