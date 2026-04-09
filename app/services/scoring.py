from __future__ import annotations

import math

from app.models import EvaluationResult, Scenario, SummaryLine, UserProfile


def _clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def _sigmoid(value: float) -> float:
    return 1 / (1 + math.exp(-value))


def _format_duration(total_seconds: int) -> str:
    minutes, seconds = divmod(max(0, total_seconds), 60)
    if minutes and seconds:
        return f"{minutes}분 {seconds}초"
    if minutes:
        return f"{minutes}분"
    return f"{seconds}초"


def _recommended_wait_seconds(
    *,
    mode: str,
    signal_wait_sec: int,
    crossing_risk: float,
    miss_probability: float,
    crossing_risk_flag: bool,
    safety_buffer_sec: int,
    congestion_level: float,
) -> int:
    severity = max(crossing_risk, miss_probability, congestion_level * 0.9)

    if mode == "safety_first":
        wait = (signal_wait_sec * 0.65) + (safety_buffer_sec * 0.7) + (severity * 48)
        if crossing_risk_flag:
            wait += 18
        return int(round(min(180, max(12, wait))))

    if mode == "balanced":
        wait = (signal_wait_sec * 0.25) + (safety_buffer_sec * 0.25) + max(0.0, severity - 0.38) * 42
        if crossing_risk_flag:
            wait += 8
        return int(round(min(90, max(0, wait))))

    wait = (signal_wait_sec * 0.08) - (safety_buffer_sec * 0.15)
    if crossing_risk_flag and crossing_risk > 0.82:
        wait += 10
    return int(round(min(30, max(0, wait))))


