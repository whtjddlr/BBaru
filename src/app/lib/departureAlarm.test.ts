import { describe, expect, it } from "vitest";
import {
  computeAlarmTimes,
  createDepartureAlarm,
  DEPARTURE_ALARM_STORAGE_KEY,
  markAlarmFired,
  readDepartureAlarm,
  shouldFire,
  writeDepartureAlarm,
  type StorageAdapter,
} from "./departureAlarm.ts";

describe("departure alarm", () => {
  it("computes five-minute and departure alarm times", () => {
    const now = new Date("2026-01-01T09:00:00");
    const recommendedDeparture = new Date("2026-01-01T09:10:00");

    expect(computeAlarmTimes(recommendedDeparture, now)).toEqual([
      { type: "fiveMinutesBefore", scheduledAt: new Date("2026-01-01T09:05:00") },
      { type: "departure", scheduledAt: recommendedDeparture },
    ]);
  });

  it("omits alarm times that have already passed", () => {
    expect(
      computeAlarmTimes(
        new Date("2026-01-01T09:03:00"),
        new Date("2026-01-01T09:00:00"),
      ).map((alarmTime) => alarmTime.type),
    ).toEqual(["departure"]);

    expect(
      computeAlarmTimes(
        new Date("2026-01-01T08:59:59"),
        new Date("2026-01-01T09:00:00"),
      ),
    ).toEqual([]);
  });

  it("fires each scheduled alarm only once", () => {
    const alarm = createDepartureAlarm(
      { origin: "강남역", destination: "선릉역", targetTime: "09:30" },
      new Date("2026-01-01T09:10:00"),
      new Date("2026-01-01T09:00:00"),
    );
    const fiveMinuteFire = shouldFire(alarm, new Date("2026-01-01T09:05:00"));

    expect(fiveMinuteFire?.type).toBe("fiveMinutesBefore");

    const afterFiveMinuteFire = markAlarmFired(alarm, "fiveMinutesBefore");

    expect(shouldFire(afterFiveMinuteFire, new Date("2026-01-01T09:05:15"))).toBeNull();
    expect(shouldFire(afterFiveMinuteFire, new Date("2026-01-01T09:10:00"))?.type).toBe("departure");

    const afterDepartureFire = markAlarmFired(afterFiveMinuteFire, "departure");

    expect(shouldFire(afterDepartureFire, new Date("2026-01-01T09:10:15"))).toBeNull();
  });

  it("prioritizes the departure alarm when both scheduled times were missed", () => {
    const alarm = createDepartureAlarm(
      { origin: "강남역", destination: "선릉역", targetTime: "09:30" },
      new Date("2026-01-01T09:10:00"),
      new Date("2026-01-01T09:00:00"),
    );

    expect(shouldFire(alarm, new Date("2026-01-01T09:12:00"))?.type).toBe("departure");
  });

  it("round-trips through storage", () => {
    const storage = new MemoryStorage();
    const alarm = createDepartureAlarm(
      { origin: " 강남역 ", destination: " 선릉역 ", targetTime: "09:30" },
      new Date("2026-01-01T09:10:00"),
      new Date("2026-01-01T09:00:00"),
    );

    writeDepartureAlarm(alarm, storage);

    expect(storage.getItem(DEPARTURE_ALARM_STORAGE_KEY)).toBeTruthy();
    expect(readDepartureAlarm(storage)).toEqual({
      ...alarm,
      routeSummary: {
        origin: "강남역",
        destination: "선릉역",
        targetTime: "09:30",
      },
    });
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
