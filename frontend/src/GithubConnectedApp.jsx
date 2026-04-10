import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Clock3,
  Footprints,
  MapPin,
  Navigation2,
  Search,
  TrainFront,
  TriangleAlert,
} from "lucide-react";
import LiveTmapMap from "./components/LiveTmapMap";
import { getScenarioMapScene } from "./scenarioMapData";
import { apiUrl } from "./utils/api";

const MODES = [
  { value: "safety_first", label: "안전 우선" },
  { value: "balanced", label: "균형" },
  { value: "time_first", label: "정시 우선" },
];

const WALK_SPEED_OPTIONS = [
  { value: "slow", label: "느림", speed: 1.05, hint: "천천히 걷기" },
  { value: "easy", label: "여유", speed: 1.2, hint: "여유 있게 걷기" },
  { value: "normal", label: "보통", speed: 1.38, hint: "일반 성인 보행" },
  { value: "fast", label: "빠름", speed: 1.55, hint: "서둘러 걷기" },
  { value: "rush", label: "매우 빠름", speed: 1.72, hint: "급하게 이동" },
];

const STEP_THEME = {
  start: {
    rail: "bg-blue-100",
    node: "border-blue-100 bg-blue-50 text-blue-600",
    pill: "bg-blue-50 text-blue-700",
  },
  walk: {
    rail: "bg-blue-100",
    node: "border-blue-100 bg-blue-50 text-blue-600",
    pill: "bg-blue-50 text-blue-700",
  },
  transfer: {
    rail: "bg-violet-100",
    node: "border-violet-100 bg-violet-50 text-violet-600",
    pill: "bg-violet-50 text-violet-700",
  },
  wait: {
    rail: "bg-amber-100",
    node: "border-amber-100 bg-amber-50 text-amber-600",
    pill: "bg-amber-50 text-amber-700",
  },
  transit: {
    rail: "bg-emerald-100",
    node: "border-emerald-100 bg-emerald-50 text-emerald-600",
    pill: "bg-emerald-50 text-emerald-700",
  },
  arrival: {
    rail: "bg-rose-100",
    node: "border-rose-100 bg-rose-50 text-rose-600",
    pill: "bg-rose-50 text-rose-700",
  },
};

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return "-";
  const rounded = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  if (hours) return `${hours}시간 ${minutes}분`;
  if (minutes && seconds) return `${minutes}분 ${seconds}초`;
  if (minutes) return `${minutes}분`;
  return `${seconds}초`;
}

function formatMeters(value) {
  const meters = Number(value || 0);
  if (!Number.isFinite(meters) || meters <= 0) return "-";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  return `${Math.round(meters).toLocaleString()}m`;
}

