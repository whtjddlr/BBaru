const els = {
  modeChip: document.getElementById("mode-chip"),
  keyStatus: document.getElementById("key-status"),
  gatewayBase: document.getElementById("gateway-base"),
  sourceList: document.getElementById("source-list"),
  statusSummary: document.getElementById("status-summary"),
  scenarioSelect: document.getElementById("scenario-select"),
  modeSelect: document.getElementById("mode-select"),
  walkSpeed: document.getElementById("walk-speed"),
  walkSpeedValue: document.getElementById("walk-speed-value"),
  safetyBuffer: document.getElementById("safety-buffer"),
  safetyBufferValue: document.getElementById("safety-buffer-value"),
  walkDistance: document.getElementById("walk-distance"),
  signalWait: document.getElementById("signal-wait"),
  form: document.getElementById("scenario-form"),
  decisionTitle: document.getElementById("decision-title"),
  decisionSubtitle: document.getElementById("decision-subtitle"),
  scenarioMeta: document.getElementById("scenario-meta"),
  summaryGrid: document.getElementById("summary-grid"),
  riskBanner: document.getElementById("risk-banner"),
  explanation: document.getElementById("explanation"),
  recommendations: document.getElementById("recommendations"),
  riskMeterValue: document.getElementById("risk-meter-value"),
  debugHighlights: document.getElementById("debug-highlights"),
};

const SOURCE_LABELS = {
  mock: "Mock 시나리오",
  sample: "실샘플",
  live: "전국 버스 라이브",
  "seoul-live": "서울 통합 라이브",
};

let scenarios = [];

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function statusLabel(status) {
  if (status === "active") return "연결됨";
  if (status === "sample") return "샘플";
  return "대기";
}

function modeLabel(value) {
  if (value === "safety_first") return "안전 우선";
  if (value === "time_first") return "정시 우선";
  return "균형";
}

function renderConfig(config) {
  els.modeChip.textContent = `MODE ${config.mode.toUpperCase()}`;
  els.keyStatus.textContent = config.statusSummary;
  els.gatewayBase.textContent = config.gatewayBaseUrl;
  els.statusSummary.textContent = config.statusSummary;
  const visibleSources = config.sources.filter((source) => source.status !== "pending" || source.id !== "bus");
  els.sourceList.innerHTML = visibleSources
    .map(
      (source) => `
        <div class="source-pill source-${source.status}">
          <strong>${source.label}</strong>
          <span>${statusLabel(source.status)}</span>
          <small>${source.detail}</small>
        </div>
      `,
    )
    .join("");
}

function syncRangeLabels() {
  els.walkSpeedValue.textContent = Number(els.walkSpeed.value).toFixed(2);
  els.safetyBufferValue.textContent = `${els.safetyBuffer.value}초`;
}

function populateScenarioSelect(items) {
  els.scenarioSelect.innerHTML = items
    .map((scenario) => `<option value="${scenario.id}">${scenario.name} · ${scenario.city}</option>`)
    .join("");
}

function applyScenarioDefaults(scenarioId) {
  const scenario = scenarios.find((item) => item.id === scenarioId);
  if (!scenario) return;
  els.walkDistance.value = scenario.walk_distance_m;
  els.signalWait.value = scenario.signal_wait_sec;
}

function buildDecisionCopy(result) {
  const mode = modeLabel(els.modeSelect.value);
  if (result.risk_level === "위험") {
    return {
      title: "지금 이동 비권장",
      subtitle: `${mode} 기준에서는 현재 이동보다 대안 선택이 더 안전합니다.`,
    };
  }
  if (result.catch_probability >= 0.6) {
    return {
      title: "지금 이동 가능",
      subtitle: `${mode} 기준에서 현재 타이밍으로 접근해도 될 가능성이 높습니다.`,
    };
  }
  return {
    title: "주의 후 이동 판단",
    subtitle: `${mode} 기준에서 보행 신호와 도착 타이밍을 함께 보고 움직이는 편이 좋습니다.`,
  };
}

