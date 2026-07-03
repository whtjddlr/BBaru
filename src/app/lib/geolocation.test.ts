import { describe, expect, it } from "vitest";
import {
  classifyGeolocationError,
  hasRecentGeolocationPosition,
  shouldSuggestDemoForWeakGpsSignal,
} from "./geolocation.ts";

describe("geolocation error classification", () => {
  it("classifies permission denial as fatal", () => {
    expect(classifyGeolocationError({ code: 1, message: "denied" })).toBe("fatal");
  });

  it("classifies unavailable, timeout, and unknown errors as transient", () => {
    expect(classifyGeolocationError({ code: 2, message: "" })).toBe("transient");
    expect(classifyGeolocationError({ code: 3, message: "timeout" })).toBe("transient");
    expect(classifyGeolocationError({ code: 999, message: "temporary" })).toBe("transient");
  });

  it("treats a position received within 15 seconds as recent", () => {
    expect(hasRecentGeolocationPosition(10_000, 24_999)).toBe(true);
    expect(hasRecentGeolocationPosition(10_000, 25_001)).toBe(false);
    expect(hasRecentGeolocationPosition(null, 25_001)).toBe(false);
  });

  it("suggests demo only after five transient errors and stale location", () => {
    expect(
      shouldSuggestDemoForWeakGpsSignal({
        transientErrorCount: 4,
        lastPositionAt: 10_000,
        now: 30_001,
      }),
    ).toBe(false);
    expect(
      shouldSuggestDemoForWeakGpsSignal({
        transientErrorCount: 5,
        lastPositionAt: 10_000,
        now: 24_999,
      }),
    ).toBe(false);
    expect(
      shouldSuggestDemoForWeakGpsSignal({
        transientErrorCount: 5,
        lastPositionAt: 10_000,
        now: 25_001,
      }),
    ).toBe(true);
    expect(
      shouldSuggestDemoForWeakGpsSignal({
        transientErrorCount: 5,
        lastPositionAt: null,
        now: 25_001,
      }),
    ).toBe(true);
  });
});
