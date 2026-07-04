import { describe, expect, it } from "vitest";
import { createEtaPlanFromSegments, type RouteSegment } from "./eta.ts";
import {
  applyWalkProfile,
  collectPaceSample,
  estimateWalkSpeedFromHeightCm,
  getWalkDurationScale,
  isWalkProfileMature,
  readWalkProfile,
  setWalkProfileHeight,
  updateWalkProfile,
  WALK_PROFILE_STORAGE_KEY,
  writeWalkProfile,
  type StorageAdapter,
  type WalkProfile,
} from "./walkProfile.ts";

describe("walk pace sample collection", () => {
  const prev = { traveledDistanceMeters: 100, accuracy: 10 };

  it("accepts realistic walking samples on walking segments", () => {
    expect(collectPaceSample(prev, { traveledDistanceMeters: 112, accuracy: 10 }, 10, "walk")).toEqual({
      speedMps: 1.2,
      distanceMeters: 12,
      elapsedSeconds: 10,
    });
    expect(collectPaceSample(prev, { traveledDistanceMeters: 115, accuracy: 10 }, 10, "final_walk")?.speedMps)
      .toBe(1.5);
  });

  it("rejects non-walking, short, inaccurate, and unrealistic samples", () => {
    expect(collectPaceSample(prev, { traveledDistanceMeters: 120, accuracy: 10 }, 10, "subway")).toBeNull();
    expect(collectPaceSample(prev, { traveledDistanceMeters: 104.9, accuracy: 10 }, 10, "walk")).toBeNull();
    expect(collectPaceSample(prev, { traveledDistanceMeters: 112, accuracy: 51 }, 10, "walk")).toBeNull();
    expect(collectPaceSample(prev, { traveledDistanceMeters: 102, accuracy: 10 }, 10, "walk")).toBeNull();
    expect(collectPaceSample(prev, { traveledDistanceMeters: 150, accuracy: 10 }, 10, "walk")).toBeNull();
  });
});

describe("walk profile updates and storage", () => {
  it("updates speed with EMA alpha 0.3", () => {
    const first = updateWalkProfile(null, 1.0, new Date("2026-01-01T09:00:00Z"));
    const second = updateWalkProfile(first, 2.0, new Date("2026-01-01T09:00:10Z"));

    expect(first.speedMps).toBe(1);
    expect(first.sampleCount).toBe(1);
    expect(second.speedMps).toBeCloseTo(1.3, 5);
    expect(second.sampleCount).toBe(2);
  });

  it("preserves stored height while updating measured speed", () => {
    const profile = {
      speedMps: 1.34,
      sampleCount: 0,
      heightCm: 170,
      updatedAt: "2026-01-01T09:00:00.000Z",
    };
    const nextProfile = updateWalkProfile(profile, 2.0, new Date("2026-01-01T09:00:10Z"));

    expect(nextProfile.heightCm).toBe(170);
    expect(nextProfile.speedMps).toBeCloseTo(1.538, 5);
    expect(nextProfile.sampleCount).toBe(1);
  });

  it("estimates and clamps walking speed from height", () => {
    expect(estimateWalkSpeedFromHeightCm(170)).toBeCloseTo(1.34045, 5);
    expect(estimateWalkSpeedFromHeightCm(0)).toBe(0.3);
    expect(estimateWalkSpeedFromHeightCm(10000)).toBe(3.0);
  });

  it("sets height by seeding or preserving an existing profile", () => {
    const seededProfile = setWalkProfileHeight(null, 170, new Date("2026-01-01T09:00:00Z"));

    expect(seededProfile).toEqual({
      speedMps: estimateWalkSpeedFromHeightCm(170),
      sampleCount: 0,
      heightCm: 170,
      updatedAt: "2026-01-01T09:00:00.000Z",
    });

    const existingProfile: WalkProfile = {
      speedMps: 1.8,
      sampleCount: 7,
      heightCm: 160,
      updatedAt: "2026-01-01T08:00:00.000Z",
    };
    const updatedProfile = setWalkProfileHeight(existingProfile, 250, new Date("2026-01-01T09:00:00Z"));

    expect(updatedProfile).toEqual({
      speedMps: 1.8,
      sampleCount: 7,
      heightCm: 220,
      updatedAt: "2026-01-01T08:00:00.000Z",
    });
  });

  it("round-trips through storage", () => {
    const storage = new MemoryStorage();
    const profile: WalkProfile = {
      speedMps: 1.4,
      sampleCount: 10,
      updatedAt: "2026-01-01T09:00:00.000Z",
    };

    writeWalkProfile(profile, storage);

    expect(storage.getItem(WALK_PROFILE_STORAGE_KEY)).toBeTruthy();
    expect(readWalkProfile(storage)).toEqual(profile);
  });

  it("parses optional height only when it is compatible", () => {
    const storage = new MemoryStorage();

    storage.setItem(
      WALK_PROFILE_STORAGE_KEY,
      JSON.stringify({
        speedMps: 1.4,
        sampleCount: 2,
        heightCm: 170,
        updatedAt: "2026-01-01T09:00:00.000Z",
      }),
    );
    expect(readWalkProfile(storage)).toEqual({
      speedMps: 1.4,
      sampleCount: 2,
      heightCm: 170,
      updatedAt: "2026-01-01T09:00:00.000Z",
    });

    storage.setItem(
      WALK_PROFILE_STORAGE_KEY,
      JSON.stringify({
        speedMps: 1.4,
        sampleCount: 2,
        heightCm: 99,
        updatedAt: "2026-01-01T09:00:00.000Z",
      }),
    );
    expect(readWalkProfile(storage)?.heightCm).toBeUndefined();
  });

  it("treats profiles below 10 samples as learning", () => {
    expect(isWalkProfileMature({ speedMps: 1.4, sampleCount: 9, updatedAt: "2026-01-01T09:00:00.000Z" }))
      .toBe(false);
    expect(isWalkProfileMature({ speedMps: 1.4, sampleCount: 10, updatedAt: "2026-01-01T09:00:00.000Z" }))
      .toBe(true);
  });
});