function renderDebug(routeDebug) {
  const items = [];

  if (Array.isArray(routeDebug?.highlights)) {
    items.push(...routeDebug.highlights);
  }

  if (routeDebug?.signal?.sample?.crsrdId) {
    items.push(`신호 교차로 ID ${routeDebug.signal.sample.crsrdId}`);
  }

  if (routeDebug?.subway?.sample?.trainLineNm) {
    items.push(`지하철 기준 열차 ${routeDebug.subway.sample.trainLineNm}`);
  }

  if (routeDebug?.bus?.status === "active" && routeDebug?.bus?.routeInfoSample) {
    items.push(`버스 후보 ${routeDebug.bus.routeInfoSample.busRouteNm || routeDebug.bus.routeInfoSample.busRouteId}`);
  }

  if (Array.isArray(routeDebug?.issues)) {
    routeDebug.issues.forEach((issue) => items.push(`참고: ${issue}`));
  }

  if (!items.length) {
    items.push("실시간 근거가 이 영역에 표시됩니다.");
  }

  els.debugHighlights.innerHTML = items.map((item) => `<div class="debug-pill">${item}</div>`).join("");
}

function renderResult(result) {
  const scenario = result.scenario;
  const sourceLabel = SOURCE_LABELS[result.source] || result.source;
  const decisionCopy = buildDecisionCopy(result);

  els.decisionTitle.textContent = decisionCopy.title;
  els.decisionSubtitle.textContent = decisionCopy.subtitle;
  els.riskMeterValue.textContent = String(result.risk_score);

  els.scenarioMeta.innerHTML = [
    scenario.city,
    scenario.primary_mode_label,
    scenario.route_name,
    scenario.target_stop_name,
    sourceLabel,
  ]
    .map((item) => `<span class="meta-pill">${item}</span>`)
    .join("");

  els.summaryGrid.innerHTML = result.summary
    .map(
      (item) => `
        <div class="summary-card">
          <span>${item.label}</span>
          <strong>${item.value}</strong>
        </div>
      `,
    )
    .join("");

  const riskClass =
    result.risk_level === "위험" ? "risk-danger" : result.risk_level === "주의" ? "risk-caution" : "risk-good";

  els.riskBanner.className = `risk-banner ${riskClass}`;
  els.riskBanner.textContent = `${result.risk_level} · 놓침 확률 ${formatPercent(result.miss_probability)} · 횡단 위험 ${formatPercent(result.crossing_risk)}`;
  els.explanation.textContent = result.explanation;
  els.recommendations.innerHTML = result.recommendations.map((item) => `<div class="recommendation">${item}</div>`).join("");
  renderDebug(result.route_debug);
}

function renderError(message) {
  els.decisionTitle.textContent = "판단 결과를 불러오지 못했습니다";
  els.decisionSubtitle.textContent = "네트워크 또는 API 상태를 다시 확인해 주세요.";
  els.riskMeterValue.textContent = "-";
  els.riskBanner.className = "risk-banner risk-caution";
  els.riskBanner.textContent = "오류";
  els.explanation.textContent = message;
  els.recommendations.innerHTML = "";
  els.debugHighlights.innerHTML = `<div class="debug-pill">${message}</div>`;
}

async function loadInitialData() {
  const [configRes, scenariosRes] = await Promise.all([fetch("/api/config"), fetch("/api/scenarios")]);
  const config = await configRes.json();
  scenarios = await scenariosRes.json();

  renderConfig(config);
  populateScenarioSelect(scenarios);

  const firstScenario = scenarios[0];
  if (firstScenario) {
    els.scenarioSelect.value = firstScenario.id;
    applyScenarioDefaults(firstScenario.id);
    await submitEvaluation();
  }
}

async function submitEvaluation() {
  const payload = {
    scenario_id: els.scenarioSelect.value,
    walk_distance_m: Number(els.walkDistance.value),
    signal_wait_sec: Number(els.signalWait.value),
    profile: {
      preference_mode: els.modeSelect.value,
      walk_speed_mps: Number(els.walkSpeed.value),
      safety_buffer_sec: Number(els.safetyBuffer.value),
    },
  };

  try {
    const response = await fetch("/api/evaluate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.detail || "평가 요청이 실패했습니다.");
    }
    renderResult(result);
  } catch (error) {
    renderError(error instanceof Error ? error.message : "평가 요청이 실패했습니다.");
  }
}

els.walkSpeed.addEventListener("input", syncRangeLabels);
els.safetyBuffer.addEventListener("input", syncRangeLabels);
els.scenarioSelect.addEventListener("change", async (event) => {
  applyScenarioDefaults(event.target.value);
  await submitEvaluation();
});

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitEvaluation();
});

syncRangeLabels();
loadInitialData();
