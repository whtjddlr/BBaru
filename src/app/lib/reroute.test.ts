import { describe, expect, it } from "vitest";
import transitResponse from "./__fixtures__/transit-response.json";
import {
  createInitialRerouteState,
  createReroutePlan,
  recordRerouteAttempt,
  REROUTE_FAILURE_BACKOFF_MS,
  REROUTE_MAX_ATTEMPTS_PER_SESSION,
  shouldReroute,
  updateRerouteStateForPosition,
} from "./reroute.ts";
import type { TmapTransitResponse } from "./tmap.ts";

describe("reroute decision", () => {
  it("requires off-route distance to persist for at least 10 seconds", () => {
    const startedAt = new Date("2026-01-01T09:00:00");
    const state = updateRerouteStateForPosition(createInitialRerouteState(), startedAt, 51);

    expect(shouldReroute(state, new Date("2026-01-01T09:00:09.999"))).toBe(false);
    expect(shouldReroute(state, new Date("2026-01-01T09:00:10.000"))).toBe(true);
  });

  it("requires 30 seconds after the last reroute attempt", () => {
    const state = {
      offRouteStartedAtIso: "2026-01-01T08:59:00.000Z",
      lastRerouteAtIso: "2026-01-01T09:00:00.000Z",
      rerouteCount: 1,
      backoffUntilIso: null,
    };

    expect(shouldReroute(state, new Date("2026-01-01T09:00:29.999Z"))).toBe(false);
    expect(shouldReroute(state, new Date("2026-01-01T09:00:30.000Z"))).toBe(true);
  });

  it("stops rerouting after five attempts in a session", () => {
    const state = {
      offRouteStartedAtIso: "2026-01-01T08:59:00.000Z",
      lastRerouteAtIso: null,
      rerouteCount: REROUTE_MAX_ATTEMPTS_PER_SESSION,
      backoffUntilIso: null,
    };

    expect(shouldReroute(state, new Date("2026-01-01T09:00:00.000Z"))).toBe(false);
  });

  it("resets the off-route timer when the user returns within the route threshold", () => {
    const startedAt = new Date("2026-01-01T09:00:00");
    const offRouteState = updateRerouteStateForPosition(createInitialRerouteState(), startedAt, 80);
    const recoveredState = updateRerouteStateForPosition(
      offRouteState,
      new Date("2026-01-01T09:00:05"),
      20,
    );

    expect(recoveredState.offRouteStartedAtIso).toBeNull();
    expect(shouldReroute(recoveredState, new Date("2026-01-01T09:00:20"))).toBe(false);

    const secondDepartureState = updateRerouteStateForPosition(
      recoveredState,
      new Date("2026-01-01T09:00:21"),
      80,
    );

    expect(shouldReroute(secondDepartureState, new Date("2026-01-01T09:00:30"))).toBe(false);
    expect(shouldReroute(secondDepartureState, new Date("2026-01-01T09:00:31"))).toBe(true);
  });

  it("honors failure backoff before allowing another reroute", () => {
    const offRouteState = {
      offRouteStartedAtIso: "2026-01-01T08:59:00.000Z",
      lastRerouteAtIso: null,
      rerouteCount: 0,
      backoffUntilIso: null,
    };
    const failedAttemptState = recordRerouteAttempt(
      offRouteState,
      new Date("2026-01-01T09:00:00.000Z"),
      REROUTE_FAILURE_BACKOFF_MS,
    );

    expect(shouldReroute(failedAttemptState, new Date("2026-01-01T09:00:59.999Z"))).toBe(false);
    expect(shouldReroute(failedAttemptState, new Date("2026-01-01T09:01:00.000Z"))).toBe(true);
  });
});

describe("reroute plan replacement", () => {
  it("keeps the target arrival time and recalculates deviation from the new current position", () => {
    const now = new Date("2026-01-01T09:30:00");
    const previousRequest = {
      origin: "강남역",
      destination: "선릉역",
      targetTime: "09:10",
      originPoint: { lat: 37.497952, lng: 127.027619 },
      destinationPoint: { lat: 37.504503, lng: 127.048957 },
    };
    const plan = createReroutePlan(
      previousRequest,
      { lat: 37.500656, lng: 127.036425 },
      transitResponse as TmapTransitResponse,
      "balanced",
      now,
    );

    expect(plan.request.origin).toBe("현재 위치");
    expect(plan.request.targetTime).toBe(previousRequest.targetTime);
    expect(plan.targetArrival.getHours()).toBe(9);
    expect(plan.targetArrival.getMinutes()).toBe(10);
    expect(plan.expectedArrival.getTime()).toBe(now.getTime() + plan.totalDuration * 1000);
    expect(plan.deviationMinutes).toBe(
      Math.round((plan.expectedArrival.getTime() - plan.targetArrival.getTime()) / 60000),
    );
  });
});