describe("walk profile plan adjustment", () => {
  const now = new Date("2026-01-01T09:00:00");
  const segments: RouteSegment[] = [
    { id: "walk", type: "walk", label: "도보", duration: 100, distance: 138 },
    { id: "wait", type: "wait_signal", label: "신호", duration: 30 },
    { id: "subway", type: "subway", label: "지하철", duration: 200 },
    { id: "final", type: "final_walk", label: "마지막 도보", duration: 50, distance: 69 },
  ];
  const plan = createEtaPlanFromSegments({
    request: {
      origin: "강남역",
      destination: "선릉역",
      targetTime: "10:00",
    },
    mode: "balanced",
    now,
    segments,
    alternatives: [
      {
        id: "alt",
        label: "대안",
        detail: "버스",
        duration: 500,
      },
    ],
  });

  it("does not adjust plans for immature profiles", () => {
    const immatureProfile = { speedMps: 2.0, sampleCount: 9, updatedAt: "2026-01-01T09:00:00.000Z" };

    expect(applyWalkProfile(plan, immatureProfile, now)).toBe(plan);
  });

  it("clamps duration scale from profile speed", () => {
    expect(getWalkDurationScale(10)).toBe(0.7);
    expect(getWalkDurationScale(0.5)).toBe(1.5);
  });

  it("adjusts plans using height-seeded speed before the profile matures", () => {
    const profile = setWalkProfileHeight(null, 170, new Date("2026-01-01T09:00:00Z"));
    const adjusted = applyWalkProfile(plan, profile, now);

    expect(adjusted).not.toBe(plan);
    expect(adjusted.segments.map((segment) => segment.duration)).toEqual([103, 30, 200, 51]);
    expect(adjusted.walkProfileApplied).toEqual({
      speedMps: estimateWalkSpeedFromHeightCm(170),
      sampleCount: 0,
      scale: getWalkDurationScale(estimateWalkSpeedFromHeightCm(170)),
      source: "height",
    });
  });

  it("scales only walking durations and recalculates totals", () => {
    const profile = { speedMps: 2.76, sampleCount: 10, updatedAt: "2026-01-01T09:00:00.000Z" };
    const adjusted = applyWalkProfile(plan, profile, now);

    expect(adjusted.segments.map((segment) => segment.duration)).toEqual([70, 30, 200, 35]);
    expect(adjusted.totalDuration).toBe(335);
    expect(adjusted.stats.walking).toBe(105);
    expect(adjusted.stats.waiting).toBe(30);
    expect(adjusted.stats.riding).toBe(200);
    expect(adjusted.walkProfileApplied).toEqual({
      speedMps: 2.76,
      sampleCount: 10,
      scale: 0.7,
      source: "measured",
    });
  });

  it("recalculates recommended departure, expected arrival, and deviation", () => {
    const profile = { speedMps: 2.76, sampleCount: 10, updatedAt: "2026-01-01T09:00:00.000Z" };
    const adjusted = applyWalkProfile(plan, profile, now);

    expect(adjusted.recommendedDeparture.getTime()).toBe(
      adjusted.targetArrival.getTime() - (adjusted.totalDuration + adjusted.bufferSeconds) * 1000,
    );
    expect(adjusted.expectedArrival.getTime()).toBe(
      adjusted.recommendedDeparture.getTime() + adjusted.totalDuration * 1000,
    );
    expect(adjusted.deviationMinutes).toBe(
      Math.round((adjusted.expectedArrival.getTime() - adjusted.targetArrival.getTime()) / 60000),
    );
  });
});

class MemoryStorage implements StorageAdapter {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}