def evaluate_scenario(
    scenario: Scenario,
    profile: UserProfile,
    walk_distance_m: int | None,
    signal_wait_sec: int | None,
) -> EvaluationResult:
    distance_m = walk_distance_m or scenario.walk_distance_m
    wait_sec = signal_wait_sec if signal_wait_sec is not None else scenario.signal_wait_sec

    walk_time_sec = distance_m / profile.walk_speed_mps
    walk_eta_p50 = int(round(walk_time_sec + wait_sec))

    cautious_speed = max(0.75, profile.walk_speed_mps - 0.18)
    walk_eta_p90 = int(round((distance_m / cautious_speed) + wait_sec + max(18, wait_sec * 0.35)))

    crossing_required = scenario.crossing_distance_m / profile.walk_speed_mps
    crossing_risk_flag = scenario.crossing_window_sec < crossing_required + profile.safety_buffer_sec
    crossing_risk = _clamp(
        0.15
        + (max(0.0, crossing_required + profile.safety_buffer_sec - scenario.crossing_window_sec) / 30.0)
        + (wait_sec / 220.0)
    )
    if crossing_risk_flag:
        crossing_risk = max(crossing_risk, 0.72)

    effective_bus_speed_mps = max(3.3, (scenario.bus_speed_kph / 3.6) * (1 - 0.18 * scenario.congestion_level))
    bus_eta_p50 = int(round(scenario.bus_remaining_distance_m / effective_bus_speed_mps))
    freshness_penalty = min(90, int(scenario.bus_freshness_sec * 0.3))
    reliability_penalty = int((1 - scenario.bus_reliability) * 150)
    congestion_penalty = int(scenario.congestion_level * 70)
    bus_eta_p90 = bus_eta_p50 + freshness_penalty + reliability_penalty + congestion_penalty

    provisional_slack = bus_eta_p50 - walk_eta_p50 - profile.safety_buffer_sec
    provisional_miss_probability = _clamp(
        1
        - _sigmoid(
            (provisional_slack / 40.0)
            + ((scenario.bus_reliability - 0.5) * 2.2)
        ),
        0.02,
        0.98,
    )

    effective_mode = profile.preference_mode.value
    recommended_wait_sec = _recommended_wait_seconds(
        mode=effective_mode,
        signal_wait_sec=wait_sec,
        crossing_risk=crossing_risk,
        miss_probability=provisional_miss_probability,
        crossing_risk_flag=crossing_risk_flag,
        safety_buffer_sec=profile.safety_buffer_sec,
        congestion_level=scenario.congestion_level,
    )
    mode_adjusted_walk_eta_p50 = walk_eta_p50 + recommended_wait_sec
    mode_adjusted_walk_eta_p90 = walk_eta_p90 + recommended_wait_sec

    mode_bias = {
        "safety_first": -0.12,
        "balanced": 0.0,
        "time_first": 0.12,
    }[effective_mode]
    crossing_modifier = {
        "safety_first": 0.82,
        "balanced": 0.94,
        "time_first": 1.06,
    }[effective_mode]

    slack_sec = bus_eta_p50 - mode_adjusted_walk_eta_p50 - profile.safety_buffer_sec
    catch_probability = _clamp(
        _sigmoid((slack_sec / 38.0) + ((scenario.bus_reliability - 0.5) * 2.4) + mode_bias),
        0.02,
        0.98,
    )
    miss_probability = 1 - catch_probability

    effective_crossing_risk = _clamp(crossing_risk * crossing_modifier)
    if effective_mode == "time_first" and crossing_risk_flag:
        effective_crossing_risk = _clamp(effective_crossing_risk + 0.04)

    context_risk = 0.08
    if scenario.is_last_bus:
        context_risk += 0.52
    if scenario.is_night:
        context_risk += 0.15
    context_risk += scenario.congestion_level * 0.12
    context_risk = _clamp(context_risk)

    risk_score = int(
        round(
            100
            * (
                0.55 * miss_probability
                + 0.30 * effective_crossing_risk
                + 0.15 * context_risk
            )
        )
    )

    if risk_score >= 70:
        risk_level = "위험"
    elif risk_score >= 40:
        risk_level = "주의"
    else:
        risk_level = "양호"

    recommendations: list[str] = []
    if recommended_wait_sec > 0:
        recommendations.append(f"현재 모드에서는 약 {_format_duration(recommended_wait_sec)} 대기 후 이동하는 쪽이 유리합니다.")
    if crossing_risk_flag:
        recommendations.append("횡단 창이 짧아서 지금 바로 건너기보다 다음 신호에 맞춰 움직이는 편이 안전합니다.")
    if miss_probability >= 0.45:
        recommendations.append(
            f"현재 {scenario.primary_mode_label} 대신 `{scenario.alternative_label}` 안내를 먼저 보여주는 편이 안전합니다."
        )
    else:
        recommendations.append(
            f"현재 {scenario.primary_mode_label}를 목표로 하되, 보행 구간과 대기시간을 함께 반영해 움직이도록 안내합니다."
        )

    if effective_mode == "safety_first":
        recommendations.append("안전 우선 모드는 신호와 보행 버퍼를 크게 잡아 보수적으로 판단합니다.")
    elif effective_mode == "time_first":
        recommendations.append("정시 우선 모드는 대기 시간을 줄여 도착 시간을 앞당기되, 위험도는 더 높게 반영합니다.")
    else:
        recommendations.append("균형 모드는 안전과 정시성을 함께 보면서 중간 수준의 대기를 권장합니다.")

    if miss_probability >= 0.45:
        explanation = (
            f"현재 경로는 탑승 실패 가능성이 {miss_probability:.0%}로 높습니다. "
            f"보행과 신호 대기, {scenario.primary_mode_label} 도착 흐름을 함께 반영했을 때 "
            f"`{scenario.alternative_label}` 안내가 더 안전합니다."
        )
    else:
        explanation = (
            f"현재 경로는 탑승 성공 가능성이 {catch_probability:.0%}입니다. "
            f"보행 구간과 추천 대기시간을 함께 반영해 안전하게 도착하도록 계산했습니다."
        )

    summary = [
        SummaryLine(label="기본 보행 ETA", value=f"{_format_duration(walk_eta_p50)} / p90 {_format_duration(walk_eta_p90)}"),
        SummaryLine(
            label="보행·대기 ETA",
            value=f"{_format_duration(mode_adjusted_walk_eta_p50)} / p90 {_format_duration(mode_adjusted_walk_eta_p90)}",
        ),
        SummaryLine(label="추천 대기", value=_format_duration(recommended_wait_sec)),
        SummaryLine(label=f"{scenario.primary_mode_label} ETA", value=f"{_format_duration(bus_eta_p50)} / p90 {_format_duration(bus_eta_p90)}"),
        SummaryLine(label="탑승 가능성", value=f"{catch_probability:.0%}"),
        SummaryLine(label="위험도", value=f"{risk_score}점 ({risk_level})"),
    ]

    return EvaluationResult(
        scenario=scenario,
        walk_eta_p50_sec=walk_eta_p50,
        walk_eta_p90_sec=walk_eta_p90,
        recommended_wait_sec=recommended_wait_sec,
        mode_adjusted_walk_eta_p50_sec=mode_adjusted_walk_eta_p50,
        mode_adjusted_walk_eta_p90_sec=mode_adjusted_walk_eta_p90,
        bus_eta_p50_sec=bus_eta_p50,
        bus_eta_p90_sec=bus_eta_p90,
        slack_sec=slack_sec,
        catch_probability=catch_probability,
        miss_probability=miss_probability,
        crossing_risk=effective_crossing_risk,
        context_risk=context_risk,
        risk_score=risk_score,
        risk_level=risk_level,
        crossing_risk_flag=crossing_risk_flag,
        explanation=explanation,
        recommendations=recommendations,
        summary=summary,
    )
