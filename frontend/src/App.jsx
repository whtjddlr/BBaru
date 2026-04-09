import { startTransition, useDeferredValue, useEffect, useRef, useState } from "react";
import TransitMap from "./components/TransitMap";
import { buildPlannerScene, getScenarioMapScene } from "./scenarioMapData";
import { apiBaseUrl, apiUrl } from "./utils/api";

const SOURCE_LABELS = {
  mock: "기본 시나리오",
  sample: "샘플 데이터",
  live: "실시간 버스",
  "seoul-live": "서울 통합 라이브",
};

const FRONTEND_BUILD_LABEL = "react-v14";
const PLACE_SEARCH_RADIUS = 20000;
const JOURNEY_SESSION_STORAGE_KEY = "safeeta:journey-session-id";

const NAV_ITEMS = [
  { key: "route", label: "경로" },
  { key: "realtime", label: "실시간" },
  { key: "settings", label: "설정" },
];

const PREFERENCE_MODES = [
  { value: "safety_first", label: "안전 우선" },
  { value: "balanced", label: "균형" },
  { value: "time_first", label: "정시 우선" },
];

const WALK_PROFILES = [
  { id: "relaxed", label: "여유 보행", speedMps: 1.2, detail: "천천히 이동하는 기본값" },
  { id: "standard", label: "일반 성인", speedMps: 1.38, detail: "가장 추천하는 기본 프로필" },
  { id: "brisk", label: "빠른 보행", speedMps: 1.55, detail: "급히 이동하는 상황을 반영" },
];

