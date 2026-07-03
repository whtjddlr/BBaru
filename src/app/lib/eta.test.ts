import { describe, expect, it } from "vitest";
import {
  createEtaPlan,
  createStatus,
  deviationBadgeVariant,
  ETA_MODES,
  formatDeviation,
  normalizeRequest,
  parseTargetTime,
} from "./eta.ts";
import type { EtaMode, RouteSegment } from "./eta.ts";
import {
  getNextEvent,
  getRemainingWalkingDistance,
  interpolateRoutePosition,
  scaleSpeedDelta,
} from "./enRoute.ts";

const request = {
  origin: "강남역 2번 출구",
  destination: "선릉역",
  targetTime: "12:00",
};

const modeOrder: EtaMode[] = ["safe", "balanced", "punctual"];

describe("ETA engine", () => {
  it("is deterministic for the same origin and destination", () => {
    const now = new Date("2026-01-01T09:00:00");
    const first = createEtaPlan(request, "balanced", now);
    const second = createEtaPlan(request, "balanced", now);

    expect(second.segments).toEqual(first.segments);
    expect(second.totalDuration).toBe(first.totalDuration);
  });

  it("sets totalDuration to the sum of segment durations", () => {
    const plan = createEtaPlan(request, "balanced", new Date("2026-01-01T09:00:00"));
    const segmentSum = plan.segments.reduce((sum, segment) => sum + segment.duration, 0);

    expect(plan.totalDuration).toBe(segmentSum);
  });

  it("uses each mode buffer as the normal-case deviation", () => {
    const now = new Date("2026-01-01T09:00:00");

    modeOrder.forEach((mode) => {
      const plan = createEtaPlan(request, mode, now);

      expect(plan.deviationMinutes).toBe(-(ETA_MODES[mode].bufferSeconds / 60));
    });
  });

  it("uses now + total duration as expected arrival in late status", () => {
    const now = new Date("2026-01-01T09:00:00");
    const baseline = createEtaPlan(request, "balanced", now);
    const lateTarget = new Date(now.getTime() + (baseline.totalDuration - 120) * 1000);
    const latePlan = createEtaPlan({ ...request, targetTime: toClock(lateTarget) }, "balanced", now);

    expect(latePlan.status.kind).toBe("late");
    expect(latePlan.expectedArrival.getTime()).toBe(now.getTime() + latePlan.totalDuration * 1000);
    expect(latePlan.deviationMinutes).toBe(
      Math.round((latePlan.expectedArrival.getTime() - latePlan.targetArrival.getTime()) / 60000),
    );
  });

  it("classifies status boundaries around the recommended departure time", () => {
    const now = new Date("2026-01-01T09:00:00");
    const targetArrival = new Date("2026-01-01T10:00:00");

    expect(createStatus(now, targetArrival, addSeconds(now, 61)).kind).toBe("wait");
    expect(createStatus(now, targetArrival, addSeconds(now, 60)).kind).toBe("ready");
    expect(createStatus(now, targetArrival, addSeconds(now, -60)).kind).toBe("ready");
    expect(createStatus(now, targetArrival, addSeconds(now, -61)).kind).toBe("late");
  });

  it("keeps a recently passed target as target_passed", () => {
    const plan = createEtaPlan(
      { ...request, targetTime: "09:00" },
      "balanced",
      new Date("2026-01-01T09:05:00"),
    );

    expect(plan.status.kind).toBe("target_passed");
  });

  it("rolls a target time to tomorrow when it is more than 6 hours in the past", () => {
    const now = new Date("2026-01-01T23:50:00");
    const target = parseTargetTime("08:30", now);
    const plan = createEtaPlan({ ...request, targetTime: "08:30" }, "balanced", now);

    expect(target.getDate()).toBe(2);
    expect(target.getHours()).toBe(8);
    expect(target.getMinutes()).toBe(30);
    expect(plan.targetArrival.getDate()).toBe(2);
    expect(plan.status.kind).not.toBe("target_passed");
  });

  it("normalizes request text and formats deviation helpers", () => {
    expect(normalizeRequest({ origin: "  A ", destination: " B  ", targetTime: "10:00" })).toEqual({
      origin: "A",
      destination: "B",
      targetTime: "10:00",
    });
    expect(formatDeviation(-3)).toBe("3분 빠름");
    expect(formatDeviation(0)).toBe("정시");
    expect(formatDeviation(2)).toBe("2분 늦음");
    expect(deviationBadgeVariant(-1)).toBe("early");
    expect(deviationBadgeVariant(0)).toBe("ontime");
    expect(deviationBadgeVariant(1)).toBe("late");
  });
});

describe("en-route helpers", () => {
  const segments: RouteSegment[] = [
    { id: "walk", type: "walk", label: "도보", duration: 100, distance: 200 },
    { id: "signal", type: "wait_signal", label: "신호 대기", duration: 50 },
    { id: "final", type: "final_walk", label: "하차 후 도보", duration: 25, distance: 80 },
  ];

  it("returns destination arrival as the next event during the final segment", () => {
    expect(getNextEvent(segments, 160)).toEqual({
      label: "목적지 도착",
      secondsUntil: 15,
    });
    expect(getNextEvent(segments, 175)).toBeNull();
  });

  it("scales speed delta by remaining progress", () => {
    expect(scaleSpeedDelta(-120, 0)).toBe(-120);
    expect(scaleSpeedDelta(-120, 50)).toBe(-60);
    expect(scaleSpeedDelta(-120, 95)).toBe(-6);
    expect(scaleSpeedDelta(180, 95)).toBe(9);
    expect(scaleSpeedDelta(180, 100)).toBe(0);
  });

  it("counts only walking segments for remaining walking distance", () => {
    const mixedSegments: RouteSegment[] = [
      { id: "walk", type: "walk", label: "도보", duration: 100, distance: 100 },
      { id: "subway", type: "subway", label: "지하철", duration: 100, distance: 2022 },
      { id: "bus", type: "bus", label: "버스", duration: 100, distance: 1200 },
      { id: "final", type: "final_walk", label: "하차 후 도보", duration: 100, distance: 40 },
    ];

    expect(getRemainingWalkingDistance(mixedSegments, 0)).toBe(140);
    expect(getRemainingWalkingDistance(mixedSegments, 50)).toBe(90);
    expect(getRemainingWalkingDistance(mixedSegments, 150)).toBe(40);
    expect(getRemainingWalkingDistance(mixedSegments, 350)).toBe(20);
  });

  it("interpolates current position along segment geometry", () => {
    const routeSegments: RouteSegment[] = [
      {
        id: "walk",
        type: "walk",
        label: "도보",
        duration: 100,
        geometry: [
          { lat: 37, lng: 127 },
          { lat: 38, lng: 128 },
          { lat: 39, lng: 129 },
        ],
      },
    ];

    expect(interpolateRoutePosition(routeSegments, 50)).toEqual({ lat: 38, lng: 128 });
    expect(interpolateRoutePosition(routeSegments, 100)).toEqual({ lat: 39, lng: 129 });
  });
});

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

function toClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
