import { describe, expect, it } from "vitest";
import transitResponse from "./__fixtures__/transit-response.json";
import { createEtaPlan, createEtaPlanFromSegments } from "./eta.ts";
import {
  canUseLiveTracking,
  estimateArrival,
  getDistanceMeters,
  getRouteCoordinates,
  isArrived,
  isOffRoute,
  paceAdvice,
  projectOntoRoute,
  selectArrivedState,
  selectProgressPercent,
} from "./tracking.ts";
import type { GeoPoint, RouteSegment } from "./eta.ts";
import { mapTransitResponseToPlan } from "./transitMapper.ts";
import type { TmapTransitResponse } from "./tmap.ts";

const route: GeoPoint[] = [
  { lat: 37.5000, lng: 127.0000 },
  { lat: 37.5010, lng: 127.0000 },
  { lat: 37.5020, lng: 127.0000 },
];

describe("tracking projection", () => {
  it("projects a position on the route with near-zero off-route distance", () => {
    const projection = projectOntoRoute({ lat: 37.5010, lng: 127.0000 }, route);

    expect(projection.progressPercent).toBeCloseTo(50, 1);
    expect(projection.offRouteDistanceMeters).toBeLessThan(1);
    expect(projection.projectedPoint.lat).toBeCloseTo(37.5010, 5);
  });

  it("projects a nearby position back onto the route", () => {
    const projection = projectOntoRoute({ lat: 37.5010, lng: 127.0003 }, route);

    expect(projection.progressPercent).toBeCloseTo(50, 1);
    expect(projection.offRouteDistanceMeters).toBeGreaterThan(20);
    expect(projection.offRouteDistanceMeters).toBeLessThan(35);
    expect(projection.projectedPoint.lng).toBeCloseTo(127.0000, 5);
  });

  it("reports a large off-route distance for far positions", () => {
    const projection = projectOntoRoute({ lat: 37.5010, lng: 127.0100 }, route);

    expect(projection.offRouteDistanceMeters).toBeGreaterThan(800);
    expect(isOffRoute(projection.offRouteDistanceMeters)).toBe(true);
  });

  it("keeps progress monotonic along the route", () => {
    const first = projectOntoRoute({ lat: 37.5004, lng: 127.0000 }, route);
    const second = projectOntoRoute({ lat: 37.5015, lng: 127.0000 }, route);
    const third = projectOntoRoute({ lat: 37.5020, lng: 127.0000 }, route);

    expect(first.progressPercent).toBeLessThan(second.progressPercent);
    expect(second.progressPercent).toBeLessThanOrEqual(third.progressPercent);
    expect(third.progressPercent).toBeCloseTo(100, 1);
  });
});

describe("tracking ETA and route state helpers", () => {
  const segments: RouteSegment[] = [
    { id: "walk", type: "walk", label: "도보", duration: 300 },
    { id: "subway", type: "subway", label: "지하철", duration: 600 },
    { id: "final", type: "final_walk", label: "도보", duration: 300 },
  ];
  const plan = createEtaPlanFromSegments({
    request: {
      origin: "출발",
      destination: "도착",
      targetTime: "10:20",
    },
    mode: "balanced",
    now: new Date("2026-01-01T09:50:00"),
    segments,
    totalDuration: 1200,
  });

  it("recalculates arrival from remaining route progress", () => {
    const now = new Date("2026-01-01T10:00:00");
    const estimate = estimateArrival(0.5, plan, now);

    expect(estimate.remainingDurationSeconds).toBe(600);
    expect(estimate.expectedArrival.getTime()).toBe(now.getTime() + 600000);
    expect(estimate.deviationMinutes).toBe(-10);
  });

  it("classifies pace advice by deviation", () => {
    expect(paceAdvice(-3).title).toBe("여유 있습니다");
    expect(paceAdvice(0).title).toBe("현재 속도 유지하세요");
    expect(paceAdvice(3).title).toBe("조금 더 빠르게 이동하세요");
  });

  it("detects route departures and arrivals", () => {
    expect(isOffRoute(50)).toBe(false);
    expect(isOffRoute(50.1)).toBe(true);
    expect(isArrived(98, 49)).toBe(true);
    expect(isArrived(97.9, 10)).toBe(false);
    expect(isArrived(99, 51)).toBe(false);
  });

  it("measures destination distance with haversine", () => {
    const distance = getDistanceMeters(route[0], route[1]);

    expect(distance).toBeGreaterThan(100);
    expect(distance).toBeLessThan(120);
  });
});

describe("tracking with Tmap transit fixture geometry", () => {
  const request = {
    origin: "강남역",
    destination: "선릉역",
    targetTime: "10:00",
    originPoint: { lat: 37.497952, lng: 127.027619 },
    destinationPoint: { lat: 37.504503, lng: 127.048957 },
  };
  const plan = mapTransitResponseToPlan(
    request,
    transitResponse as TmapTransitResponse,
    "balanced",
    new Date("2026-01-01T09:00:00"),
  );
  const routeCoords = getRouteCoordinates(plan.segments, [request.originPoint, request.destinationPoint]);

  it("projects Yeoksam Station into the middle of the transit route", () => {
    const projection = projectOntoRoute({ lat: 37.500656, lng: 127.036425 }, routeCoords);

    expect(projection.progressPercent).toBeGreaterThanOrEqual(35);
    expect(projection.progressPercent).toBeLessThanOrEqual(65);
    expect(projection.offRouteDistanceMeters).toBeLessThan(5);
  });

  it("projects Seolleung destination near the end of the route", () => {
    const projection = projectOntoRoute({ lat: 37.50450, lng: 127.04896 }, routeCoords);

    expect(projection.progressPercent).toBeGreaterThanOrEqual(90);
    expect(projection.offRouteDistanceMeters).toBeLessThan(50);
  });

  it("detects the observed off-route point as far away from the route", () => {
    const projection = projectOntoRoute({ lat: 37.4955, lng: 127.0370 }, routeCoords);

    expect(projection.offRouteDistanceMeters).toBeGreaterThan(300);
    expect(isOffRoute(projection.offRouteDistanceMeters)).toBe(true);
  });

  it("uses live projection instead of demo progress and arrives from live criteria", () => {
    const liveProjection = projectOntoRoute({ lat: 37.50450, lng: 127.04896 }, routeCoords);
    const distanceToDestination = getDistanceMeters({ lat: 37.50450, lng: 127.04896 }, request.destinationPoint);

    expect(selectProgressPercent("live", liveProjection, 19)).toBeGreaterThanOrEqual(90);
    expect(selectProgressPercent("demo", liveProjection, 19)).toBe(19);
    expect(
      selectArrivedState({
        mode: "live",
        liveProjection,
        distanceToDestinationMeters: distanceToDestination,
        demoArrived: false,
      }),
    ).toBe(true);
    expect(
      selectArrivedState({
        mode: "demo",
        liveProjection,
        distanceToDestinationMeters: distanceToDestination,
        demoArrived: false,
      }),
    ).toBe(false);
  });

  it("allows live tracking when a real transit plan has route geometry", () => {
    expect(canUseLiveTracking(plan)).toBe(true);
  });
});

describe("live tracking eligibility", () => {
  it("rejects mock ETA plans without route geometry", () => {
    const mockPlan = createEtaPlan(
      {
        origin: "강남역",
        destination: "선릉역",
        targetTime: "10:00",
      },
      "balanced",
      new Date("2026-01-01T09:00:00"),
    );

    expect(canUseLiveTracking(mockPlan)).toBe(false);
  });
});