function formatPercent(value) {
  if (value == null || Number.isNaN(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

function formatDuration(totalSeconds) {
  if (totalSeconds == null || Number.isNaN(totalSeconds)) return "-";
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  if (minutes && seconds) return `${minutes}분 ${seconds}초`;
  if (minutes) return `${minutes}분`;
  return `${seconds}초`;
}

function formatSignedDuration(totalSeconds) {
  if (totalSeconds == null || Number.isNaN(totalSeconds)) return "-";
  const rounded = Math.round(totalSeconds);
  if (rounded === 0) return "변동 없음";
  return `${rounded > 0 ? "+" : "-"}${formatDuration(Math.abs(rounded))}`;
}

function parseClockTime(value) {
  const [hours, minutes] = String(value || "09:00")
    .split(":")
    .map((part) => Number(part));
  return {
    hours: Number.isFinite(hours) ? hours : 9,
    minutes: Number.isFinite(minutes) ? minutes : 0,
  };
}

function buildTargetDate(value, now = new Date()) {
  const { hours, minutes } = parseClockTime(value);
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  if (target.getTime() < now.getTime() - 15 * 60 * 1000) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

function formatClockTime(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

function formatArrivalDelta(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return "-";
  const rounded = Math.round(seconds);
  if (rounded > 0) return `${formatDuration(rounded)} 지각`;
  if (rounded < 0) return `${formatDuration(Math.abs(rounded))} 일찍 도착`;
  return "정시 도착";
}

function scheduleTone(deltaSec) {
  if (deltaSec == null || Number.isNaN(deltaSec)) return "neutral";
  if (deltaSec > 0) return "danger";
  if (deltaSec >= -180) return "good";
  if (deltaSec >= -600) return "caution";
  return "neutral";
}

function buildSchedulePlan(totalJourneySec, recommendedWaitSec, targetArrivalTime, now = new Date()) {
  if (!totalJourneySec) return null;
  const targetDate = buildTargetDate(targetArrivalTime, now);
  const immediateArrival = new Date(now.getTime() + totalJourneySec * 1000);
  const recommendedDeparture = new Date(now.getTime() + Math.max(0, Number(recommendedWaitSec || 0)) * 1000);
  const recommendedArrival = new Date(
    now.getTime() + (totalJourneySec + Math.max(0, Number(recommendedWaitSec || 0))) * 1000,
  );
  const idealDeparture = new Date(targetDate.getTime() - totalJourneySec * 1000);
  const leaveAt = idealDeparture.getTime() > now.getTime() ? idealDeparture : now;
  const leaveInSec = Math.max(0, Math.round((leaveAt.getTime() - now.getTime()) / 1000));
  const deltaSec = Math.round((recommendedArrival.getTime() - targetDate.getTime()) / 1000);
  const latenessSec = Math.max(0, deltaSec);
  const earlinessSec = Math.max(0, -deltaSec);
  const priorityScore = latenessSec * 4 + earlinessSec * 0.65 + Math.max(0, Number(recommendedWaitSec || 0)) * 0.15;

  return {
    targetDate,
    immediateArrival,
    recommendedDeparture,
    recommendedArrival,
    leaveAt,
    leaveInSec,
    deltaSec,
    latenessSec,
    earlinessSec,
    priorityScore,
    tone: scheduleTone(deltaSec),
  };
}

function describeSchedulePlan(plan) {
  if (!plan) {
    return {
      tone: "neutral",
      badge: "도착 계산 대기",
      headline: "경로를 조회하면 권장 출발 시각을 계산합니다.",
      detail: "실제 경로가 잡히면 목표 도착 시각에 맞춰 늦음과 너무 이른 도착을 함께 비교합니다.",
    };
  }

  if (plan.deltaSec > 0) {
    return {
      tone: "danger",
      badge: "지각 가능성",
      headline: `${formatDuration(plan.deltaSec)} 늦게 도착할 가능성이 있습니다.`,
      detail: `출발을 더 앞당기거나 더 빠른 대안 경로가 필요합니다. 권장 출발은 ${formatClockTime(plan.leaveAt)}입니다.`,
    };
  }

  if (plan.deltaSec >= -180) {
    return {
      tone: "good",
      badge: "정시권 도착",
      headline: "목표 도착 시각에 거의 맞게 도착합니다.",
      detail: `권장 출발 ${formatClockTime(plan.leaveAt)}, 예상 도착 ${formatClockTime(plan.recommendedArrival)} 기준입니다.`,
    };
  }

  if (plan.deltaSec >= -600) {
    return {
      tone: "caution",
      badge: "조금 이른 도착",
      headline: `${formatDuration(Math.abs(plan.deltaSec))} 정도 일찍 도착합니다.`,
      detail: `조금 더 늦게 출발해도 정시권 도착이 가능합니다. 권장 출발은 ${formatClockTime(plan.leaveAt)}입니다.`,
    };
  }

  return {
    tone: "neutral",
    badge: "너무 이른 도착",
    headline: `${formatDuration(Math.abs(plan.deltaSec))} 일찍 도착합니다.`,
    detail: "출발을 더 늦춰도 지각하지 않을 가능성이 큽니다. 너무 이른 대기를 줄이는 편이 좋습니다.",
  };
}

function riskTone(level) {
  if (level === "위험") return "danger";
  if (level === "주의") return "caution";
  return "good";
}

function extractStationName(text, fallback = "시청") {
  const match = String(text || "").match(/(.+?)역/);
  return match ? match[1].trim() : fallback;
}

function extractLineName(text, fallback = "2호선") {
  const match = String(text || "").match(
    /(1호선|2호선|3호선|4호선|5호선|6호선|7호선|8호선|9호선|경의중앙선|공항철도|수인분당선|신분당선|경춘선|서해선|우이신설선)/,
  );
  return match ? match[1] : fallback;
}

function deriveSubwayContext(scenario, config) {
  const fallbackStation = config?.defaults?.stationName || "시청";
  const fallbackLine = config?.defaults?.lineName || "2호선";
  if (!scenario) return { stationName: fallbackStation, lineName: fallbackLine };
  return {
    stationName: extractStationName(scenario.target_stop_name || scenario.route_name, fallbackStation),
    lineName: extractLineName(scenario.route_name, fallbackLine),
  };
}

function derivePlannerTransitContext(scenario, config, destinationPlace, destinationInput) {
  const baseContext = deriveSubwayContext(scenario, config);
  const candidate = [destinationPlace?.placeName, destinationPlace?.categoryName, destinationInput]
    .filter(Boolean)
    .join(" ");

  return {
    stationName: extractStationName(candidate, baseContext.stationName),
    lineName: extractLineName(candidate, baseContext.lineName),
    sourceLabel: destinationPlace && /역|지하철|전철/.test(candidate) ? "검색 결과 반영" : "시나리오 기준",
  };
}

function realtimePreview(board) {
  if (!board?.realtimeGroups?.length) return "도착 정보 대기 중";
  return board.realtimeGroups
    .slice(0, 2)
    .map((group) => `${group.directionLabel} ${group.items?.[0]?.etaLabel || "-"}`)
    .join(" · ");
}

function timetablePreview(board) {
  if (!board?.timetableGroups?.length) return "시간표 대기 중";
  return board.timetableGroups
    .slice(0, 2)
    .map((group) => `${group.directionLabel} ${group.next?.[0]?.timeLabel || "-"}`)
    .join(" · ");
}

function comparisonPriority(row) {
  if (!row?.result) return Number.POSITIVE_INFINITY;
  return (row.displayRiskScore ?? row.result.risk_score) - (row.displayCatchProbability ?? row.result.catch_probability) * 18;
}

function plannerOrigin(scene) {
  return scene?.originLabel || scene?.originPoint?.label || scene?.exit?.label || "현재 위치";
}

function plannerDestination(scene, scenario) {
  return (
    scene?.destinationLabel ||
    scene?.destinationPoint?.label ||
    scenario?.target_stop_name ||
    scene?.station?.label ||
    "도착 지점"
  );
}

function mapLegendItems(scene) {
  const items = [];
  if (scene.originPoint?.label && scene.originPoint.label !== scene.exit.label) {
    items.push({ key: "origin", label: scene.originPoint.label, tone: "origin" });
  }
  items.push(
    { key: "exit", label: scene.exit.label, tone: "exit" },
    { key: "crossing", label: scene.crossing.label, tone: "crossing" },
    { key: "wait", label: scene.waitPoint.label, tone: "wait" },
  );
  if (scene.boardStation?.label) {
    items.push({ key: "board", label: scene.boardStation.label, tone: "board" });
  }
  items.push({ key: "station", label: scene.station.label, tone: "station" });
  if (scene.destinationPoint?.label && scene.destinationPoint.label !== scene.station.label) {
    items.push({ key: "destination", label: scene.destinationPoint.label, tone: "destination" });
  }
  return items;
}

function getWalkProfile(profileId) {
  return WALK_PROFILES.find((profile) => profile.id === profileId) || WALK_PROFILES[1];
}

function haversineMeters(from, to) {
  const [lat1, lng1] = from;
  const [lat2, lng2] = to;
  const radius = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pathDistanceMeters(path = []) {
  if (!Array.isArray(path) || path.length < 2) return 0;
  return path.slice(1).reduce((total, point, index) => total + haversineMeters(path[index], point), 0);
}

function dedupePath(points = []) {
  return points.filter((coords, index, array) => {
    if (!Array.isArray(coords)) return false;
    const previous = array[index - 1];
    if (!previous) return true;
    return previous[0] !== coords[0] || previous[1] !== coords[1];
  });
}

function activeJourneySegments(scene, result) {
  if (!scene) return [];
  return result?.risk_level === "위험" ? scene.waitJourneySegments || [] : scene.journeySegments || [];
}

function walkDistanceFromSegments(segments = []) {
  return Math.round(
    segments
      .filter((segment) => segment?.kind === "walk")
      .reduce((total, segment) => total + pathDistanceMeters(segment.path || []), 0),
  );
}

function journeyDistanceFromSegments(segments = []) {
  return Math.round(
    segments.reduce((total, segment) => total + pathDistanceMeters(segment?.path || []), 0),
  );
}

function directionFromPoints(from, to) {
  if (!Array.isArray(from) || !Array.isArray(to)) {
    return { label: "이동", className: "forward" };
  }
  const latDelta = to[0] - from[0];
  const lngDelta = to[1] - from[1];
  if (Math.abs(lngDelta) >= Math.abs(latDelta)) {
    return lngDelta >= 0
      ? { label: "우측 이동", className: "east" }
      : { label: "좌측 이동", className: "west" };
  }
  return latDelta >= 0
    ? { label: "직진 이동", className: "north" }
    : { label: "하단 이동", className: "south" };
}

function isTransitLegMode(mode) {
  return ["bus", "subway", "train", "rail"].includes(String(mode || "").toLowerCase());
}

function computeLegDistanceMeters(leg) {
  const pathDistance = Math.round(pathDistanceMeters(leg?.path || []));
  if (pathDistance > 0) return pathDistance;
  return Math.max(0, Math.round(Number(leg?.distance_m || 0)));
}

function selectBoardingArrival(elapsedSec, arrivalCandidates, fallbackEtaSec) {
  const normalized = (arrivalCandidates || []).filter((item) => Number(item?.etaSec || 0) > 0);
  const primary = normalized[0] || null;
  const selected = normalized.find((item) => item.etaSec >= elapsedSec) || null;

  if (selected) {
    return {
      waitSec: Math.max(0, selected.etaSec - elapsedSec),
      selectedArrivalEtaSec: selected.etaSec,
      selectedArrivalLabel: `${selected.directionLabel} ${selected.etaLabel}`.trim(),
      missedPrimaryArrival: Boolean(primary && selected.etaSec !== primary.etaSec),
      usedFallback: false,
    };
  }

  const numericFallback = Math.max(0, Number(fallbackEtaSec || 0));
  if (numericFallback > 0) {
    let estimatedEtaSec = numericFallback;
    while (estimatedEtaSec < elapsedSec) {
      estimatedEtaSec += Math.max(180, numericFallback);
    }
    return {
      waitSec: Math.max(0, estimatedEtaSec - elapsedSec),
      selectedArrivalEtaSec: estimatedEtaSec,
      selectedArrivalLabel: "기본 도착정보 기준",
      missedPrimaryArrival: estimatedEtaSec > numericFallback,
      usedFallback: true,
    };
  }

  return {
    waitSec: 0,
    selectedArrivalEtaSec: 0,
    selectedArrivalLabel: "실시간 대기 반영 없음",
    missedPrimaryArrival: false,
    usedFallback: true,
  };
}

function buildTransitTiming(candidate, walkSpeedMps, signalWaitSec, arrivalEtaSec, recommendedDelaySec = 0, arrivalCandidates = []) {
  if (!candidate || !walkSpeedMps) return null;

  const totalWalkDistance = Math.max(0, Number(candidate.total_walk_distance_m || 0));
  const baseTotalJourneySec = Math.max(0, Number(candidate.total_duration_sec || 0));
  const baseTotalWalkSec = Math.max(
    0,
    Number(
      candidate.total_walk_duration_sec != null
        ? candidate.total_walk_duration_sec
        : (candidate.legs || []).reduce(
            (total, leg) => total + (!isTransitLegMode(leg?.mode) ? Number(leg?.duration_sec || 0) : 0),
            0,
          ),
    ),
  );
  const initialWalkDistance = Math.max(
    0,
    Number(
      candidate.initial_walk_distance_m != null
        ? candidate.initial_walk_distance_m
        : totalWalkDistance,
    ),
  );
  const baseInitialWalkSec = Math.max(0, Number(candidate.initial_walk_duration_sec || 0));
  const finalWalkDistance = Math.max(0, Number(candidate.final_walk_distance_m || 0));
  const baseFinalWalkSec = Math.max(0, Number(candidate.final_walk_duration_sec || 0));
  const transferWalkDistance = Math.max(
    0,
    Number(
      candidate.transfer_walk_distance_m != null
        ? candidate.transfer_walk_distance_m
        : totalWalkDistance - initialWalkDistance - finalWalkDistance,
    ),
  );
  const baseTransferWalkSec = Math.max(0, Number(candidate.transfer_walk_duration_sec || 0));
  const transitRideSec =
    Math.max(0, Number(candidate.total_transit_duration_sec || 0)) ||
    (candidate.legs || []).reduce(
      (total, leg) => total + (isTransitLegMode(leg?.mode) ? Number(leg?.duration_sec || 0) : 0),
      0,
    );

  const signalPenaltySec = Math.max(0, Number(signalWaitSec || 0));
  const recommendedWaitSec = Math.max(0, Number(recommendedDelaySec || 0));
  const legs = Array.isArray(candidate.legs) ? candidate.legs : [];

  let computedInitialWalkSec = 0;
  let computedFinalWalkSec = 0;
  let computedTransferWalkSec = 0;
  let computedInitialWalkDistance = 0;
  let computedFinalWalkDistance = 0;
  let computedTransferWalkDistance = 0;
  let computedTransitRideSec = 0;
  let computedBoardingWaitSec = 0;
  let computedJourneySec = 0;
  let transitLegSeen = false;
  let firstTransitHandled = false;
  let selectedArrivalLabel = "실시간 대기 반영 없음";
  let selectedArrivalEtaSec = 0;
  let missedPrimaryArrival = false;
  const segmentBreakdown = [];

  legs.forEach((leg, index) => {
    if (isTransitLegMode(leg?.mode)) {
      if (!firstTransitHandled) {
        const arrivalSelection = selectBoardingArrival(computedJourneySec, arrivalCandidates, arrivalEtaSec);
        if (arrivalSelection.waitSec > 0) {
          segmentBreakdown.push({
            kind: "wait",
            label: arrivalSelection.missedPrimaryArrival ? "다음 열차 대기" : "첫 열차 대기",
            durationSec: arrivalSelection.waitSec,
            detail: arrivalSelection.selectedArrivalLabel,
          });
          computedJourneySec += arrivalSelection.waitSec;
          computedBoardingWaitSec += arrivalSelection.waitSec;
        }
        selectedArrivalLabel = arrivalSelection.selectedArrivalLabel;
        selectedArrivalEtaSec = arrivalSelection.selectedArrivalEtaSec;
        missedPrimaryArrival = arrivalSelection.missedPrimaryArrival;
        firstTransitHandled = true;
      }

      const transitSec = Math.max(0, Number(leg?.duration_sec || 0));
      segmentBreakdown.push({
        kind: "transit",
        label: leg?.label || "탑승 구간",
        durationSec: transitSec,
        detail: [leg?.start_name, leg?.end_name].filter(Boolean).join(" → "),
      });
      computedJourneySec += transitSec;
      computedTransitRideSec += transitSec;
      transitLegSeen = true;
      return;
    }

    const walkDistance = computeLegDistanceMeters(leg);
    let walkSec = Math.round(walkDistance / walkSpeedMps);
    const hasFutureTransit = legs.slice(index + 1).some((nextLeg) => isTransitLegMode(nextLeg?.mode));

    if (!transitLegSeen) {
      walkSec += signalPenaltySec;
      computedInitialWalkSec += walkSec;
      computedInitialWalkDistance += walkDistance;
    } else if (hasFutureTransit) {
      computedTransferWalkSec += walkSec;
      computedTransferWalkDistance += walkDistance;
    } else {
      computedFinalWalkSec += walkSec;
      computedFinalWalkDistance += walkDistance;
    }

    segmentBreakdown.push({
      kind: "walk",
      label: leg?.label || "도보 구간",
      durationSec: walkSec,
      distanceM: walkDistance,
      detail: [leg?.start_name, leg?.end_name].filter(Boolean).join(" → "),
    });
    computedJourneySec += walkSec;
  });

  const totalWalkSec = computedInitialWalkSec + computedTransferWalkSec + computedFinalWalkSec;
  const baseNonWalkSec = Math.max(0, baseTotalJourneySec - baseTotalWalkSec);
  const baseAdjustedJourneySec = baseNonWalkSec + totalWalkSec;
  const totalJourneySec = missedPrimaryArrival
    ? Math.max(baseAdjustedJourneySec, computedJourneySec)
    : baseAdjustedJourneySec || computedJourneySec;
  const adjustmentSec = baseTotalJourneySec ? totalJourneySec - baseTotalJourneySec : 0;

  return {
    baseTotalJourneySec,
    baseTotalWalkSec,
    baseInitialWalkSec,
    baseFinalWalkSec,
    baseTransferWalkSec,
    totalWalkSec,
    initialWalkSec: computedInitialWalkSec || Math.round(initialWalkDistance / walkSpeedMps) + signalPenaltySec,
    finalWalkSec: computedFinalWalkSec || Math.round(finalWalkDistance / walkSpeedMps),
    transferWalkSec: computedTransferWalkSec || Math.round(transferWalkDistance / walkSpeedMps),
    transitRideSec: computedTransitRideSec || transitRideSec,
    recommendedWaitSec,
    boardingWaitSec: computedBoardingWaitSec,
    totalJourneySec,
    recommendedTotalJourneySec: totalJourneySec + recommendedWaitSec,
    adjustmentSec,
    initialWalkDistance: computedInitialWalkDistance || initialWalkDistance,
    finalWalkDistance: computedFinalWalkDistance || finalWalkDistance,
    transferWalkDistance: computedTransferWalkDistance || transferWalkDistance,
    segmentBreakdown,
    selectedArrivalLabel,
    selectedArrivalEtaSec,
    missedPrimaryArrival,
  };
}

function clampMetric(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function deriveRouteDecisionMetrics(result, timing, signalWaitSec, safetyBufferSec) {
  if (!result) return null;
  if (!timing) {
    return {
      catchProbability: result.catch_probability ?? null,
      riskScore: result.risk_score ?? null,
      riskLevel: result.risk_level ?? "대기",
    };
  }

  const contextRisk = clampMetric(Number(result.context_risk ?? 0.14), 0, 1);
  const crossingRisk = clampMetric(Number(result.crossing_risk ?? 0.28), 0, 1);
  const walkPressure = clampMetric((Number(timing.totalWalkSec || 0) || 0) / 1200, 0.06, 0.92);
  const signalPressure = clampMetric(Number(signalWaitSec || 0) / 90, 0.05, 0.95);
  const waitRelief = clampMetric(Number(timing.recommendedWaitSec || 0) / 120, 0, 0.6);

  let catchProbability = Number(result.catch_probability ?? 0.5);
  let arrivalPressure = clampMetric(1 - catchProbability, 0.08, 0.95);

  if (Number(timing.selectedArrivalEtaSec || 0) > 0) {
    const slackSec = Number(timing.selectedArrivalEtaSec || 0) - Number(timing.initialWalkSec || 0) - Number(safetyBufferSec || 0);
    catchProbability = clampMetric(sigmoid(slackSec / 55) * 0.88, 0.08, 0.97);
    if (timing.missedPrimaryArrival) {
      catchProbability = clampMetric(catchProbability - 0.08, 0.05, 0.95);
    }
    arrivalPressure = clampMetric(1 - catchProbability, 0.08, 0.96);
  } else {
    catchProbability = clampMetric(catchProbability * 0.45 + 0.24, 0.12, 0.82);
    arrivalPressure = clampMetric(1 - catchProbability, 0.18, 0.88);
  }

  const riskScore = Math.round(
    100 *
      clampMetric(
        0.30 * arrivalPressure +
          0.24 * crossingRisk +
          0.18 * walkPressure +
          0.14 * signalPressure +
          0.14 * contextRisk -
          0.08 * waitRelief,
        0.08,
        0.92,
      ),
  );

  let riskLevel = "양호";
  if (riskScore >= 70) riskLevel = "위험";
  else if (riskScore >= 42) riskLevel = "주의";

  return {
    catchProbability,
    riskScore,
    riskLevel,
  };
}

function segmentValue(segment) {
  const distance = Math.round(pathDistanceMeters(segment?.path || []));
  if (segment?.kind === "transit") {
    return segment?.lineLabel || "지하철 이동";
  }
  return `${distance}m`;
}

function secondsForPath(path, walkSpeedMps) {
  if (!walkSpeedMps) return 0;
  return Math.round(pathDistanceMeters(path || []) / walkSpeedMps);
}

function remainingJourneySeconds(totalSec, consumedSec) {
  return Math.max(0, Math.round((totalSec || 0) - (consumedSec || 0)));
}

function buildDemoJourneyStages({ scene, walkSpeedMps, transitTiming, riskLevel, originLabel, destinationLabel }) {
  const waitApproachPath = dedupePath([scene?.originPoint?.coords, scene?.exit?.coords, scene?.waitPoint?.coords]);
  const boardApproachPath = dedupePath([scene?.waitPoint?.coords || scene?.originPoint?.coords, scene?.crossing?.coords, scene?.boardStation?.coords]);
  const waitApproachSec = secondsForPath(waitApproachPath, walkSpeedMps);
  const boardingWaitSec = Number(transitTiming?.boardingWaitSec || 0);
  const transitRideSec = Number(transitTiming?.transitRideSec || 0);
  const finalWalkSec = Number(transitTiming?.finalWalkSec || 0);
  const totalJourneySec = Number(transitTiming?.totalJourneySec || waitApproachSec + boardingWaitSec + transitRideSec + finalWalkSec);

  const stages = [
    {
      id: "start",
      title: "출발",
      label: originLabel,
      remainingSec: totalJourneySec,
      caption: "입력한 조건으로 전체 ETA를 기준 계산합니다.",
    },
  ];

  if (scene?.waitPoint?.label) {
    stages.push({
      id: "recalc",
      title: "재계산",
      label: scene.waitPoint.label,
      remainingSec: remainingJourneySeconds(totalJourneySec, waitApproachSec),
      caption: riskLevel === "위험" ? "여기서 신호와 다음 열차를 다시 확인합니다." : "상황이 바뀌면 여기서 다시 계산하는 지점입니다.",
    });
  }

  if (scene?.boardStation?.label) {
    stages.push({
      id: "board",
      title: "승강장",
      label: scene.boardStation.label,
      remainingSec: boardingWaitSec + transitRideSec + finalWalkSec,
      caption: boardingWaitSec > 0 ? `첫 탑승 전 대기 ${formatDuration(boardingWaitSec)}가 반영됩니다.` : "바로 탑승 가능한 상태를 보여줍니다.",
    });
  }

  if (scene?.station?.label) {
    stages.push({
      id: "alight",
      title: "하차",
      label: scene.station.label,
      remainingSec: finalWalkSec,
      caption: "하차 이후 마지막 도보 구간만 남은 상태입니다.",
    });
  }

  stages.push({
    id: "arrival",
    title: "도착",
    label: destinationLabel,
    remainingSec: 0,
    caption: "최종 도착 지점까지 완료된 흐름입니다.",
  });

  return stages;
}

function plannerScope(scene) {
  return { x: scene.center[1], y: scene.center[0], radius: PLACE_SEARCH_RADIUS };
}

function defaultDecisionText(result) {
  if (!result) {
    return {
      headline: "출발지와 도착지를 고르면 바로 판단합니다",
      action: "먼저 검색 결과를 하나씩 선택하세요",
      detail: "선택한 지점의 좌표를 기준으로 전체 도보 거리와 ETA를 다시 계산합니다.",
    };
  }
  if (result.risk_level === "위험") {
    return {
      headline: "지금은 바로 건너지 말고 재확인이 필요합니다",
      action: "횡단을 보류하고 다음 타이밍을 확인하세요",
      detail: "현재 조건에서는 잠시 대기한 뒤 다시 계산하는 편이 더 안전합니다.",
    };
  }
  if (result.catch_probability >= 0.6) {
    return {
      headline: "지금 출발해도 흐름이 크게 무너지지 않습니다",
      action: "현재 속도를 유지하고 이동하세요",
      detail: "전체 경로와 실시간 도착 흐름을 함께 반영했을 때 지금 출발이 가장 안정적입니다.",
    };
  }
  return {
    headline: "조금 더 확인한 뒤 출발하는 편이 좋습니다",
    action: "다음 신호 또는 다음 열차를 먼저 확인하세요",
    detail: "지금 움직이면 놓칠 가능성이 있어 여유를 두고 판단하는 쪽이 더 낫습니다.",
  };
}

function formatPlaceDistance(distance) {
  if (!distance) return "";
  if (distance >= 1000) return `${(distance / 1000).toFixed(1)}km`;
  return `${distance}m`;
}

function formatMeters(distance) {
  if (distance == null || Number.isNaN(distance)) return "-";
  if (distance >= 1000) return `${(distance / 1000).toFixed(1)}km`;
  return `${Math.round(distance)}m`;
}

function formatSpeed(speedMps) {
  if (speedMps == null || Number.isNaN(speedMps)) return "-";
  return `${Number(speedMps).toFixed(2)}m/s`;
}

function formatSignedMeters(distance) {
  if (distance == null || Number.isNaN(distance)) return "변화 전";
  const rounded = Math.round(distance);
  if (rounded === 0) return "변화 없음";
  return `${rounded > 0 ? "+" : "-"}${formatMeters(Math.abs(rounded))}`;
}

function formatSignedScore(score) {
  if (score == null || Number.isNaN(score)) return "변화 전";
  const rounded = Math.round(score);
  if (rounded === 0) return "변화 없음";
  return `${rounded > 0 ? "+" : ""}${rounded}점`;
}

function formatSignedPercentPoint(value) {
  if (value == null || Number.isNaN(value)) return "변화 전";
  const rounded = Math.round(value * 100);
  if (rounded === 0) return "변화 없음";
  return `${rounded > 0 ? "+" : ""}${rounded}%p`;
}

function formatSignedSpeed(speedMps) {
  if (speedMps == null || Number.isNaN(speedMps)) return "변화 전";
  const rounded = Math.round(Number(speedMps) * 100) / 100;
  if (Math.abs(rounded) < 0.01) return "변화 없음";
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)}m/s`;
}

function deltaTone(delta, direction = "higher_better") {
  if (delta == null || Number.isNaN(delta) || Math.abs(delta) < 0.0001) return "neutral";
  const improved = direction === "lower_better" ? delta < 0 : delta > 0;
  return improved ? "improved" : "worse";
}

function buildModeMetricSnapshot(comparisonMap, routeCandidate, walkSpeedMps, signalWaitSec, arrivalCandidates, safetyBufferSec) {
  return Object.fromEntries(
    PREFERENCE_MODES.map(({ value }) => {
      const result = comparisonMap?.[value];
      if (!result) return [value, null];
      const timing = buildTransitTiming(
        routeCandidate,
        walkSpeedMps,
        signalWaitSec,
        result.bus_eta_p50_sec,
        result.recommended_wait_sec,
        arrivalCandidates,
      );
      const routeMetrics = deriveRouteDecisionMetrics(result, timing, signalWaitSec, safetyBufferSec);
      return [
        value,
        {
          totalJourneySec: timing?.totalJourneySec ?? null,
          walkEtaSec: timing?.initialWalkSec ?? result.walk_eta_p50_sec ?? null,
          catchProbability: routeMetrics?.catchProbability ?? result.catch_probability ?? null,
          riskScore: routeMetrics?.riskScore ?? result.risk_score ?? null,
        },
      ];
    }),
  );
}

function formatFare(amount) {
  if (amount == null || Number.isNaN(amount)) return "-";
  return `${Math.round(amount).toLocaleString("ko-KR")}원`;
}

function normalizeTransitRouteError(detail) {
  const text = String(detail || "").trim();
  if (!text) return "실제 경로 후보를 불러오지 못했습니다.";
  if (text.includes("TMAP 대중교통 경로 API 권한이 없습니다")) {
    return "실제 경로 조회 권한이 아직 승인되지 않았습니다. TMAP 대중교통 routes 상품 승인 후 다시 시도해주세요.";
  }
  if (text.includes("호출 한도")) {
    return "오늘 사용할 수 있는 실제 경로 조회 횟수를 모두 사용했습니다.";
  }
  return text;
}

function readRealtimePrimary(item) {
  return item?.etaLabel || item?.arrivalLabel || item?.arrivalTimeLabel || item?.message || "-";
}

function readRealtimeSecondary(item) {
  return (
    item?.arrivalMessage ||
    item?.message ||
    item?.destinationLabel ||
    item?.trainLineName ||
    item?.trainLineNm ||
    item?.updnLine ||
    ""
  );
}

function readTimetableLabel(item) {
  return item?.timeLabel || item?.arrivalTime || item?.trainTime || item?.time || "-";
}

function flattenRealtimeArrivalCandidates(board) {
  return (board?.realtimeGroups || [])
    .flatMap((group) =>
      (group.items || []).map((item, index) => ({
        etaSec: Number(item?.etaSec || 0),
        etaLabel: item?.etaLabel || "-",
        directionLabel: group.directionLabel || "",
        ordinal: index,
      })),
    )
    .filter((item) => item.etaSec > 0)
    .sort((left, right) => left.etaSec - right.etaSec)
    .slice(0, 4);
}

function sourceStatusClass(status) {
  if (status === "active") return "source-active";
  if (status === "sample") return "source-sample";
  if (status === "review") return "source-review";
  return "source-pending";
}

function sourceStatusLabel(status) {
  if (status === "active") return "연결됨";
  if (status === "sample") return "샘플";
  if (status === "review") return "검증 중";
  return "대기";
}

function PlaceSearchField({ label, value, placeholder, suggestions, isSearching, onChange, onSelect }) {
  return (
    <label className={`planner-field ${suggestions.length ? "is-open" : ""}`}>
      <span>{label}</span>
      <div className="planner-input-wrap">
        <input type="text" value={value} onChange={onChange} placeholder={placeholder} autoComplete="off" />
        {isSearching ? <small className="planner-field-meta">검색 중</small> : null}
      </div>
      {suggestions.length ? (
        <div className="planner-suggestion-list">
          {suggestions.map((item) => (
            <button
              type="button"
              key={`${label}-${item.id || item.placeName}`}
              className="planner-suggestion-item"
              onClick={() => onSelect(item)}
            >
              <div>
                <strong>{item.placeName}</strong>
                <p>{item.roadAddressName || item.addressName || item.categoryName || "주소 정보 없음"}</p>
              </div>
              <span>{formatPlaceDistance(item.distance)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </label>
  );
}

function SectionHeader({ eyebrow, title, description, rightSlot }) {
  return (
    <div className="section-header">
      <div>
        <p className="section-kicker">{eyebrow}</p>
        <h3>{title}</h3>
        {description ? <p className="section-description">{description}</p> : null}
      </div>
      {rightSlot}
    </div>
  );
}

function TransitRouteSection({
  routes,
  isLoading,
  error,
  hasRouteKey,
  quotas,
  walkSpeedMps,
  signalWaitSec,
  arrivalEtaSec,
  recommendedDelaySec,
  arrivalCandidates,
}) {
  const candidates = routes?.candidates || [];
  const usage = routes?.usage || {};

  return (
    <article className="surface-card">
      <SectionHeader
        eyebrow="3. 실제 경로 후보"
        title="도보와 대중교통 구간을 나눈 실제 경로"
        description="TMAP 대중교통 경로의 거리 정보만 받아오고, ETA는 SafeETA가 다시 계산합니다."
        rightSlot={<span className="provider-chip">TMAP transit</span>}
      />

      {!hasRouteKey ? (
        <p className="planner-note subdued">
          TMAP 경로 키를 넣으면 출발지부터 도착지까지의 실제 도보 거리, 총 이동 거리, 환승 횟수를 바로 반영합니다.
        </p>
      ) : null}
      {hasRouteKey ? (
        <p className="planner-note subdued">
          {usage.limit
            ? `대중교통 경로 오늘 ${usage.used || 0}/${usage.limit}회 사용, 남은 ${usage.remaining ?? "-"}회`
            : "수동 조회를 눌렀을 때만 실제 경로 API를 호출합니다."}
          {usage.cached ? " 같은 경로는 캐시로 재사용합니다." : ""}
        </p>
      ) : null}
      {hasRouteKey && quotas?.statisticalDaily ? (
        <p className="planner-note subdued">
          통계성 열차 혼잡도 계열은 별도 {quotas.statisticalDaily}회/일로 관리합니다.
        </p>
      ) : null}
      {isLoading ? <p className="planner-note">실제 경로 후보를 불러오는 중입니다.</p> : null}
      {error ? <p className="planner-note warning">{error}</p> : null}

      {candidates.length ? (
        <div className="route-candidate-list">
          {candidates.slice(0, 3).map((candidate) => (
            <div className="route-candidate-card" key={`candidate-${candidate.index}`}>
              {(() => {
                const timing = buildTransitTiming(
                  candidate,
                  walkSpeedMps,
                  signalWaitSec,
                  arrivalEtaSec,
                  recommendedDelaySec,
                  arrivalCandidates,
                );
                return (
                  <>
              <div className="route-candidate-head">
                <strong>{`후보 ${candidate.index}`}</strong>
                <span>{candidate.summary}</span>
              </div>
              <div className="route-candidate-metrics">
                <div>
                  <span>총 이동거리</span>
                  <strong>{formatMeters(candidate.total_distance_m)}</strong>
                </div>
                <div>
                  <span>총 도보거리</span>
                  <strong>{formatMeters(candidate.total_walk_distance_m)}</strong>
                </div>
                <div>
                  <span>원본 경로 시간</span>
                  <strong>{timing?.baseTotalJourneySec ? formatDuration(timing.baseTotalJourneySec) : "-"}</strong>
                </div>
                <div>
                  <span>SafeETA 보정값</span>
                  <strong>{timing ? formatSignedDuration(timing.adjustmentSec) : "-"}</strong>
                </div>
                <div>
                  <span>탑승 이동시간</span>
                  <strong>{timing ? formatDuration(timing.transitRideSec) : "-"}</strong>
                </div>
                <div>
                  <span>보정 후 총 ETA</span>
                  <strong>{timing ? formatDuration(timing.totalJourneySec) : "-"}</strong>
                </div>
                <div>
                  <span>환승 횟수</span>
                  <strong>{candidate.transfer_count ?? "-"}</strong>
                </div>
                <div>
                  <span>기본 요금</span>
                  <strong>{formatFare(candidate.total_fare)}</strong>
                </div>
              </div>
              {timing?.segmentBreakdown?.length ? (
                <div className="route-candidate-legs route-candidate-legs-enhanced">
                  {timing.segmentBreakdown.slice(0, 8).map((leg, index) => (
                    <div className={`route-candidate-leg ${leg.kind || "walk"}`} key={`candidate-${candidate.index}-computed-leg-${index}`}>
                      <span>{leg.kind === "wait" ? "wait" : leg.kind || "walk"}</span>
                      <strong>{leg.label}</strong>
                      <small>
                        {[
                          leg.detail || "구간 정보",
                          leg.distanceM ? formatMeters(leg.distanceM) : "",
                          leg.durationSec ? formatDuration(leg.durationSec) : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    </div>
                  ))}
                </div>
              ) : candidate.legs?.length ? (
                <div className="route-candidate-legs">
                  {candidate.legs.slice(0, 6).map((leg, index) => (
                    <div className="route-candidate-leg" key={`candidate-${candidate.index}-leg-${index}`}>
                      <span>{leg.mode}</span>
                      <strong>{leg.label}</strong>
                      <small>
                        {[
                          [leg.start_name, leg.end_name].filter(Boolean).join(" -> ") || "구간 정보",
                          leg.duration_sec ? formatDuration(leg.duration_sec) : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    </div>
                  ))}
                </div>
              ) : null}
                  </>
                );
              })()}
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function SubwayBoardSection({ board, boardError, transitContext }) {
  const realtimeGroups = board?.realtimeGroups || [];
  const timetableGroups = board?.timetableGroups || [];
  const issues = [...(board?.issues || []), ...(boardError ? [boardError] : [])];

  return (
    <article className="surface-card">
      <SectionHeader
        eyebrow="5. 실시간 보드"
        title={`${transitContext.lineName} ${transitContext.stationName}역 도착 보드`}
        description="실시간 도착 2건과 현재 시각 기준 시간표 앞뒤 2건만 보여줍니다."
        rightSlot={
          <span className="provider-chip">
            {board?.timetableSource === "official_csv" ? "기준 시간표 반영" : "실시간 fallback"}
          </span>
        }
      />

      {realtimeGroups.length ? (
        <div className="board-grid">
          {realtimeGroups.slice(0, 2).map((group) => (
            <div className="board-group" key={`realtime-${group.directionLabel}`}>
              <div className="board-group-head">
                <strong>{group.directionLabel}</strong>
                <span>실시간</span>
              </div>
              <div className="arrival-list compact">
                {(group.items || []).slice(0, 2).map((item, index) => (
                  <div className="arrival-item compact" key={`${group.directionLabel}-${index}`}>
                    <strong>{readRealtimePrimary(item)}</strong>
                    <span>{readRealtimeSecondary(item) || "상세 정보 없음"}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="subway-empty">현재 선택한 역 기준 실시간 도착 정보가 아직 없습니다.</div>
      )}

      {timetableGroups.length ? (
        <div className="board-grid timetable-board-grid">
          {timetableGroups.slice(0, 2).map((group) => (
            <div className="board-group" key={`timetable-${group.directionLabel}`}>
              <div className="board-group-head">
                <strong>{group.directionLabel}</strong>
                <span>시간표</span>
              </div>
              <div className="timetable-grid compact">
                <div className="timetable-column">
                  <span className="timetable-label">이전 2건</span>
                  {(group.previous || []).slice(-2).map((item, index) => (
                    <div className="timetable-item compact" key={`${group.directionLabel}-prev-${index}`}>
                      <strong>{readTimetableLabel(item)}</strong>
                    </div>
                  ))}
                  {!group.previous?.length ? <div className="timetable-empty">이전 시간표 없음</div> : null}
                </div>
                <div className="timetable-column">
                  <span className="timetable-label">다음 2건</span>
                  {(group.next || []).slice(0, 2).map((item, index) => (
                    <div className="timetable-item compact" key={`${group.directionLabel}-next-${index}`}>
                      <strong>{readTimetableLabel(item)}</strong>
                    </div>
                  ))}
                  {!group.next?.length ? <div className="timetable-empty">다음 시간표 없음</div> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {issues.length ? (
        <div className="simple-list">
          {issues.slice(0, 2).map((issue) => (
            <div className="simple-list-item warning" key={issue}>
              {issue}
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function App() {
  const [config, setConfig] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [scenarioId, setScenarioId] = useState("");
  const [mode, setMode] = useState("balanced");
  const [walkProfileId, setWalkProfileId] = useState("standard");
  const [safetyBuffer, setSafetyBuffer] = useState(20);
  const [walkDistance, setWalkDistance] = useState(320);
  const [signalWait, setSignalWait] = useState(18);
  const [targetArrivalTime, setTargetArrivalTime] = useState("09:00");
  const [originInput, setOriginInput] = useState("");
  const [destinationInput, setDestinationInput] = useState("");
  const [originPlace, setOriginPlace] = useState(null);
  const [destinationPlace, setDestinationPlace] = useState(null);
  const [originSuggestions, setOriginSuggestions] = useState([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const [originTouched, setOriginTouched] = useState(false);
  const [destinationTouched, setDestinationTouched] = useState(false);
  const [isSearchingOrigin, setIsSearchingOrigin] = useState(false);
  const [isSearchingDestination, setIsSearchingDestination] = useState(false);
  const [placeSearchError, setPlaceSearchError] = useState("");
  const [result, setResult] = useState(null);
  const [comparison, setComparison] = useState({});
  const [subwayBoard, setSubwayBoard] = useState(null);
  const [subwayBoardError, setSubwayBoardError] = useState("");
  const [transitRoutes, setTransitRoutes] = useState(null);
  const [transitRoutesError, setTransitRoutesError] = useState("");
  const [isLoadingTransitRoutes, setIsLoadingTransitRoutes] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeSection, setActiveSection] = useState("route");
  const [journeyStageIndex, setJourneyStageIndex] = useState(0);
  const [journeySession, setJourneySession] = useState(null);
  const [journeySessionError, setJourneySessionError] = useState("");
  const [isSavingJourneySession, setIsSavingJourneySession] = useState(false);
  const [actualMapProvider, setActualMapProvider] = useState("fixed");
  const [mapProviderNote, setMapProviderNote] = useState(
    "고정 경로 지도 위에 현재 경로를 표시합니다.",
  );
  const [currentEvaluationSnapshot, setCurrentEvaluationSnapshot] = useState(null);
  const [previousEvaluationSnapshot, setPreviousEvaluationSnapshot] = useState(null);
  const mapStageRef = useRef(null);

  const deferredResult = useDeferredValue(result);
  const displayResult = deferredResult || result;
  const selectedScenario = scenarios.find((item) => item.id === scenarioId);
  const baseScene = getScenarioMapScene(scenarioId);
  const mapScene = buildPlannerScene(scenarioId, { originPlace, destinationPlace });
  const activeWalkProfile = getWalkProfile(walkProfileId);
  const plannerWalkDistanceMeters = Math.max(50, walkDistanceFromSegments(mapScene.journeySegments || []));
  const plannerJourneyDistanceMeters = Math.max(50, journeyDistanceFromSegments(mapScene.journeySegments || []));
  const topTransitCandidate = transitRoutes?.candidates?.[0] || null;
  const hasTransitLookupResult = Boolean(isLoadingTransitRoutes || transitRoutes || transitRoutesError);
  const plannerTransitContext = derivePlannerTransitContext(
    selectedScenario,
    config,
    destinationPlace,
    destinationInput,
  );
  const effectiveWalkDistance = topTransitCandidate?.total_walk_distance_m
    ? Math.max(50, Number(topTransitCandidate.total_walk_distance_m))
    : originPlace || destinationPlace
      ? plannerWalkDistanceMeters
      : Number(walkDistance);
  const effectiveJourneyDistance = topTransitCandidate?.total_distance_m
    ? Math.max(50, Number(topTransitCandidate.total_distance_m))
    : plannerJourneyDistanceMeters;
  const routeSearchStart = originPlace
    ? { x: Number(originPlace.x), y: Number(originPlace.y) }
    : { x: mapScene.originPoint.coords[1], y: mapScene.originPoint.coords[0] };
  const routeSearchEnd = destinationPlace
    ? { x: Number(destinationPlace.x), y: Number(destinationPlace.y) }
    : { x: mapScene.destinationPoint.coords[1], y: mapScene.destinationPoint.coords[0] };
  const routeLookupReady = Boolean(
    config?.hasTmapTransitKey &&
      Number.isFinite(routeSearchStart.x) &&
      Number.isFinite(routeSearchStart.y) &&
      Number.isFinite(routeSearchEnd.x) &&
      Number.isFinite(routeSearchEnd.y),
  );

  useEffect(() => {
    async function bootstrap() {
      const [configRes, scenariosRes] = await Promise.all([
        fetch(apiUrl("/api/config")),
        fetch(apiUrl("/api/scenarios")),
      ]);
      const configJson = await configRes.json();
      const scenariosJson = await scenariosRes.json();
      setConfig(configJson);
      setScenarios(scenariosJson);
      if (scenariosJson.length) {
        const first = scenariosJson[0];
        const firstScene = getScenarioMapScene(first.id);
        setScenarioId(first.id);
        setWalkDistance(first.walk_distance_m);
        setSignalWait(first.signal_wait_sec);
        setOriginTouched(false);
        setDestinationTouched(false);
        setOriginInput(plannerOrigin(firstScene));
        setDestinationInput(plannerDestination(firstScene, first));
      }
    }
    bootstrap().catch((err) => {
      setError(err.message || "초기 데이터를 불러오지 못했습니다.");
    });
  }, []);

  useEffect(() => {
    if (!comparison[mode]) return;
    startTransition(() => setResult(comparison[mode]));
  }, [comparison, mode]);

  useEffect(() => {
    if (!selectedScenario) return;
    setOriginPlace(null);
    setDestinationPlace(null);
    setOriginSuggestions([]);
    setDestinationSuggestions([]);
    setPlaceSearchError("");
    setOriginTouched(false);
    setDestinationTouched(false);
    setWalkDistance(selectedScenario.walk_distance_m);
    setSignalWait(selectedScenario.signal_wait_sec);
    setOriginInput(plannerOrigin(baseScene));
    setDestinationInput(plannerDestination(baseScene, selectedScenario));
    setCurrentEvaluationSnapshot(null);
    setPreviousEvaluationSnapshot(null);
    setJourneySession(null);
    setJourneySessionError("");
  }, [scenarioId, selectedScenario]);

  useEffect(() => {
    if (!config) return;
    setMapProviderNote(
      "고정 경로 지도 위에 실제 경로와 주요 지점을 표시합니다.",
    );
  }, [config]);

  useEffect(() => searchPlaces("origin"), [
    originInput,
    originPlace,
    originTouched,
    config?.hasKakaoRestApiKey,
    baseScene,
  ]);
  useEffect(() => searchPlaces("destination"), [
    destinationInput,
    destinationPlace,
    destinationTouched,
    config?.hasKakaoRestApiKey,
    baseScene,
  ]);

  useEffect(() => {
    if (!selectedScenario || !config) return;
    const controller = new AbortController();
    async function loadBoard() {
      setSubwayBoardError("");
      try {
        const response = await fetch(apiUrl("/api/live/seoul-subway-board"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            station_name: plannerTransitContext.stationName,
            line_name: plannerTransitContext.lineName,
            data_type: "json",
            start_index: 1,
            end_index: 12,
          }),
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail || "지하철 보드를 불러오지 못했습니다.");
        setSubwayBoard(body);
      } catch (err) {
        if (err.name === "AbortError") return;
        setSubwayBoard(null);
        setSubwayBoardError(err.message || "지하철 보드를 불러오지 못했습니다.");
      }
    }
    loadBoard();
    return () => controller.abort();
  }, [selectedScenario, config, plannerTransitContext.stationName, plannerTransitContext.lineName]);

  useEffect(() => {
    setTransitRoutes(null);
    setTransitRoutesError("");
  }, [routeSearchStart.x, routeSearchStart.y, routeSearchEnd.x, routeSearchEnd.y, scenarioId]);

  useEffect(() => {
    setJourneyStageIndex(0);
  }, [scenarioId, originPlace, destinationPlace, transitRoutes, result?.risk_level]);

  useEffect(() => {
    if (!scenarioId || originPlace || destinationPlace) return;
    let ignore = false;

    async function loadScenarioRouteSnapshot() {
      try {
        const response = await fetch(apiUrl(`/api/routes/scenario/${scenarioId}`));
        if (response.status === 404) return;
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail || "시나리오 경로 스냅샷을 불러오지 못했습니다.");
        if (!ignore) {
          setTransitRoutes(body);
          setTransitRoutesError("");
        }
      } catch (err) {
        if (!ignore) {
          setTransitRoutesError(err.message || "시나리오 경로 스냅샷을 불러오지 못했습니다.");
        }
      }
    }

    loadScenarioRouteSnapshot();
    return () => {
      ignore = true;
    };
  }, [scenarioId, originPlace, destinationPlace]);

  useEffect(() => {
    if (!scenarioId) return;
    const savedSessionId = window.localStorage.getItem(JOURNEY_SESSION_STORAGE_KEY);
    if (!savedSessionId) return;
    let ignore = false;

    async function restoreJourneySession() {
      try {
        const response = await fetch(apiUrl(`/api/journey/sessions/${savedSessionId}`));
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail || "저장된 여정 세션을 불러오지 못했습니다.");
        if (ignore || body.scenario_id !== scenarioId) return;
        setJourneySession(body);
        setJourneyStageIndex(body.current_stage_index || 0);
        if (body.route_candidate && !transitRoutes) {
          setTransitRoutes({
            source: "journey-session",
            route_count: 1,
            candidates: [body.route_candidate],
            requested: {},
            usage: { session: true },
            issues: [],
          });
        }
      } catch (_err) {
        window.localStorage.removeItem(JOURNEY_SESSION_STORAGE_KEY);
      }
    }

    restoreJourneySession();
    return () => {
      ignore = true;
    };
  }, [scenarioId]);

  useEffect(() => {
    if (!scenarioId) return;
    const hasPlannerContext = originPlace || destinationPlace || topTransitCandidate || selectedScenario;
    if (!hasPlannerContext) return;
    runEvaluation();
  }, [
    scenarioId,
    selectedScenario,
    originPlace,
    destinationPlace,
    topTransitCandidate,
    effectiveWalkDistance,
    plannerTransitContext.stationName,
    plannerTransitContext.lineName,
    activeWalkProfile.speedMps,
    safetyBuffer,
    signalWait,
  ]);

  useEffect(() => {
    if (!scenarioId || !result || isLoading) return;
    syncJourneySession();
  }, [
    scenarioId,
    result,
    mode,
    topTransitCandidate,
    activeWalkProfile.speedMps,
    safetyBuffer,
    signalWait,
    effectiveWalkDistance,
    originInput,
    destinationInput,
    plannerTransitContext.stationName,
    plannerTransitContext.lineName,
  ]);

  function buildPayload(preferenceMode) {
    return {
      scenario_id: scenarioId,
      walk_distance_m: effectiveWalkDistance,
      signal_wait_sec: Number(signalWait),
      station_name: plannerTransitContext.stationName,
      line_name: plannerTransitContext.lineName,
      profile: {
        preference_mode: preferenceMode,
        walk_speed_mps: activeWalkProfile.speedMps,
        safety_buffer_sec: Number(safetyBuffer),
      },
    };
  }

  function buildJourneySessionPayload() {
    return {
      scenario_id: scenarioId,
      mode,
      walk_speed_mps: activeWalkProfile.speedMps,
      safety_buffer_sec: Number(safetyBuffer),
      walk_distance_m: effectiveWalkDistance,
      signal_wait_sec: Number(signalWait),
      station_name: plannerTransitContext.stationName,
      line_name: plannerTransitContext.lineName,
      origin_label: originInput || plannerOrigin(mapScene),
      destination_label: destinationInput || plannerDestination(mapScene, selectedScenario),
      route_candidate: topTransitCandidate || null,
    };
  }

  async function syncJourneySession() {
    if (!scenarioId || !result) return;
    setJourneySessionError("");
    setIsSavingJourneySession(true);
    try {
      const response = await fetch(apiUrl("/api/journey/sessions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildJourneySessionPayload()),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || "여정 세션을 저장하지 못했습니다.");
      setJourneySession(body);
      setJourneyStageIndex(body.current_stage_index || 0);
      window.localStorage.setItem(JOURNEY_SESSION_STORAGE_KEY, body.id);
    } catch (err) {
      setJourneySession(null);
      setJourneySessionError(err.message || "여정 세션을 저장하지 못했습니다.");
    } finally {
      setIsSavingJourneySession(false);
    }
  }

  async function moveJourneySession(direction, stageIndex = null) {
    if (!journeySession?.id) {
      if (typeof stageIndex === "number") {
        setJourneyStageIndex(stageIndex);
        return;
      }
      setJourneyStageIndex((prev) => {
        if (direction === "prev") return Math.max(0, prev - 1);
        return prev >= journeyFlowStages.length - 1 ? 0 : Math.min(journeyFlowStages.length - 1, prev + 1);
      });
      return;
    }

    setJourneySessionError("");
    try {
      const response = await fetch(apiUrl(`/api/journey/sessions/${journeySession.id}/advance`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          stage_index: typeof stageIndex === "number" ? stageIndex : null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || "여정 단계를 갱신하지 못했습니다.");
      setJourneySession(body);
      setJourneyStageIndex(body.current_stage_index || 0);
    } catch (err) {
      setJourneySessionError(err.message || "여정 단계를 갱신하지 못했습니다.");
    }
  }

  async function runEvaluation(event) {
    if (event) event.preventDefault();
    if (!scenarioId) return;
    setError("");
    setIsLoading(true);
    try {
      const rows = await Promise.all(
        PREFERENCE_MODES.map(async ({ value }) => {
          const response = await fetch(apiUrl("/api/evaluate"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildPayload(value)),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.detail || "평가 요청에 실패했습니다.");
          return { mode: value, result: body };
        }),
      );
      const nextComparison = Object.fromEntries(rows.map((item) => [item.mode, item.result]));
      const nextSnapshot = {
        capturedAt: Date.now(),
        params: {
          walkProfileId,
          walkProfileLabel: activeWalkProfile.label,
          walkSpeedMps: activeWalkProfile.speedMps,
          signalWaitSec: Number(signalWait),
          safetyBufferSec: Number(safetyBuffer),
          walkDistanceM: Number(effectiveWalkDistance),
          journeyDistanceM: Number(effectiveJourneyDistance),
        },
        modeMetrics: buildModeMetricSnapshot(
          nextComparison,
          topTransitCandidate,
          activeWalkProfile.speedMps,
          Number(signalWait),
          flattenRealtimeArrivalCandidates(subwayBoard),
          Number(safetyBuffer),
        ),
      };
      startTransition(() => {
        setPreviousEvaluationSnapshot(currentEvaluationSnapshot);
        setCurrentEvaluationSnapshot(nextSnapshot);
        setComparison(nextComparison);
        setResult(nextComparison[mode] || nextComparison.balanced);
        setUpdatedAt(
          new Intl.DateTimeFormat("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }).format(new Date()),
        );
      });
    } catch (err) {
      setError(err.message || "평가 요청에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleOriginInputChange(event) {
    const nextValue = event.target.value;
    setOriginTouched(true);
    setOriginInput(nextValue);
    if (originPlace && nextValue.trim() !== originPlace.placeName) {
      setOriginPlace(null);
    }
  }

  function handleDestinationInputChange(event) {
    const nextValue = event.target.value;
    setDestinationTouched(true);
    setDestinationInput(nextValue);
    if (destinationPlace && nextValue.trim() !== destinationPlace.placeName) {
      setDestinationPlace(null);
    }
  }

  function selectOriginSuggestion(place) {
    setOriginPlace(place);
    setOriginTouched(false);
    setOriginInput(place.placeName);
    setOriginSuggestions([]);
    setPlaceSearchError("");
  }

  function selectDestinationSuggestion(place) {
    setDestinationPlace(place);
    setDestinationTouched(false);
    setDestinationInput(place.placeName);
    setDestinationSuggestions([]);
    setPlaceSearchError("");
  }

  function resetPlanner() {
    setOriginPlace(null);
    setDestinationPlace(null);
    setOriginTouched(false);
    setDestinationTouched(false);
    setOriginSuggestions([]);
    setDestinationSuggestions([]);
    setOriginInput(plannerOrigin(baseScene));
    setDestinationInput(plannerDestination(baseScene, selectedScenario));
    setPlaceSearchError("");
  }

  async function requestTransitLookup() {
    if (!routeLookupReady) {
      setTransitRoutesError("TMAP 경로 키 또는 출발지·도착지 좌표가 아직 준비되지 않았습니다.");
      return;
    }
    setTransitRoutesError("");
    setIsLoadingTransitRoutes(true);
    mapStageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      const response = await fetch(apiUrl("/api/routes/transit"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_x: routeSearchStart.x,
          start_y: routeSearchStart.y,
          end_x: routeSearchEnd.x,
          end_y: routeSearchEnd.y,
          count: 3,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(normalizeTransitRouteError(body.detail));
      setTransitRoutes(body);
      window.setTimeout(() => {
        mapStageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
    } catch (err) {
      setTransitRoutes(null);
      setTransitRoutesError(normalizeTransitRouteError(err.message));
    } finally {
      setIsLoadingTransitRoutes(false);
    }
  }

  function searchPlaces(kind) {
    const isOrigin = kind === "origin";
    const query = isOrigin ? originInput : destinationInput;
    const touched = isOrigin ? originTouched : destinationTouched;
    const selectedPlace = isOrigin ? originPlace : destinationPlace;
    const setSuggestions = isOrigin ? setOriginSuggestions : setDestinationSuggestions;
    const setSearching = isOrigin ? setIsSearchingOrigin : setIsSearchingDestination;

    if (!config?.hasKakaoRestApiKey || !touched || query.trim().length < 2) {
      setSuggestions([]);
      setSearching(false);
      return undefined;
    }
    if (selectedPlace && query.trim() === selectedPlace.placeName) {
      setSuggestions([]);
      setSearching(false);
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(apiUrl("/api/kakao/places"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: query.trim(),
            ...plannerScope(baseScene),
            size: 8,
          }),
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.detail || `${isOrigin ? "출발지" : "도착지"} 검색에 실패했습니다.`);
        }
        setSuggestions(body.items || []);
        setPlaceSearchError("");
      } catch (err) {
        if (err.name === "AbortError") return;
        setSuggestions([]);
        setPlaceSearchError(err.message || `${isOrigin ? "출발지" : "도착지"} 검색에 실패했습니다.`);
      } finally {
        setSearching(false);
      }
    }, 260);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }

  const visibleSources = (config?.sources || []).map((source) =>
    source.id !== "bus"
      ? source
      : {
          ...source,
          status: config?.hasSeoulBusKey ? "review" : "pending",
          detail: config?.hasSeoulBusKey
            ? "버스 키가 등록되어 있어 다음 단계에서 실시간 도착 정보를 검증할 수 있습니다."
            : "버스 키 승인 전이라 현재는 버스 영역을 연결 대기 상태로 유지합니다.",
        },
  );

  const evidenceItems = [
    ...(displayResult?.route_debug?.highlights || []),
    ...((displayResult?.route_debug?.issues || []).map((item) => `참고: ${item}`)),
  ];

  const recommendationItems = displayResult?.recommendations?.length
    ? displayResult.recommendations
    : ["현재 조건 기준 추천 문장을 계산하는 중입니다."];
  const realtimeArrivalCandidates = flattenRealtimeArrivalCandidates(subwayBoard);

  const comparisonRows = PREFERENCE_MODES.map(({ value, label }) => {
    const comparisonResult = comparison[value] || null;
    const comparisonTiming = comparisonResult
      ? buildTransitTiming(
          topTransitCandidate,
          activeWalkProfile.speedMps,
          Number(signalWait),
          comparisonResult.bus_eta_p50_sec,
          comparisonResult.recommended_wait_sec,
          realtimeArrivalCandidates,
        )
      : null;
    const comparisonSchedule = buildSchedulePlan(
      comparisonTiming?.totalJourneySec,
      comparisonResult?.recommended_wait_sec,
      targetArrivalTime,
    );

    const routeMetrics = deriveRouteDecisionMetrics(
      comparisonResult,
      comparisonTiming,
      Number(signalWait),
      Number(safetyBuffer),
    );

    return {
      value,
      label,
      result: comparisonResult,
      totalJourneyLabel: comparisonTiming?.totalJourneySec ? formatDuration(comparisonTiming.totalJourneySec) : "-",
      recommendedJourneyLabel: comparisonTiming?.recommendedTotalJourneySec
        ? formatDuration(comparisonTiming.recommendedTotalJourneySec)
        : "-",
      approachEtaLabel: comparisonResult
        ? formatDuration(comparisonTiming?.initialWalkSec ?? comparisonResult.walk_eta_p50_sec)
        : "-",
      waitLabel: comparisonResult ? formatDuration(comparisonResult.recommended_wait_sec || 0) : "-",
      arrivalDeltaLabel: comparisonSchedule ? formatArrivalDelta(comparisonSchedule.deltaSec) : "-",
      arrivalAtLabel: comparisonSchedule ? formatClockTime(comparisonSchedule.recommendedArrival) : "-",
      departureAtLabel: comparisonSchedule ? formatClockTime(comparisonSchedule.leaveAt) : "-",
      schedulePriority: comparisonSchedule?.priorityScore ?? Number.POSITIVE_INFINITY,
      scheduleTone: comparisonSchedule?.tone ?? "neutral",
      displayCatchProbability: routeMetrics?.catchProbability ?? comparisonResult?.catch_probability ?? null,
      displayRiskScore: routeMetrics?.riskScore ?? comparisonResult?.risk_score ?? null,
      displayRiskLevel: routeMetrics?.riskLevel ?? comparisonResult?.risk_level ?? "대기",
    };
  });

  const recommendedMode = [...comparisonRows]
    .filter((row) => row.result)
    .sort((a, b) => a.schedulePriority - b.schedulePriority)[0];

  const transitTiming = buildTransitTiming(
    topTransitCandidate,
    activeWalkProfile.speedMps,
    Number(signalWait),
    displayResult?.bus_eta_p50_sec,
    displayResult?.recommended_wait_sec,
    realtimeArrivalCandidates,
  );
  const routeDecisionMetrics = deriveRouteDecisionMetrics(
    displayResult,
    transitTiming,
    Number(signalWait),
    Number(safetyBuffer),
  );
  const presentationResult = displayResult
    ? {
        ...displayResult,
        catch_probability: routeDecisionMetrics?.catchProbability ?? displayResult.catch_probability,
        risk_score: routeDecisionMetrics?.riskScore ?? displayResult.risk_score,
        risk_level: routeDecisionMetrics?.riskLevel ?? displayResult.risk_level,
      }
    : null;
  const displayCatchProbability = presentationResult?.catch_probability ?? displayResult?.catch_probability ?? null;
  const displayRiskScore = presentationResult?.risk_score ?? displayResult?.risk_score ?? null;
  const displayRiskLevel = presentationResult?.risk_level ?? displayResult?.risk_level ?? "대기";
  const schedulePlan = buildSchedulePlan(
    transitTiming?.totalJourneySec,
    presentationResult?.recommended_wait_sec,
    targetArrivalTime,
  );
  const scheduleSummary = describeSchedulePlan(schedulePlan);
  const riskLevel = displayRiskLevel;
  const heroStatus = error ? error : config?.statusSummary || "실시간 판단 준비 중";
  const journeySegments = activeJourneySegments(mapScene, presentationResult || displayResult);
  const firstWalkSegment = journeySegments.find((segment) => segment.kind === "walk");
  const crossingSegmentMeters = Math.round(pathDistanceMeters(firstWalkSegment?.path || [mapScene.exit.coords, mapScene.crossing.coords]));
  const totalJourneyEtaLabel = transitTiming ? formatDuration(transitTiming.totalJourneySec) : "실제 경로 조회 필요";
  const baseJourneyEtaLabel = transitTiming?.baseTotalJourneySec
    ? formatDuration(transitTiming.baseTotalJourneySec)
    : "실제 경로 조회 필요";
  const transitRideEtaLabel = transitTiming ? formatDuration(transitTiming.transitRideSec) : "실제 경로 조회 필요";
  const boardingWaitEtaLabel = transitTiming ? formatDuration(transitTiming.boardingWaitSec) : "실제 경로 조회 필요";
  const adjustmentEtaLabel = transitTiming ? formatSignedDuration(transitTiming.adjustmentSec) : "실제 경로 조회 필요";
  const totalWalkEtaLabel = transitTiming
    ? formatDuration(transitTiming.totalWalkSec)
    : displayResult
      ? formatDuration(displayResult.mode_adjusted_walk_eta_p50_sec || displayResult.walk_eta_p50_sec)
      : "-";
  const targetArrivalLabel = schedulePlan ? formatClockTime(schedulePlan.targetDate) : targetArrivalTime;
  const expectedArrivalLabel = schedulePlan ? formatClockTime(schedulePlan.recommendedArrival) : "-";
  const immediateArrivalLabel = schedulePlan ? formatClockTime(schedulePlan.immediateArrival) : "-";
  const recommendedDepartureLabel = schedulePlan ? formatClockTime(schedulePlan.leaveAt) : "-";
  const arrivalDeltaLabel = schedulePlan ? formatArrivalDelta(schedulePlan.deltaSec) : "-";

  const routeFacts = [
    { label: "보정 후 총 ETA", value: totalJourneyEtaLabel },
    { label: "탑승 구간", value: topTransitCandidate?.summary || "실제 경로 조회 필요" },
    { label: "총 도보거리", value: formatMeters(effectiveWalkDistance) },
    { label: "위험도", value: displayRiskScore != null ? `${displayRiskScore}점` : "-" },
  ];
  const routeSupportFacts = [
    { label: "원본 경로 시간", value: baseJourneyEtaLabel },
    { label: "탑승 이동시간", value: transitRideEtaLabel },
    { label: "첫 승차 대기", value: boardingWaitEtaLabel },
    { label: "실시간 도착", value: realtimePreview(subwayBoard) },
  ];

  const arrivalOptimizationFacts = [
    { label: "목표 도착", value: targetArrivalLabel },
    { label: "예상 도착", value: expectedArrivalLabel },
    { label: "도착 편차", value: arrivalDeltaLabel },
    { label: "권장 출발", value: recommendedDepartureLabel },
  ];
  const primaryRouteFacts = [
    { label: "목표 도착", value: targetArrivalLabel },
    { label: "예상 도착", value: expectedArrivalLabel },
    { label: "도착 편차", value: arrivalDeltaLabel },
    { label: "권장 출발", value: recommendedDepartureLabel },
  ];
  const supportRouteFacts = [
    { label: "즉시 출발 ETA", value: totalJourneyEtaLabel },
    { label: "즉시 출발 도착", value: immediateArrivalLabel },
    { label: "탑승 이동시간", value: transitRideEtaLabel },
    { label: "실시간 도착", value: realtimePreview(subwayBoard) },
  ];
  const decisionStatsPrimary = [
    { label: "목표 도착", value: targetArrivalLabel },
    { label: "예상 도착", value: expectedArrivalLabel },
    { label: "도착 편차", value: arrivalDeltaLabel },
    { label: "권장 출발", value: recommendedDepartureLabel },
    { label: "즉시 출발 ETA", value: totalJourneyEtaLabel },
    { label: "탑승 이동시간", value: transitRideEtaLabel },
  ];
  const decisionHeroStats = [
    { label: "권장 출발", value: recommendedDepartureLabel },
    { label: "예상 도착", value: expectedArrivalLabel },
    { label: "도착 편차", value: arrivalDeltaLabel },
  ];
  const decisionSupportStats = [
    { label: "즉시 출발 ETA", value: totalJourneyEtaLabel },
    { label: "탑승 이동", value: transitRideEtaLabel },
    { label: "첫 탑승 대기", value: boardingWaitEtaLabel },
    { label: "실시간 도착", value: realtimePreview(subwayBoard) },
  ];
  const modeLeaderboard = [...comparisonRows]
    .filter((row) => row.result)
    .sort((a, b) => a.schedulePriority - b.schedulePriority)
    .map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
  const standardWalkProfile = getWalkProfile("standard");
  const parameterReference = currentEvaluationSnapshot?.params || {
    walkSpeedMps: standardWalkProfile.speedMps,
    signalWaitSec: Number(selectedScenario?.signal_wait_sec ?? 0),
    safetyBufferSec: 20,
    walkDistanceM: Number(selectedScenario?.walk_distance_m ?? effectiveWalkDistance),
  };
  const parameterReferenceLabel = currentEvaluationSnapshot ? "직전 계산 대비" : "기본값 대비";
  const parameterChangeRows = [
    {
      label: "보행 속도",
      value: `${activeWalkProfile.label} · ${formatSpeed(activeWalkProfile.speedMps)}`,
      delta: activeWalkProfile.speedMps - Number(parameterReference.walkSpeedMps || 0),
      deltaLabel: formatSignedSpeed(activeWalkProfile.speedMps - Number(parameterReference.walkSpeedMps || 0)),
      tone: deltaTone(activeWalkProfile.speedMps - Number(parameterReference.walkSpeedMps || 0), "higher_better"),
      changed: Math.abs(activeWalkProfile.speedMps - Number(parameterReference.walkSpeedMps || 0)) >= 0.01,
    },
    {
      label: "신호 대기",
      value: formatDuration(Number(signalWait)),
      delta: Number(signalWait) - Number(parameterReference.signalWaitSec || 0),
      deltaLabel: formatSignedDuration(Number(signalWait) - Number(parameterReference.signalWaitSec || 0)),
      tone: deltaTone(Number(signalWait) - Number(parameterReference.signalWaitSec || 0), "lower_better"),
      changed: Math.abs(Number(signalWait) - Number(parameterReference.signalWaitSec || 0)) >= 1,
    },
    {
      label: "안전 버퍼",
      value: `${safetyBuffer}초`,
      delta: Number(safetyBuffer) - Number(parameterReference.safetyBufferSec || 0),
      deltaLabel: formatSignedDuration(Number(safetyBuffer) - Number(parameterReference.safetyBufferSec || 0)),
      tone: deltaTone(Number(safetyBuffer) - Number(parameterReference.safetyBufferSec || 0), "higher_better"),
      changed: Math.abs(Number(safetyBuffer) - Number(parameterReference.safetyBufferSec || 0)) >= 1,
    },
    {
      label: "총 도보거리",
      value: formatMeters(effectiveWalkDistance),
      delta: Number(effectiveWalkDistance) - Number(parameterReference.walkDistanceM || 0),
      deltaLabel: formatSignedMeters(Number(effectiveWalkDistance) - Number(parameterReference.walkDistanceM || 0)),
      tone: deltaTone(Number(effectiveWalkDistance) - Number(parameterReference.walkDistanceM || 0), "lower_better"),
      changed: Math.abs(Number(effectiveWalkDistance) - Number(parameterReference.walkDistanceM || 0)) >= 1,
    },
  ];
  const pendingParameterChanges = parameterChangeRows.filter((item) => item.changed).length;
  const currentModeMetrics = currentEvaluationSnapshot?.modeMetrics?.[mode] || {
    totalJourneySec: transitTiming?.totalJourneySec ?? null,
    walkEtaSec: transitTiming?.initialWalkSec ?? presentationResult?.walk_eta_p50_sec ?? null,
    catchProbability: displayCatchProbability,
    riskScore: displayRiskScore,
  };
  const previousModeMetrics = previousEvaluationSnapshot?.modeMetrics?.[mode] || null;
  const resultDeltaRows = [
    {
      label: "총 ETA",
      value: totalJourneyEtaLabel,
      delta: previousModeMetrics ? currentModeMetrics.totalJourneySec - previousModeMetrics.totalJourneySec : null,
      deltaLabel: previousModeMetrics
        ? formatSignedDuration(currentModeMetrics.totalJourneySec - previousModeMetrics.totalJourneySec)
        : "직전 계산 없음",
      tone: previousModeMetrics
        ? deltaTone(currentModeMetrics.totalJourneySec - previousModeMetrics.totalJourneySec, "lower_better")
        : "neutral",
    },
    {
      label: "보행 ETA",
      value: totalWalkEtaLabel,
      delta: previousModeMetrics ? currentModeMetrics.walkEtaSec - previousModeMetrics.walkEtaSec : null,
      deltaLabel: previousModeMetrics
        ? formatSignedDuration(currentModeMetrics.walkEtaSec - previousModeMetrics.walkEtaSec)
        : "직전 계산 없음",
      tone: previousModeMetrics
        ? deltaTone(currentModeMetrics.walkEtaSec - previousModeMetrics.walkEtaSec, "lower_better")
        : "neutral",
    },
    {
      label: "탑승 가능성",
      value: displayCatchProbability != null ? formatPercent(displayCatchProbability) : "-",
      delta: previousModeMetrics
        ? currentModeMetrics.catchProbability - previousModeMetrics.catchProbability
        : null,
      deltaLabel: previousModeMetrics
        ? formatSignedPercentPoint(currentModeMetrics.catchProbability - previousModeMetrics.catchProbability)
        : "직전 계산 없음",
      tone: previousModeMetrics
        ? deltaTone(currentModeMetrics.catchProbability - previousModeMetrics.catchProbability, "higher_better")
        : "neutral",
    },
    {
      label: "위험도",
      value: displayRiskScore != null ? `${displayRiskScore}점` : "-",
      delta: previousModeMetrics ? currentModeMetrics.riskScore - previousModeMetrics.riskScore : null,
      deltaLabel: previousModeMetrics
        ? formatSignedScore(currentModeMetrics.riskScore - previousModeMetrics.riskScore)
        : "직전 계산 없음",
      tone: previousModeMetrics
        ? deltaTone(currentModeMetrics.riskScore - previousModeMetrics.riskScore, "lower_better")
        : "neutral",
    },
  ];
  const leaderboardRows = [...comparisonRows]
    .filter((row) => row.result)
    .map((row) => {
      const timing = buildTransitTiming(
        topTransitCandidate,
        activeWalkProfile.speedMps,
        Number(signalWait),
        row.result.bus_eta_p50_sec,
        row.result.recommended_wait_sec,
        realtimeArrivalCandidates,
      );
      return {
        ...row,
        totalJourneyLabel: timing?.totalJourneySec ? formatDuration(timing.totalJourneySec) : "-",
        recommendedJourneyLabel: timing?.recommendedTotalJourneySec
          ? formatDuration(timing.recommendedTotalJourneySec)
          : "-",
      };
    })
    .sort((a, b) => a.schedulePriority - b.schedulePriority);

  const decisionText = defaultDecisionText(presentationResult || displayResult);

  const decisionStats = [
    { label: "보정 후 총 ETA", value: totalJourneyEtaLabel },
    { label: "원본 경로 시간", value: baseJourneyEtaLabel },
    { label: "도보 ETA", value: totalWalkEtaLabel },
    {
      label: `${plannerTransitContext.lineName} ${plannerTransitContext.stationName}역`,
      value: displayResult ? formatDuration(displayResult.bus_eta_p50_sec) : "-",
    },
    { label: "SafeETA 보정값", value: adjustmentEtaLabel },
    { label: "탑승 가능성", value: displayCatchProbability != null ? formatPercent(displayCatchProbability) : "-" },
    { label: "위험도", value: displayRiskScore != null ? `${displayRiskScore}점` : "-" },
  ];

  const mapProviderLabel =
    actualMapProvider === "fixed" ? "고정 경로 지도" : actualMapProvider === "tmap" ? "TMAP" : "지도 준비 중";
  const plannerSearchNote = config?.hasKakaoRestApiKey
    ? "장소 검색 결과의 좌표와 위치 관계만 사용하고, ETA 시간은 SafeETA가 직접 다시 계산합니다. 실제 경로 API는 버튼을 눌렀을 때만 호출됩니다."
    : "장소 검색 키를 등록하면 검색 결과를 경로 입력에 바로 반영할 수 있습니다.";
  const plannerUsageNote =
    originPlace || destinationPlace || topTransitCandidate
      ? `선택한 장소를 기준으로 전체 여정 ${effectiveJourneyDistance}m와 총 도보거리 ${effectiveWalkDistance}m를 다시 계산했습니다.`
      : "기본 시나리오 좌표를 기준으로 전체 보행 경로와 ETA를 계산합니다.";
  const currentModeLabel = PREFERENCE_MODES.find((item) => item.value === mode)?.label || "균형";
  const mapSectionDescription = topTransitCandidate
    ? "조회된 실제 경로를 고정 경로 지도 위에 이어서 표시합니다. 지도와 경로 카드가 같은 흐름으로 연결됩니다."
    : "출발지와 도착지를 정한 뒤 실제 경로 조회를 누르면, 지도에 경로와 주요 지점이 함께 표시됩니다.";
  const apiEndpointNote = apiBaseUrl
    ? `모바일 앱 API 주소: ${apiBaseUrl}`
    : "현재는 같은 서버의 /api 경로를 사용하고 있습니다.";
  const crossingDirection = directionFromPoints(mapScene.exit?.coords, mapScene.crossing?.coords);
  const finalApproachDirection = directionFromPoints(
    mapScene.station?.coords || mapScene.boardStation?.coords,
    mapScene.destinationPoint?.coords || mapScene.station?.coords,
  );
  const transitLeg = topTransitCandidate?.legs?.find((leg) => isTransitLegMode(leg?.mode));
  const visualGuidanceSteps = [
    {
      id: "start",
      label: "출발",
      summary: plannerOrigin(mapScene),
      tone: "origin",
      directionClass: "forward",
    },
    {
      id: "crossing",
      label: displayRiskLevel === "위험" ? "대기" : "횡단",
      summary: displayRiskLevel === "위험" ? "대기 후 재계산" : crossingDirection.label,
      tone: displayRiskLevel === "위험" ? "wait" : "crossing",
      directionClass: crossingDirection.className,
    },
    {
      id: "transit",
      label: transitLeg ? transitLeg.label : "탑승",
      summary: transitLeg ? "이동수단 탑승" : "실제 경로 조회 필요",
      tone: "transit",
      directionClass: "forward",
    },
    {
      id: "arrive",
      label: "도착",
      summary: finalApproachDirection.label,
      tone: "destination",
      directionClass: finalApproachDirection.className,
    },
  ];
  const localJourneyFlowStages = buildDemoJourneyStages({
    scene: mapScene,
    walkSpeedMps: activeWalkProfile.speedMps,
    transitTiming,
    riskLevel: displayRiskLevel,
    originLabel: plannerOrigin(mapScene),
    destinationLabel: plannerDestination(mapScene, selectedScenario),
  });
  const journeyFlowStages = journeySession?.stages?.length ? journeySession.stages : localJourneyFlowStages;
  const safeJourneyStageIndex = journeySession
    ? Math.min(journeySession.current_stage_index, Math.max(journeyFlowStages.length - 1, 0))
    : Math.min(journeyStageIndex, Math.max(journeyFlowStages.length - 1, 0));
  const currentJourneyStage = journeySession?.current_stage || journeyFlowStages[safeJourneyStageIndex] || null;
  const visualStageIndex = Math.min(safeJourneyStageIndex, Math.max(visualGuidanceSteps.length - 1, 0));

  const parameterImpactPanel = (
    <article className="surface-card impact-board-card">
      <SectionHeader
        eyebrow="1.5 변화 보드"
        title="바꾼 파라미터가 결과를 어떻게 흔드는지 바로 보여줍니다"
        description={
          pendingParameterChanges
            ? `직전 계산 대비 ${pendingParameterChanges}개 항목이 바뀌었습니다. 다시 계산하면 결과 보드가 함께 갱신됩니다.`
            : previousEvaluationSnapshot
              ? "직전 계산 결과와 비교해 ETA와 위험도 변화량을 같이 볼 수 있습니다."
              : "한 번 더 계산하면 직전 계산 대비 변화량을 계속 누적해서 보여줍니다."
        }
        rightSlot={
          <span className={`status-chip ${pendingParameterChanges ? "loading" : ""}`}>
            {pendingParameterChanges ? "재계산 전 변경 있음" : "현재 계산 반영 중"}
          </span>
        }
      />

      <div className="impact-parameter-grid">
        {parameterChangeRows.map((item) => (
          <div className="impact-parameter-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <div className="impact-card-foot">
              <small>{parameterReferenceLabel}</small>
              <b className={`impact-delta-pill ${item.tone}`}>{item.deltaLabel}</b>
            </div>
          </div>
        ))}
      </div>

      <div className="impact-result-grid">
        {resultDeltaRows.map((item) => (
          <div className="impact-result-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <b className={`impact-delta-pill ${item.tone}`}>{item.deltaLabel}</b>
          </div>
        ))}
      </div>

      <div className="impact-leaderboard">
        {leaderboardRows.map((row, index) => (
          <button
            type="button"
            key={`leader-${row.value}`}
            className={`impact-leader-row ${mode === row.value ? "is-current" : ""}`}
            onClick={() => setMode(row.value)}
          >
            <div className="impact-leader-rank">{index + 1}</div>
            <div className="impact-leader-copy">
              <strong>{row.label}</strong>
              <span>{`출발 ${row.departureAtLabel} · 도착 ${row.arrivalAtLabel}`}</span>
              <small>{`${row.arrivalDeltaLabel} · 즉시 ETA ${row.totalJourneyLabel}`}</small>
            </div>
            <div className="impact-leader-metrics">
              <span>{formatPercent(row.displayCatchProbability)}</span>
              <span>위험 {row.displayRiskScore ?? "-"}</span>
            </div>
          </button>
        ))}
      </div>
    </article>
  );

  const routeMapPanel = (
    <article className="surface-card route-map-focus" ref={mapStageRef}>
      <SectionHeader
        eyebrow="2. 지도 경로"
        title={topTransitCandidate ? "실제 경로가 지도에 반영되었습니다" : "실제 경로가 여기에 표시됩니다"}
        description={mapSectionDescription}
        rightSlot={<span className="provider-chip">{mapProviderLabel}</span>}
      />

        <div className="route-map-stage">
          <div className="route-map-card route-map-card-primary">
          <TransitMap
            scene={mapScene}
            result={displayResult}
            routeCandidate={topTransitCandidate}
            tmapMapAppKey={config?.tmapMapAppKey}
            onProviderChange={(provider, note) => {
              setActualMapProvider(provider);
              if (note) setMapProviderNote(note);
            }}
          />
        </div>

        <div className="route-sheet route-sheet-primary">
          <div className="route-sheet-hero">
            <div className="route-sheet-copy">
              <span className="section-micro">현재 경로</span>
              <strong>
                {originInput || plannerOrigin(mapScene)} → {destinationInput || plannerDestination(mapScene, selectedScenario)}
              </strong>
              <p>{displayRiskLevel === "위험" ? mapScene.waitDirectionNote : mapScene.primaryDirectionNote}</p>
            </div>
            <div className="route-sheet-side">
              <div className={`sheet-risk-pill ${riskTone(displayRiskLevel)}`}>
                <span>현재 판단</span>
                <strong>{riskLevel}</strong>
              </div>
              <div className="route-sheet-pill-list">
                <span className="hero-meta-chip">{currentModeLabel}</span>
                <span className="hero-meta-chip">{plannerTransitContext.lineName}</span>
                <span className="hero-meta-chip">{plannerTransitContext.stationName}역</span>
              </div>
            </div>
          </div>

          <div className="route-action-card">
            <span>지금 해야 할 행동</span>
            <strong>{scheduleSummary.headline}</strong>
            <p>{recommendationItems[0]}</p>
          </div>

          {journeyFlowStages.length ? (
            <div className="journey-flow-panel">
              <div className="journey-flow-head">
                {journeySession ? <small>{`DB 세션 ${journeySession.id.slice(0, 8)} 저장됨`}</small> : null}
                {isSavingJourneySession ? <small>DB 세션 저장 중</small> : null}
                {journeySessionError ? <small className="planner-note warning">{journeySessionError}</small> : null}
                <span>단계형 데모 플로우</span>
                <strong>{currentJourneyStage ? `${safeJourneyStageIndex + 1}. ${currentJourneyStage.title}` : "단계 준비 중"}</strong>
                <p>{currentJourneyStage?.caption || "출발부터 도착까지 한 단계씩 이어서 확인합니다."}</p>
              </div>

              <div className="journey-stage-row">
                {journeyFlowStages.map((stage, index) => (
                  <button
                    type="button"
                    key={stage.id}
                    className={`journey-stage-chip ${index === safeJourneyStageIndex ? "is-current" : index < safeJourneyStageIndex ? "is-done" : ""}`}
                    onClick={() => moveJourneySession("stay", index)}
                  >
                    <span>{index + 1}</span>
                    <strong>{stage.title}</strong>
                  </button>
                ))}
              </div>

              <div className="journey-stage-card">
                <div>
                  <span>현재 지점</span>
                  <strong>{currentJourneyStage?.label || "경로 준비 중"}</strong>
                </div>
                <div>
                  <span>남은 ETA</span>
                  <strong>{currentJourneyStage ? formatDuration(currentJourneyStage.remainingSec) : "-"}</strong>
                </div>
              </div>

              <div className="journey-stage-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => moveJourneySession("prev")}
                  disabled={safeJourneyStageIndex === 0}
                >
                  이전 단계
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => moveJourneySession("next")}
                >
                  {safeJourneyStageIndex >= journeyFlowStages.length - 1 ? "처음으로" : "다음 단계"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="crossing-cue-card">
            <div className={`direction-chip ${crossingDirection.className}`}>
              <span className="direction-chip-arrow" />
              <strong>{displayRiskLevel === "위험" ? "대기 후 이동" : crossingDirection.label}</strong>
            </div>
            <div className="crossing-cue-copy">
              <span>횡단 핵심 구간</span>
              <strong>{mapScene.crossing?.label || "횡단 지점"}</strong>
              <p>{displayRiskLevel === "위험" ? mapScene.waitDirectionNote : mapScene.primaryDirectionNote}</p>
            </div>
          </div>

          <div className="journey-visual-strip" aria-label="추천 동선">
            {visualGuidanceSteps.map((step, index) => (
              <div
                className={`journey-visual-step ${step.tone} ${index === visualStageIndex ? "is-current" : index < visualStageIndex ? "is-done" : ""}`}
                key={step.id}
              >
                <div className={`direction-chip compact ${step.directionClass}`}>
                  <span className="direction-chip-arrow" />
                </div>
                <div className="journey-visual-copy">
                  <span>{step.label}</span>
                  <strong>{step.summary}</strong>
                </div>
                {index < visualGuidanceSteps.length - 1 ? <div className="journey-visual-connector" /> : null}
              </div>
            ))}
          </div>

          <div className="route-fact-grid route-fact-grid-primary">
            {primaryRouteFacts.map((fact) => (
              <div className="route-fact-card route-fact-card-primary" key={fact.label}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>

          <details className="route-more-details">
            <summary>세부 경로와 표시 기준 보기</summary>

            <div className="route-support-strip">
              {supportRouteFacts.map((fact) => (
                <div className="route-support-item" key={fact.label}>
                  <span>{fact.label}</span>
                  <strong>{fact.value}</strong>
                </div>
              ))}
            </div>

            <div className="route-sheet-pill-list">
              <span className="hero-meta-chip">{plannerTransitContext.sourceLabel}</span>
              <span className="hero-meta-chip">{mapScene.boardStation?.label || mapScene.station.label}</span>
              <span className="hero-meta-chip">{mapScene.destinationPoint?.label || mapScene.station.label}</span>
            </div>

            {journeySegments.length ? (
              <div className="journey-segment-list">
                {journeySegments.map((segment) => (
                  <div className={`journey-segment-card ${segment.kind}`} key={segment.id}>
                    <div>
                      <span>{segment.title}</span>
                      <strong>{segment.summary}</strong>
                    </div>
                    <b>{segmentValue(segment)}</b>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="legend-grid">
              {mapLegendItems(mapScene).map((item) => (
                <div className="legend-chip" key={item.key}>
                  <span className={`map-legend-dot ${item.tone}`} />
                  <strong>{item.label}</strong>
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
    </article>
  );

  const routePanel = (
    <section className="tab-panel">
      <article className="surface-card">
        <SectionHeader
          eyebrow="1. 경로 입력"
          title="출발지와 도착지만 정하면 됩니다"
          description="장소를 고른 뒤 실제 경로 조회 버튼을 누르면 그때 TMAP 경로를 불러옵니다."
          rightSlot={
            <span className={`status-chip ${isLoading ? "loading" : ""}`}>{isLoading ? "계산 중" : "준비됨"}</span>
          }
        />

        <div className="planner-field-grid">
          <PlaceSearchField
            label="출발지"
            value={originInput}
            placeholder="예: 시청광장, 강남역 11번 출구"
            suggestions={originSuggestions}
            isSearching={isSearchingOrigin}
            onChange={handleOriginInputChange}
            onSelect={selectOriginSuggestion}
          />
          <PlaceSearchField
            label="도착지"
            value={destinationInput}
            placeholder="예: 시청역, 광화문광장"
            suggestions={destinationSuggestions}
            isSearching={isSearchingDestination}
            onChange={handleDestinationInputChange}
            onSelect={selectDestinationSuggestion}
          />
        </div>

        <div className="planner-inline-grid">
          <label className="field-stack">
            <span>목표 도착 시각</span>
            <input
              type="time"
              value={targetArrivalTime}
              onChange={(event) => setTargetArrivalTime(event.target.value || "09:00")}
            />
            <small className="field-help">정시에 가깝게, 너무 이르지도 늦지도 않게 맞춥니다.</small>
          </label>
          <div className="planner-arrival-preview">
            <span>현재 추천</span>
            <strong>{arrivalDeltaLabel}</strong>
            <small>{`출발 ${recommendedDepartureLabel} · 도착 ${expectedArrivalLabel}`}</small>
          </div>
        </div>

        <div className="planner-actions">
          <button type="button" className="secondary-button" onClick={resetPlanner}>
            시나리오 기준으로 되돌리기
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={requestTransitLookup}
            disabled={!routeLookupReady || isLoadingTransitRoutes}
          >
            {isLoadingTransitRoutes ? "실제 경로 조회 중" : "실제 경로 조회"}
          </button>
        </div>

        <p className="planner-note">{plannerSearchNote}</p>
        <p className="planner-note subdued">{plannerUsageNote}</p>
        {placeSearchError ? <p className="planner-note warning">{placeSearchError}</p> : null}
      </article>

      <article className="surface-card decision-panel">
        <SectionHeader
        eyebrow="4. 추천 결과"
          title={decisionText.headline}
          description={displayResult?.explanation || "경로를 정하면 가장 먼저 봐야 할 판단 결과를 여기에 보여줍니다."}
          rightSlot={<span className={`map-status ${scheduleSummary.tone}`}>{scheduleSummary.badge}</span>}
        />

        <div className={`decision-banner ${scheduleSummary.tone}`}>
          <div>
            <span>지금 해야 할 행동</span>
            <strong>{scheduleSummary.headline}</strong>
          </div>
          <small>{scheduleSummary.detail}</small>
        </div>

        <div className="arrival-target-grid">
          {decisionHeroStats.map((item) => (
            <div className="key-stat key-stat-target" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>

        <div className="decision-summary-grid">
          {decisionStatsPrimary.map((item) => (
            <div className="key-stat" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>

        <div className="action-callout">
          <strong>추천 한 줄</strong>
          <p>{decisionText.action}</p>
          <small>{recommendationItems[0]}</small>
        </div>

        <div className="mode-toggle-row">
          {modeLeaderboard.map((row) => (
            <button
              type="button"
              key={row.value}
              className={`mode-toggle ${mode === row.value ? "active" : ""}`}
              onClick={() => setMode(row.value)}
            >
              <strong>{row.label}</strong>
              <span>
                {row.result ? `${formatPercent(row.displayCatchProbability)} / 위험 ${row.displayRiskScore}점` : "계산 대기"}
              </span>
            </button>
          ))}
        </div>

        {recommendedMode ? (
          <p className="toolbar-note">
            현재 조건에서 가장 유리한 기준은 <strong>{recommendedMode.label}</strong>입니다.
          </p>
        ) : null}
      </article>

      {routeMapPanel}

    </section>
  );

  const realtimePanel = (
    <section className="tab-panel">
      {parameterImpactPanel}

      {hasTransitLookupResult ? (
        <TransitRouteSection
          routes={transitRoutes}
          isLoading={isLoadingTransitRoutes}
          error={transitRoutesError}
          hasRouteKey={config?.hasTmapTransitKey}
          quotas={config?.tmapQuotas}
          walkSpeedMps={activeWalkProfile.speedMps}
          signalWaitSec={Number(signalWait)}
          arrivalEtaSec={displayResult?.bus_eta_p50_sec}
          recommendedDelaySec={displayResult?.recommended_wait_sec}
          arrivalCandidates={realtimeArrivalCandidates}
        />
      ) : null}

      <SubwayBoardSection
        board={subwayBoard}
        boardError={subwayBoardError}
        transitContext={plannerTransitContext}
      />

      <article className="surface-card">
        <SectionHeader
          eyebrow="비교"
          title="모드별 차이는 여기서 비교합니다"
          description="첫 화면에서는 하나만 보고, 자세한 비교는 이 탭에서 확인하면 됩니다."
        />
        <div className="simple-list mode-comparison-list">
          {comparisonRows.map((row) => (
            <button
              type="button"
              key={`comparison-${row.value}`}
              className={`mode-card ${mode === row.value ? "selected" : ""}`}
              onClick={() => setMode(row.value)}
            >
              <div className="mode-card-head">
                <strong>{row.label}</strong>
                <span>{row.displayRiskLevel || row.result?.risk_level || "대기"}</span>
              </div>
              <div className="mode-card-metrics mode-card-metrics-enhanced">
                <div>
                  <span>총 ETA</span>
                  <strong>{row.totalJourneyLabel}</strong>
                </div>
                <div>
                  <span>보행·대기 ETA</span>
                  <strong>{row.approachEtaLabel}</strong>
                </div>
                <div>
                  <span>추천 대기</span>
                  <strong>{row.result ? formatDuration(row.result.recommended_wait_sec || 0) : "-"}</strong>
                </div>
                <div>
                  <span>탑승 가능성</span>
                  <strong>{row.recommendedJourneyLabel}</strong>
                </div>
              </div>
              <div className="mode-card-metrics mode-card-metrics-legacy">
                <div>
                  <span>도보 ETA</span>
                  <strong>{row.result ? formatDuration(row.result.walk_eta_p50_sec) : "-"}</strong>
                </div>
                <div>
                  <span>탑승 가능성</span>
                  <strong>{row.displayCatchProbability != null ? formatPercent(row.displayCatchProbability) : "-"}</strong>
                </div>
                <div>
                  <span>위험도</span>
                  <strong>{row.displayRiskScore != null ? `${row.displayRiskScore}점` : "-"}</strong>
                </div>
              </div>
            </button>
          ))}
        </div>
      </article>

      <article className="surface-card">
        <SectionHeader
          eyebrow="근거"
          title="판단 근거만 따로 모았습니다"
          description="어떤 데이터를 썼는지 설명할 때는 이 목록만 보여주면 됩니다."
        />
        {evidenceItems.length ? (
          <div className="simple-list">
            {evidenceItems.slice(0, 6).map((item) => (
              <div className="simple-list-item" key={item}>
                {item}
              </div>
            ))}
          </div>
        ) : (
          <div className="subway-empty">아직 표시할 근거가 없습니다.</div>
        )}
      </article>

      <article className="surface-card">
        <SectionHeader
          eyebrow="연결 상태"
          title="현재 붙어 있는 데이터"
          description="버스는 승인 대기 상태로 두고, 신호등과 지하철 중심으로 데모를 진행합니다."
        />
        <div className="source-list">
          {visibleSources.map((source) => (
            <div className={`source-pill ${sourceStatusClass(source.status)}`} key={source.id}>
              <div className="source-top">
                <strong>{SOURCE_LABELS[source.id] || source.label || source.id}</strong>
                <span>{sourceStatusLabel(source.status)}</span>
              </div>
              <small>{source.detail}</small>
            </div>
          ))}
        </div>
      </article>

      <article className="surface-card">
        <SectionHeader
          eyebrow="시나리오"
          title="현재 기준 시나리오"
          description="검색 결과를 선택하지 않았을 때는 이 시나리오 좌표를 기본값으로 사용합니다."
        />
        <div className="scenario-detail-list">
          <div className="detail-row">
            <span>이름</span>
            <strong>{selectedScenario?.name || "-"}</strong>
          </div>
          <div className="detail-row">
            <span>노선</span>
            <strong>{selectedScenario?.route_name || "-"}</strong>
          </div>
          <div className="detail-row">
            <span>목표</span>
            <strong>{selectedScenario?.target_stop_name || "-"}</strong>
          </div>
          <div className="detail-row">
            <span>메모</span>
            <strong>{selectedScenario?.note || "설명이 아직 없습니다."}</strong>
          </div>
        </div>
      </article>
    </section>
  );

  const settingsPanel = (
    <section className="tab-panel">
      <article className="surface-card">
        <SectionHeader
          eyebrow="설정"
          title="계산 기준만 따로 조정"
          description="여기서 바꾼 값은 다시 계산 버튼을 누르면 바로 반영됩니다."
        />

        <form className="control-form" onSubmit={runEvaluation}>
          <label className="field-stack">
            <span>기본 시나리오</span>
            <select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>
              {scenarios.map((scenario) => (
                <option value={scenario.id} key={scenario.id}>
                  {scenario.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field-stack">
            <span>보행 프로필</span>
            <select value={walkProfileId} onChange={(event) => setWalkProfileId(event.target.value)}>
              {WALK_PROFILES.map((profile) => (
                <option value={profile.id} key={profile.id}>
                  {profile.label}
                </option>
              ))}
            </select>
            <small className="field-help">{activeWalkProfile.detail}</small>
          </label>

          <div className="field-grid">
            <label className="field-stack">
              <span>기본 도보 거리</span>
              <input
                type="number"
                min="50"
                max="3000"
                value={walkDistance}
                onChange={(event) => setWalkDistance(Math.max(50, Number(event.target.value || 50)))}
              />
              <small className="field-help">
                장소를 선택하면 이 값보다 검색된 전체 경로 거리를 우선 사용합니다.
              </small>
            </label>

            <label className="field-stack">
              <span>신호 대기 시간</span>
              <input
                type="number"
                min="0"
                max="300"
                value={signalWait}
                onChange={(event) => setSignalWait(Number(event.target.value || 0))}
              />
              <small className="field-help">횡단 대기 여유를 수동으로 조정할 수 있습니다.</small>
            </label>
          </div>

          <label className="slider-field">
            <div className="field-line">
              <span>안전 버퍼</span>
              <strong>{safetyBuffer}초</strong>
            </div>
            <input
              type="range"
              min="0"
              max="90"
              step="5"
              value={safetyBuffer}
              onChange={(event) => setSafetyBuffer(Number(event.target.value))}
            />
            <small className="field-help">조금 더 보수적으로 판단하고 싶다면 값을 높이면 됩니다.</small>
          </label>

          <div className="setting-actions">
            <button type="submit" className="primary-button">
              다시 계산
            </button>
            <p className="planner-note subdued">{apiEndpointNote}</p>
          </div>
        </form>
      </article>
    </section>
  );

  const recentRoutesPanel = (
    <article className="surface-card recent-routes-card">
      <SectionHeader
        eyebrow="2. 최근 경로"
        title="자주 쓰는 경로를 바로 불러옵니다"
        description="발표 시연용 대표 경로를 한 번에 불러와 출발·도착 입력을 빠르게 바꿀 수 있습니다."
      />
      <div className="recent-route-list">
        {scenarios.slice(0, 3).map((scenario) => (
          <button
            type="button"
            key={`recent-${scenario.id}`}
            className={`recent-route-item ${scenarioId === scenario.id ? "active" : ""}`}
            onClick={() => {
              setScenarioId(scenario.id);
              setOriginInput("");
              setDestinationInput(scenario.target_stop_name || scenario.name);
            }}
          >
            <div className="recent-route-icon">{scenarioId === scenario.id ? "●" : "○"}</div>
            <div className="recent-route-copy">
              <strong>{scenario.name}</strong>
              <small>{scenario.route_name || scenario.target_stop_name || "기준 경로"}</small>
            </div>
            <span>{formatDuration((scenario.walk_eta_p50_sec || 0) + (scenario.bus_eta_p50_sec || 0))}</span>
          </button>
        ))}
      </div>
    </article>
  );

  return (
    <div className="app-shell">
      <div className="app-frame">
        <header className="app-header compact-header">
          <div className="compact-header-top">
            <div className="brand-pill">SAFEETA</div>
            <div className="build-pill">{FRONTEND_BUILD_LABEL}</div>
          </div>

          <div className="compact-copy">
            <h1>경로 위에서 바로 읽히는 ETA</h1>
            <p>
              지도 위 실제 경로를 기준으로 ETA를 다시 계산하고, 지금 이동해도 되는지 한 번에 보여줍니다.
            </p>
          </div>

          <div className="header-quick-row">
            <div className="header-quick-pill">
              <span>현재 상태</span>
              <strong>{heroStatus}</strong>
            </div>
            <div className="header-quick-pill">
              <span>마지막 계산</span>
              <strong>{updatedAt || "아직 없음"}</strong>
            </div>
            <div className="header-quick-pill">
              <span>현재 기준</span>
              <strong>{currentModeLabel}</strong>
            </div>
          </div>
        </header>

        <nav className="segmented-nav" aria-label="주요 화면">
          {NAV_ITEMS.map((item) => (
            <button
              type="button"
              key={item.key}
              className={`segmented-nav-item ${activeSection === item.key ? "active" : ""}`}
              onClick={() => setActiveSection(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {error ? <div className="app-alert danger">{error}</div> : null}

        <main className="app-section">
          {activeSection === "route" ? routePanel : null}
          {activeSection === "route" ? recentRoutesPanel : null}
          {activeSection === "realtime" ? realtimePanel : null}
          {activeSection === "settings" ? settingsPanel : null}
        </main>
      </div>
    </div>
  );
}