function parseDistanceMeters(metaText) {
  const matched = String(metaText || "").match(/([\d,]+)m/);
  if (!matched) return 0;
  return Number(matched[1].replace(/,/g, ""));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getHeightBasedWalkPreset(heightCm) {
  const cm = Number(heightCm);
  if (!Number.isFinite(cm) || cm < 120 || cm > 230) return null;
  if (cm < 155) return WALK_SPEED_OPTIONS.find((option) => option.value === "slow");
  if (cm < 165) return WALK_SPEED_OPTIONS.find((option) => option.value === "easy");
  if (cm < 175) return WALK_SPEED_OPTIONS.find((option) => option.value === "normal");
  if (cm < 185) return WALK_SPEED_OPTIONS.find((option) => option.value === "fast");
  return WALK_SPEED_OPTIONS.find((option) => option.value === "rush");
}

function formatClock(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function buildTargetDate(value, now = new Date()) {
  const [hours, minutes] = String(value || "10:00")
    .split(":")
    .map((part) => Number(part));
  const target = new Date(now);
  target.setHours(Number.isFinite(hours) ? hours : 10, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  if (target.getTime() < now.getTime() - 15 * 60 * 1000) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

function pickPrimaryCandidate(routeSnapshot) {
  if (!routeSnapshot?.candidates?.length) return null;

  const scoreCandidate = (candidate) => {
    const totalDuration = Number(candidate?.total_duration_sec || 0);
    const transferCount = Number(candidate?.transfer_count || 0);
    const walkDistance = Number(candidate?.total_walk_distance_m || 0);
    const transitLegCount = (candidate?.legs || []).filter((leg) => String(leg?.mode || "").toLowerCase() !== "walk").length;
    return totalDuration + transferCount * 480 + walkDistance * 0.8 + Math.max(0, transitLegCount - 1) * 180;
  };

  const subwayOnly = routeSnapshot.candidates.filter((candidate) => {
    const modes = (candidate?.legs || []).map((leg) => String(leg?.mode || "").toLowerCase());
    return modes.includes("subway") && !modes.includes("bus");
  });

  const pool = subwayOnly.length ? subwayOnly : routeSnapshot.candidates;
  return [...pool].sort((left, right) => scoreCandidate(left) - scoreCandidate(right))[0];
}

function flattenRoutePath(candidate) {
  return (candidate?.legs || []).flatMap((leg) => (Array.isArray(leg?.path) ? leg.path : []));
}

function routeMatchesScenarioMode(routeSnapshot, scenario) {
  const candidate = pickPrimaryCandidate(routeSnapshot);
  if (!candidate || !scenario) return false;
  const modes = (candidate.legs || []).map((leg) => String(leg?.mode || "").toLowerCase());
  const primary = String(scenario.primary_mode_label || "").toLowerCase();
  if (primary.includes("지하철")) {
    return modes.includes("subway") && !modes.includes("bus");
  }
  return true;
}

function totalJourneySeconds(result, scenario, routeCandidate, walkSpeed) {
  if (!result) return null;
  const routeWalkDistance = Number(routeCandidate?.total_walk_distance_m || 0);
  const signalWait = Number(scenario?.signal_wait_sec ?? result?.scenario?.signal_wait_sec ?? 0);
  const recommendedWait = Number(result?.recommended_wait_sec || 0);
  const walkSeconds =
    routeWalkDistance > 0
      ? Math.round(routeWalkDistance / walkSpeed) + signalWait + recommendedWait
      : Number(result?.mode_adjusted_walk_eta_p50_sec || result?.walk_eta_p50_sec || 0);
  const transitSeconds = Number(routeCandidate?.total_transit_duration_sec || result?.bus_eta_p50_sec || 0);
  return walkSeconds + transitSeconds;
}

function buildSchedule(totalSec, targetArrivalTime) {
  if (!Number.isFinite(totalSec)) return null;
  const now = new Date();
  const targetDate = buildTargetDate(targetArrivalTime, now);
  const immediateDeparture = now;
  const immediateArrival = new Date(now.getTime() + totalSec * 1000);
  const rawRecommendedDeparture = new Date(targetDate.getTime() - totalSec * 1000);
  const recommendedDeparture = rawRecommendedDeparture.getTime() < now.getTime() ? now : rawRecommendedDeparture;
  const recommendedArrival = new Date(recommendedDeparture.getTime() + totalSec * 1000);
  return {
    immediateDeparture,
    immediateArrival,
    recommendedDeparture,
    recommendedArrival,
    targetDate,
    deltaSec: Math.round((immediateArrival.getTime() - targetDate.getTime()) / 1000),
    recommendedDeltaSec: Math.round((recommendedArrival.getTime() - targetDate.getTime()) / 1000),
  };
}

function getSummary(deltaSec) {
  if (!Number.isFinite(deltaSec)) return "경로 조회 전";
  if (deltaSec > 0) return `${formatDuration(deltaSec)} 지각 예상`;
  if (deltaSec >= -180) return "정시권 도착";
  return `${formatDuration(Math.abs(deltaSec))} 일찍 도착`;
}

function getDeltaLabel(deltaSec) {
  if (!Number.isFinite(deltaSec)) return "-";
  if (deltaSec === 0) return "지금 출발 시 정시 도착";
  if (deltaSec > 0) return `지금 출발 시 ${formatDuration(deltaSec)} 늦음`;
  return `지금 출발 시 ${formatDuration(Math.abs(deltaSec))} 빠름`;
}

function getDecision(schedule) {
  if (!schedule) {
    return {
      title: "먼저 실제 경로를 조회해 주세요",
      detail: "목표 도착 시각에 맞춰 권장 출발 시각을 계산합니다.",
      action: "경로 조회",
    };
  }

  const departure = formatClock(schedule.recommendedDeparture);

  if (schedule.deltaSec > 180) {
    return {
      title: "지금은 뛰어도 이번 타이밍이 어렵습니다",
      detail: `권장 출발 시각은 ${departure}입니다. 이번 신호나 열차에 무리하게 맞추기보다 다음 흐름으로 가는 편이 낫습니다.`,
      action: `권장 출발 ${departure}`,
    };
  }

  if (schedule.deltaSec > 0) {
    return {
      title: `지금 출발하면 ${formatDuration(schedule.deltaSec)} 늦을 수 있습니다`,
      detail: `권장 출발 시각은 ${departure}입니다.`,
      action: `권장 출발 ${departure}`,
    };
  }

  if (schedule.deltaSec >= -180) {
    return {
      title: "현재 기준으로 정시권 도착입니다",
      detail: `권장 출발 시각은 ${departure}입니다.`,
      action: `권장 출발 ${departure}`,
    };
  }

  return {
    title: `지금 출발하면 ${formatDuration(Math.abs(schedule.deltaSec))} 일찍 도착합니다`,
    detail: `권장 출발 시각은 ${departure}입니다.`,
    action: `권장 출발 ${departure}`,
  };
}

function getMovementGuidance(result, walkSpeedOption) {
  if (!result) return null;

  const slack = Number(result.slack_sec || 0);
  const catchProbability = Number(result.catch_probability || 0);
  const missProbability = Number(result.miss_probability || 0);
  const crossingRiskFlag = Boolean(result.crossing_risk_flag);

  if (crossingRiskFlag && missProbability >= 0.55) {
    return {
      title: "지금은 뛰어도 이번 타이밍이 어렵습니다",
      detail: "무리하게 속도를 올리기보다 다음 신호나 다음 열차 흐름으로 다시 맞추는 편이 낫습니다.",
      tone: "late",
    };
  }

  if (slack < -30 && slack >= -180 && catchProbability >= 0.35) {
    return {
      title: "조금만 더 빠르게 이동하면 제시간 탑승 가능성이 있습니다",
      detail: `${walkSpeedOption.label}보다 한 단계 빠르게 움직이면 이번 열차를 맞출 가능성이 커집니다.`,
      tone: "ontime",
    };
  }

  if (slack >= 0 && catchProbability >= 0.7) {
    return {
      title: "현재 속도로도 제시간 탑승 가능해요",
      detail: "지금 보행 속도를 유지하면 무리하지 않고도 이번 흐름에 맞출 가능성이 높습니다.",
      tone: "ontime",
    };
  }

  if (slack > 90 && catchProbability >= 0.8) {
    return {
      title: "지금은 서두르지 않아도 괜찮아요",
      detail: "조금 여유 있게 이동해도 목표 시각에 맞춰 도착할 가능성이 높습니다.",
      tone: "early",
    };
  }

  return {
    title: "현재 속도를 유지하면서 다음 구간을 확인해 주세요",
    detail: "횡단 전이나 승강장 진입 전에는 다시 계산한 결과를 기준으로 움직이는 편이 좋습니다.",
    tone: "neutral",
  };
}

function getBadgeTone(deltaSec) {
  if (!Number.isFinite(deltaSec)) return "neutral";
  if (deltaSec > 0) return "late";
  if (deltaSec >= -180) return "ontime";
  return "early";
}

function Badge({ tone, children }) {
  const toneClass = {
    ontime: "bg-emerald-50 text-emerald-700 border-emerald-200",
    early: "bg-blue-50 text-blue-700 border-blue-200",
    late: "bg-red-50 text-red-700 border-red-200",
    neutral: "bg-slate-100 text-slate-600 border-slate-200",
  }[tone || "neutral"];

  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${toneClass}`}>{children}</span>;
}

function TimeCard({ label, value, subtext }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold tracking-tight text-slate-900">{value}</div>
      {subtext ? <div className="mt-1 text-xs text-slate-500">{subtext}</div> : null}
    </div>
  );
}

export default function GithubConnectedApp() {
  const [screen, setScreen] = useState("main");
  const [config, setConfig] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [activeMode, setActiveMode] = useState("balanced");
  const [walkSpeedPreset, setWalkSpeedPreset] = useState("normal");
  const [heightCm, setHeightCm] = useState("");
  const [targetArrivalTime, setTargetArrivalTime] = useState("10:00");
  const [resultsByMode, setResultsByMode] = useState({});
  const [routeSnapshot, setRouteSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [routeNotice, setRouteNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function bootstrap() {
      try {
        const [configResponse, scenariosResponse] = await Promise.all([
          fetch(apiUrl("/api/config"), { signal: controller.signal }),
          fetch(apiUrl("/api/scenarios"), { signal: controller.signal }),
        ]);
        const [configJson, scenariosJson] = await Promise.all([configResponse.json(), scenariosResponse.json()]);
        setConfig(configJson);
        setScenarios(scenariosJson);
        if (scenariosJson?.length) setSelectedScenarioId(scenariosJson[0].id);
      } catch {
        setError("초기 데이터를 불러오지 못했습니다.");
      }
    }
    bootstrap();
    return () => controller.abort();
  }, []);

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenarioId) || scenarios[0] || null,
    [scenarios, selectedScenarioId],
  );
  const scenarioChoices = useMemo(
    () =>
      scenarios.map((scenario) => ({
        scenario,
        scene: getScenarioMapScene(scenario.id),
      })),
    [scenarios],
  );
  const scene = selectedScenario ? getScenarioMapScene(selectedScenario.id) : getScenarioMapScene("seoul-live-default");
  const walkSpeedOption = useMemo(
    () => WALK_SPEED_OPTIONS.find((option) => option.value === walkSpeedPreset) || WALK_SPEED_OPTIONS[2],
    [walkSpeedPreset],
  );
  const heightRecommendation = useMemo(() => getHeightBasedWalkPreset(heightCm), [heightCm]);
  const routeCandidate = useMemo(() => pickPrimaryCandidate(routeSnapshot), [routeSnapshot]);
  const routePath = useMemo(() => flattenRoutePath(routeCandidate), [routeCandidate]);
  const activeResult = resultsByMode[activeMode] || resultsByMode.balanced || null;

  const metrics = useMemo(() => {
    const totalSec = totalJourneySeconds(activeResult, selectedScenario, routeCandidate, walkSpeedOption.speed);
    const schedule = buildSchedule(totalSec, targetArrivalTime);
    return {
      totalSec,
      schedule,
      deltaLabel: schedule ? getDeltaLabel(schedule.deltaSec) : "-",
      summaryLabel: schedule ? getSummary(schedule.deltaSec) : "경로 조회 전",
      departureLabel: schedule ? formatClock(schedule.recommendedDeparture) : "-",
      arrivalLabel: schedule ? formatClock(schedule.recommendedArrival) : "-",
      immediateArrivalLabel: schedule ? formatClock(schedule.immediateArrival) : "-",
      transitLabel: formatDuration(Number(routeCandidate?.total_transit_duration_sec || activeResult?.bus_eta_p50_sec || 0)),
      tone: schedule ? getBadgeTone(schedule.deltaSec) : "neutral",
    };
  }, [activeResult, selectedScenario, routeCandidate, walkSpeedOption.speed, targetArrivalTime]);

  const decision = useMemo(() => getDecision(metrics.schedule), [metrics.schedule]);
  const movementGuidance = useMemo(
    () => getMovementGuidance(activeResult, walkSpeedOption),
    [activeResult, walkSpeedOption],
  );

  const comparisonRows = useMemo(
    () =>
      MODES.map((mode) => {
        const result = resultsByMode[mode.value] || null;
        const totalSec = totalJourneySeconds(result, selectedScenario, routeCandidate, walkSpeedOption.speed);
        const schedule = buildSchedule(totalSec, targetArrivalTime);
        return {
          ...mode,
          departure: schedule ? formatClock(schedule.recommendedDeparture) : "-",
          arrival: schedule ? formatClock(schedule.recommendedArrival) : "-",
          immediateArrival: schedule ? formatClock(schedule.immediateArrival) : "-",
          summary: schedule ? getSummary(schedule.deltaSec) : "경로 조회 전",
          total: totalSec,
          tone: schedule ? getBadgeTone(schedule.deltaSec) : "neutral",
        };
      }),
    [resultsByMode, selectedScenario, routeCandidate, walkSpeedOption.speed, targetArrivalTime],
  );

  const steps = useMemo(() => {
    if (routeCandidate?.legs?.length) {
      return routeCandidate.legs.flatMap((leg, index, legs) => {
        const mode = String(leg?.mode || "").toLowerCase();
        const previousTransit = legs.slice(0, index).some((item) => String(item?.mode || "").toLowerCase() !== "walk");
        const nextTransit = legs.slice(index + 1).some((item) => String(item?.mode || "").toLowerCase() !== "walk");

        if (mode === "walk") {
          const distance = Number(leg?.distance_m || 0);
          const duration = distance > 0 ? Math.round(distance / walkSpeedOption.speed) : Number(leg?.duration_sec || 0);
          const label = !previousTransit
            ? "탑승 전 도보"
            : !nextTransit
              ? "하차 후 도보"
              : "환승 도보";

          const walkItems = [
            {
              id: `walk-${index}`,
              icon: Footprints,
              kind: !previousTransit ? "walk" : !nextTransit ? "walk" : "transfer",
              label,
              detail: [leg?.start_name, leg?.end_name].filter(Boolean).join(" -> ") || "도보 구간",
              meta: `${distance ? `${distance.toLocaleString()}m` : "-"} · ${formatDuration(duration)}`,
            },
          ];

          if (!previousTransit && Number(selectedScenario?.signal_wait_sec || 0) > 0) {
            walkItems.push({
              id: "signal",
              icon: TriangleAlert,
              kind: "wait",
              label: "신호 대기",
              detail: "첫 횡단 구간 대기 시간 반영",
              meta: formatDuration(Number(selectedScenario.signal_wait_sec || 0)),
            });
          }

          return walkItems;
        }

        return [
          {
            id: `ride-${index}`,
            icon: TrainFront,
            kind: "transit",
            label: mode === "subway" ? "지하철 이동" : "탑승 이동",
            detail: [leg?.start_name, leg?.end_name].filter(Boolean).join(" -> ") || routeCandidate?.summary || "탑승 구간",
            meta: formatDuration(Number(leg?.duration_sec || 0)),
          },
        ];
      });
    }

    const items = [];
    const walkDistance = Number(selectedScenario?.walk_distance_m || 0);
    if (walkDistance > 0) {
      items.push({
        id: "walk",
        icon: Footprints,
        kind: "walk",
        label: "탑승 전 도보",
        detail: `${walkDistance.toLocaleString()}m`,
        meta: formatDuration(Math.round(walkDistance / walkSpeedOption.speed)),
      });
    }
    if (Number(selectedScenario?.signal_wait_sec || 0) > 0) {
      items.push({
        id: "signal",
        icon: TriangleAlert,
        kind: "wait",
        label: "신호 대기",
        detail: "횡단보도 대기 시간 반영",
        meta: formatDuration(Number(selectedScenario.signal_wait_sec || 0)),
      });
    }
    items.push({
      id: "ride",
      icon: TrainFront,
      kind: "transit",
      label: "지하철 이동",
      detail: selectedScenario?.route_name || "탑승 이동",
      meta: metrics.transitLabel,
    });
    return items;
  }, [routeCandidate, selectedScenario, walkSpeedOption.speed, metrics.transitLabel]);

  const supportFacts = useMemo(
    () => [
      { label: "지금 출발 도착", value: metrics.immediateArrivalLabel },
      { label: "총 보행", value: formatMeters(routeCandidate?.total_walk_distance_m || selectedScenario?.walk_distance_m) },
      { label: "환승", value: `${Number(routeCandidate?.transfer_count || 0)}회` },
      { label: "경로 기준", value: routeCandidate?.summary || selectedScenario?.route_name || "-" },
    ],
    [metrics.immediateArrivalLabel, routeCandidate, selectedScenario],
  );

  const routeChips = useMemo(
    () =>
      [selectedScenario?.primary_mode_label, scene?.boardLabel || scene?.stationLabel, scene?.destinationLabel].filter(Boolean),
    [scene, selectedScenario],
  );

  const timelineSteps = useMemo(
    () =>
      steps.map((step) => ({
        ...step,
        durationLabel: step.meta,
        supportLabel:
          step.kind === "wait"
            ? "실시간 신호 반영"
            : step.kind === "transit"
              ? step.detail
              : step.detail,
        theme: STEP_THEME[step.kind] || STEP_THEME.walk,
      })),
    [steps],
  );

  const routeBreakdown = useMemo(() => {
    const walkSeconds =
      Number(routeCandidate?.total_walk_duration_sec || 0) ||
      Math.round(Number(selectedScenario?.walk_distance_m || 0) / walkSpeedOption.speed);
    const waitSeconds = Number(selectedScenario?.signal_wait_sec || 0);
    const transitSeconds = Number(routeCandidate?.total_transit_duration_sec || activeResult?.bus_eta_p50_sec || 0);

    return [
      {
        label: "도보",
        value: formatDuration(walkSeconds),
        tint: "border-blue-100 bg-blue-50 text-blue-700",
      },
      {
        label: "대기",
        value: formatDuration(waitSeconds),
        tint: "border-amber-100 bg-amber-50 text-amber-700",
      },
      {
        label: "탑승",
        value: formatDuration(transitSeconds),
        tint: "border-emerald-100 bg-emerald-50 text-emerald-700",
      },
    ];
  }, [routeCandidate, selectedScenario, walkSpeedOption.speed, activeResult]);

  const timelineCards = useMemo(
    () =>
      timelineSteps.map((step) => {
        const distanceM = parseDistanceMeters(step.meta);
        const walkReference = Number(routeCandidate?.total_walk_distance_m || selectedScenario?.walk_distance_m || 0);
        const walkProgress = distanceM ? clamp((distanceM / Math.max(walkReference, distanceM, 1)) * 100, 18, 100) : 0;

        let supportLabel = step.supportLabel || step.detail;
        let accentLabel = "";
        let accentSubLabel = "";
        let durationLabel = step.durationLabel || step.meta;

        if (String(step.meta || "").includes("쨌")) {
          durationLabel = step.meta.split("쨌").pop()?.trim() || step.meta;
        }

        if (step.kind === "wait") {
          supportLabel = "실시간 신호 반영";
          accentLabel = "첫 횡단 구간 대기 시간 반영";
        } else if (step.kind === "transit") {
          if (activeResult?.slack_sec >= 0) {
            accentLabel = "이번 열차 탑승 가능";
            accentSubLabel = `${formatDuration(Math.abs(Number(activeResult.slack_sec || 0)))} 여유`;
          } else if (activeResult?.slack_sec > -90) {
            accentLabel = "조금 더 빠르게 이동하면 가능";
            accentSubLabel = `${formatDuration(Math.abs(Number(activeResult.slack_sec || 0)))} 차이`;
          } else {
            accentLabel = "지금은 뛰어도 이번 타이밍이 어려움";
            accentSubLabel = "다음 흐름 기준 재계산";
          }
        }

        return {
          ...step,
          distanceM,
          walkProgress,
          supportLabel,
          accentLabel,
          accentSubLabel,
          durationLabel,
        };
      }),
    [timelineSteps, routeCandidate, selectedScenario, activeResult],
  );

  async function fetchModeResults(speed) {
    if (!selectedScenario) return {};
    const rows = await Promise.all(
      MODES.map(async (mode) => {
        const response = await fetch(apiUrl("/api/evaluate"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenario_id: selectedScenario.id,
            profile: {
              preference_mode: mode.value,
              walk_speed_mps: speed,
              safety_buffer_sec: 20,
            },
            walk_distance_m: selectedScenario.walk_distance_m,
            signal_wait_sec: selectedScenario.signal_wait_sec,
          }),
        });
        if (!response.ok) throw new Error("ETA 계산 요청이 실패했습니다.");
        return [mode.value, await response.json()];
      }),
    );
    return Object.fromEntries(rows);
  }

  async function requestEstimate() {
    if (!selectedScenario) return;
    setIsLoading(true);
    setError("");
    setRouteNotice("");
    try {
      const [modeResults, cachedSnapshot] = await Promise.all([
        fetchModeResults(walkSpeedOption.speed),
        fetch(apiUrl(`/api/routes/scenario/${selectedScenario.id}`)).then((response) => (response.ok ? response.json() : null)),
      ]);

      let snapshot = routeMatchesScenarioMode(cachedSnapshot, selectedScenario) ? cachedSnapshot : null;
      let routeNotice = "";

      if (!snapshot) {
        const liveResponse = await fetch(apiUrl("/api/routes/transit"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start_x: scene.exit?.coords?.[1] ?? scene.center?.[1],
            start_y: scene.exit?.coords?.[0] ?? scene.center?.[0],
            end_x: scene.destinationAnchor?.[1] ?? scene.center?.[1],
            end_y: scene.destinationAnchor?.[0] ?? scene.center?.[0],
            count: 5,
          }),
        });

        if (liveResponse.ok) {
          snapshot = await liveResponse.json();
        } else if (cachedSnapshot) {
          snapshot = cachedSnapshot;
          routeNotice = "저장된 대표 경로를 우선 보여주고 있습니다.";
        } else {
          routeNotice = "오늘은 저장된 실제 경로가 없어 대표 프로토타입 경로를 먼저 보여줍니다.";
        }
      }

      setResultsByMode(modeResults);
      setRouteSnapshot(snapshot);
      setActiveMode("balanced");
      setRouteNotice(routeNotice);
      setScreen("result");
    } catch (requestError) {
      setError(requestError.message || "경로를 계산하지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedScenario || !Object.keys(resultsByMode).length) return;
    let cancelled = false;
    async function refreshResults() {
      setIsLoading(true);
      try {
        const modeResults = await fetchModeResults(walkSpeedOption.speed);
        if (!cancelled) setResultsByMode(modeResults);
      } catch (requestError) {
        if (!cancelled) setError(requestError.message || "보행 속도 변경을 반영하지 못했습니다.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    refreshResults();
    return () => {
      cancelled = true;
    };
  }, [walkSpeedPreset]);

  useEffect(() => {
    setResultsByMode({});
    setRouteSnapshot(null);
    setError("");
    setRouteNotice("");
    setActiveMode("balanced");
  }, [selectedScenarioId]);

  if (screen === "main") {
    return (
      <div className="min-h-screen bg-[#F5F7FB] text-slate-900">
        <div className="mx-auto min-h-screen max-w-[460px] bg-white">
          <div className="sticky top-0 z-20 border-b border-slate-100 bg-white px-5 pb-5 pt-6">
            <div className="text-[28px] font-bold tracking-tight text-blue-700">BBARU</div>
          </div>

          <div className="space-y-5 px-5 pb-8 pt-5">
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="h-3 w-3 rounded-full bg-blue-600" />
                <div className="flex-1">
                  <div className="text-xs text-slate-400">출발지</div>
                  <div className="text-sm font-semibold text-slate-900">{scene.originLabel}</div>
                </div>
                <MapPin className="h-5 w-5 text-slate-400" />
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <div className="flex-1">
                  <div className="text-xs text-slate-400">도착지</div>
                  <div className="text-sm font-semibold text-slate-900">{scene.destinationLabel}</div>
                </div>
                <Search className="h-5 w-5 text-slate-400" />
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <Clock3 className="h-5 w-5 text-blue-600" />
                <div className="text-sm text-slate-500">목표 도착 시각</div>
                <input
                  type="time"
                  value={targetArrivalTime}
                  onChange={(event) => setTargetArrivalTime(event.target.value || "10:00")}
                  className="ml-auto rounded-lg bg-transparent text-lg font-semibold tabular-nums text-slate-900 outline-none"
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">보행 속도 설정</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {walkSpeedOption.hint} · {walkSpeedOption.speed.toFixed(2)}m/s
                    </div>
                  </div>
                  <Footprints className="h-5 w-5 text-slate-400" />
                </div>
                <div className="mt-3 grid grid-cols-5 gap-2">
                  {WALK_SPEED_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setWalkSpeedPreset(option.value)}
                      className={`rounded-2xl px-2 py-2 text-center text-xs font-semibold transition ${
                        walkSpeedPreset === option.value ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-700">키 기준 기본 속도 추천</div>
                      <div className="mt-1 text-[11px] leading-5 text-slate-500">
                        자기 보행속도를 잘 모르겠다면 키를 입력해서 기본 속도를 추천받을 수 있어요.
                      </div>
                    </div>
                    {heightRecommendation ? <Badge tone="early">{`추천 ${heightRecommendation.label}`}</Badge> : null}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="number"
                      min="120"
                      max="230"
                      inputMode="numeric"
                      placeholder="예: 170"
                      value={heightCm}
                      onChange={(event) => setHeightCm(event.target.value)}
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-300"
                    />
                    <span className="text-sm font-semibold text-slate-500">cm</span>
                    <button
                      type="button"
                      onClick={() => heightRecommendation && setWalkSpeedPreset(heightRecommendation.value)}
                      disabled={!heightRecommendation}
                      className="shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                    >
                      추천 적용
                    </button>
                  </div>
                  {heightRecommendation ? (
                    <div className="mt-2 text-[11px] text-slate-500">
                      {`${heightCm}cm 기준 추천은 ${heightRecommendation.label} · ${heightRecommendation.hint}`}
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] text-slate-400">120cm~230cm 범위에서 입력하면 추천해드려요.</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">대표 시나리오</div>
                    <div className="mt-1 text-xs text-slate-500">서울 생활권 대표 경로를 바로 바꿔보며 비교할 수 있습니다.</div>
                  </div>
                  <TrainFront className="h-5 w-5 text-slate-400" />
                </div>
                <div className="mt-3 grid gap-2">
                  {scenarioChoices.map(({ scenario, scene: choiceScene }) => {
                    const selected = scenario.id === selectedScenarioId;
                    return (
                      <button
                        key={scenario.id}
                        type="button"
                        onClick={() => setSelectedScenarioId(scenario.id)}
                        className={`rounded-2xl border px-3 py-3 text-left transition ${
                          selected ? "border-blue-200 bg-blue-50 shadow-sm" : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900">{scenario.name}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {choiceScene.originLabel} -&gt; {choiceScene.destinationLabel}
                            </div>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${
                              selected ? "bg-white text-blue-700" : "bg-white text-slate-500"
                            }`}
                          >
                            {scenario.primary_mode_label}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={requestEstimate}
                disabled={!selectedScenario || isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-4 text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:opacity-60"
              >
                <Navigation2 className="h-5 w-5" />
                <span className="font-semibold">{isLoading ? "경로 계산 중" : "실제 경로 조회"}</span>
              </button>
            </div>

            <div className="hidden rounded-[24px] border border-blue-100 bg-blue-50 px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-500">권장 출발</div>
              <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{metrics.schedule ? formatClock(metrics.schedule.recommendedDeparture) : "--:--"}</div>
              <div className="mt-2 text-sm font-medium text-slate-700">{metrics.summaryLabel}</div>
              <div className="mt-2 text-sm text-slate-600">
                {metrics.schedule
                  ? `권장 출발 기준 도착 ${metrics.arrivalLabel} · 지금 출발 시 ${metrics.summaryLabel}`
                  : "실제 경로를 조회하면 계산됩니다."}
              </div>
            </div>

            {routeNotice ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{routeNotice}</div> : null}
            {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FB] text-slate-900">
      <div className="mx-auto min-h-screen max-w-[460px] bg-white">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <button type="button" onClick={() => setScreen("main")} className="rounded-xl p-2 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-900">{selectedScenario?.name || "경로 결과"}</div>
            <div className="text-xs text-slate-500">{`목표 도착 ${targetArrivalTime}`}</div>
          </div>
        </div>

        <div className="relative px-5 pb-8 pt-5">
          <LiveTmapMap appKey={config?.tmapMapAppKey} scene={scene} routePath={routePath} routeCandidate={routeCandidate} />

          <div className="relative -mt-12 rounded-[28px] border border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock3 className="h-5 w-5 text-blue-600" />
                <span className="font-semibold text-slate-900">도착 최적화 결과</span>
              </div>
              <Badge tone={metrics.tone}>{metrics.deltaLabel}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <TimeCard label="권장 출발" value={metrics.departureLabel} subtext={`목표 도착 ${targetArrivalTime} 기준`} />
              <TimeCard label="예상 도착" value={metrics.arrivalLabel} subtext="권장 출발 기준 도착" />
              <TimeCard label="총 ETA" value={formatDuration(metrics.totalSec)} />
              <TimeCard label="지하철 이동" value={metrics.transitLabel} subtext="경로 기준 탑승 이동 시간" />
            </div>

            <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-500">지금 출발 기준</div>
              <div className="mt-2 text-xl font-bold tracking-tight text-slate-900">{metrics.summaryLabel}</div>
              <div className="mt-2 text-sm text-slate-600">
                {`지금 출발 시 ${metrics.immediateArrivalLabel} 도착 · 목표 도착 ${targetArrivalTime} · 보행 속도 ${walkSpeedOption.label}`}
              </div>
            </div>

            {movementGuidance ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">이동 가이드</div>
                <div className="mt-2 text-base font-semibold text-slate-900">{movementGuidance.title}</div>
                <div className="mt-2 text-sm text-slate-600">{movementGuidance.detail}</div>
              </div>
            ) : null}
          </div>

          <div className="mt-4 rounded-[28px] bg-white px-5 py-5 shadow-lg">
            <div className="rounded-[24px] bg-blue-600 px-4 py-4 text-white">
              <div className="font-semibold">{decision.action}</div>
              <div className="mt-1 text-sm text-blue-50">{decision.title}</div>
              <div className="mt-2 text-xs text-blue-100">{decision.detail}</div>
            </div>

            <div className="mt-5 text-base font-semibold text-slate-900">모드 비교</div>
            <div className="mt-3 grid gap-3">
              {comparisonRows.map((row) => (
                <button
                  key={row.value}
                  type="button"
                  onClick={() => setActiveMode(row.value)}
                  className={`rounded-[22px] border px-4 py-4 text-left ${activeMode === row.value ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-sm text-slate-900">{row.label}</strong>
                    <Badge tone={row.tone}>{row.summary}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">{`권장 출발 ${row.departure} · 권장 출발 기준 도착 ${row.arrival} · 총 ${formatDuration(row.total)}`}</div>
                  <div className="mt-1 text-[11px] text-slate-400">{`지금 출발 시 ${row.immediateArrival} 도착`}</div>
                </button>
              ))}
            </div>

            <div className="mt-5">
              <div className="text-base font-semibold text-slate-900">경로 상세</div>

              <div className="mt-3 rounded-[28px] border border-slate-200 bg-white px-4 py-5 shadow-sm sm:px-5">
                <div className="space-y-5">
                  <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-3">
                    <div className="relative flex justify-center">
                      <div className="absolute bottom-[-24px] top-11 w-[3px] rounded-full bg-blue-100" />
                      <div className={`relative z-10 flex h-11 w-11 items-center justify-center rounded-full border-2 ${STEP_THEME.start.node}`}>
                        <Navigation2 className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <div className="text-[18px] font-semibold tracking-tight text-slate-900">{scene.originLabel}</div>
                      <div className="mt-1 text-sm text-slate-500">{`${metrics.departureLabel} 출발`}</div>
                    </div>
                  </div>

                  {timelineCards.map((step, index) => {
                    const Icon = step.icon;
                    const isLastStep = index === timelineCards.length - 1;

                    return (
                      <div key={step.id} className="grid grid-cols-[52px_minmax(0,1fr)] gap-3">
                        <div className="relative flex justify-center">
                          {!isLastStep ? <div className={`absolute bottom-[-24px] top-11 w-[3px] rounded-full ${step.theme.rail}`} /> : null}
                          <div className={`relative z-10 flex h-11 w-11 items-center justify-center rounded-full border-2 ${step.theme.node}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                        </div>

                        <div className="min-w-0 rounded-[22px] bg-slate-50 px-4 py-3">
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-[16px] font-semibold tracking-tight text-slate-900">{step.label}</div>
                              <div className="mt-1 break-keep text-sm leading-5 text-slate-500">{step.supportLabel}</div>
                            </div>
                            <span className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold ${step.theme.pill}`}>
                              {step.durationLabel}
                            </span>
                          </div>

                          {(step.kind === "walk" || step.kind === "transfer") && step.distanceM ? (
                            <div className="mt-3">
                              <div className="text-sm text-slate-700">{`승강장까지 ${formatMeters(step.distanceM)}`}</div>
                              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                <div className="h-full rounded-full bg-blue-500" style={{ width: `${step.walkProgress}%` }} />
                              </div>
                            </div>
                          ) : null}

                          {step.kind === "wait" && step.accentLabel ? (
                            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                              {step.accentLabel}
                            </div>
                          ) : null}

                          {step.kind === "transit" && step.accentLabel ? (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <span className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">{step.accentLabel}</span>
                              <span className="text-sm text-slate-500">{step.accentSubLabel}</span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}

                  <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-3">
                    <div className="relative flex justify-center">
                      <div className={`relative z-10 flex h-11 w-11 items-center justify-center rounded-full border-2 ${STEP_THEME.arrival.node}`}>
                        <MapPin className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[18px] font-semibold tracking-tight text-slate-900">{scene.destinationLabel}</div>
                          <div className="mt-1 text-[30px] font-bold leading-none tracking-tight text-blue-600">{metrics.arrivalLabel}</div>
                        </div>
                        <Badge tone={metrics.tone}>{metrics.deltaLabel}</Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                {routeBreakdown.map((item) => (
                  <div key={item.label} className={`rounded-[22px] border px-4 py-4 text-center ${item.tint}`}>
                    <div className="text-sm font-semibold">{item.label}</div>
                    <div className="mt-2 text-2xl font-bold tracking-tight">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="hidden">

            <div className="mt-5 text-base font-semibold text-slate-900">구간별 구성</div>
            <div className="mt-3 grid gap-3">
              {steps.map((step, index) => {
                const Icon = step.icon;
                const kindStyle =
                  step.kind === "transit"
                    ? "border-slate-200 bg-slate-50"
                    : step.kind === "wait"
                      ? "border-amber-200 bg-amber-50"
                      : step.kind === "transfer"
                        ? "border-violet-200 bg-violet-50"
                        : "border-blue-200 bg-blue-50";
                return (
                  <div key={step.id} className="grid grid-cols-[34px_1fr] gap-3">
                    <div className="flex flex-col items-center">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">{index + 1}</div>
                      {index < steps.length - 1 ? <div className="mt-2 h-full w-px bg-slate-200" /> : null}
                    </div>
                    <div className={`rounded-[20px] border px-4 py-4 ${kindStyle}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-slate-500" />
                          <div className="text-sm font-semibold text-slate-900">{step.label}</div>
                        </div>
                        <div className="text-xs font-semibold text-blue-700">{step.meta}</div>
                      </div>
                      <div className="mt-2 text-xs leading-5 text-slate-500">{step.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <details className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
              <summary className="cursor-pointer list-none text-sm font-semibold text-slate-700">상세 경로와 표시 기준 보기</summary>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {supportFacts.map((fact) => (
                  <div key={fact.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-[11px] text-slate-500">{fact.label}</div>
                    <div className="mt-1 text-sm font-semibold leading-5 text-slate-900">{fact.value}</div>
                  </div>
                ))}
              </div>

              {routeChips.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {routeChips.map((chip) => (
                    <span key={chip} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                      {chip}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 grid gap-2">
                {steps.map((step) => {
                  const detailTone =
                    step.kind === "transit"
                      ? "text-slate-700"
                      : step.kind === "wait"
                        ? "text-amber-700"
                        : step.kind === "transfer"
                          ? "text-violet-700"
                          : "text-blue-700";
                  return (
                    <div key={`detail-${step.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="min-w-0">
                        <div className="text-[11px] text-slate-500">{step.label}</div>
                        <div className="mt-1 text-sm font-semibold leading-5 text-slate-900">{step.detail}</div>
                      </div>
                      <div className={`shrink-0 text-sm font-semibold ${detailTone}`}>{step.meta}</div>
                    </div>
                  );
                })}
              </div>
            </details>
            </div>
          </div>

          {routeNotice ? <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{routeNotice}</div> : null}
          {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {config?.statusSummary ? <div className="mt-4 text-center text-xs text-slate-400">{config.statusSummary}</div> : null}
        </div>
      </div>
    </div>
  );
}
