import { describe, expect, it } from "vitest";
import crossroadsFixture from "./__fixtures__/signal-crossroads.json";
import realtimeFixture from "./__fixtures__/signal-realtime.json";
import {
  adviseCrossing,
  findNearestCrossroad,
  findSignalCrossroadsForRoute,
  parsePedestrianSignals,
} from "./signal.ts";
import type { Crossroad, SignalRealtimeItem } from "./signal.ts";

const crossroads = crossroadsFixture.body.items.item.map((item) => ({
  id: item.crsrdId,
  name: item.crsrdNm,
  coord: {
    lat: Number(item.mapCtptIntLat),
    lng: Number(item.mapCtptIntLot),
  },
})) as Crossroad[];
const realtimeItems = realtimeFixture.body.items.item as SignalRealtimeItem[];

describe("signal parser", () => {
  it("extracts pedestrian signals and ignores empty fields", () => {
    const signals = parsePedestrianSignals(realtimeItems[0]);

    expect(signals).toEqual([
      { direction: "et", state: "red", remainingSeconds: 0.27 },
      { direction: "st", state: "red", remainingSeconds: 4.37 },
    ]);
  });

  it("handles unknown states and invalid remaining values defensively", () => {
    const signals = parsePedestrianSignals({
      crsrdId: "test",
      ntPdsgRmndCs: "2500",
      ntPdsgSttsNm: "custom-state",
      etPdsgRmndCs: "",
      etPdsgSttsNm: "protected-Movement-Allowed",
      stPdsgRmndCs: "-1",
      stPdsgSttsNm: "stop-And-Remain",
      wtPdsgRmndCs: "0",
      wtPdsgSttsNm: "stop-And-Remain",
    });

    expect(signals).toEqual([
      { direction: "nt", state: "unknown", remainingSeconds: 25 },
    ]);
  });
});

describe("signal spatial helpers", () => {
  it("finds the nearest crossroad within the configured radius", () => {
    const nearest = findNearestCrossroad({ lat: 37.5231971, lng: 126.9713254 }, crossroads, 10);

    expect(nearest?.id).toBe("1");
    expect(nearest?.name).toBe("이촌역앞");
  });

  it("returns null when no crossroad is close enough", () => {
    const nearest = findNearestCrossroad({ lat: 37.1, lng: 127.5 }, crossroads, 20);

    expect(nearest).toBeNull();
  });

  it("keeps only route-near crossroads that have pedestrian signal data", () => {
    const realtimeIndex = new Map(realtimeItems.map((item) => [String(item.crsrdId), item]));
    const signalCrossroads = findSignalCrossroadsForRoute(
      [
        { lat: 37.5231971, lng: 126.9713254 },
        { lat: 37.5547454, lng: 127.1364893 },
      ],
      crossroads,
      realtimeIndex,
      10,
    );

    expect(signalCrossroads.length).toBe(1);
    expect(signalCrossroads[0].crossroad.id).toBe("1");
    expect(signalCrossroads[0].signals.length).toBe(2);
  });

  it("excludes route-near crossroads when no pedestrian signal has positive remaining time", () => {
    const realtimeIndex = new Map<string, SignalRealtimeItem>([
      [
        "1",
        {
          crsrdId: "1",
          etPdsgRmndCs: "0",
          etPdsgSttsNm: "stop-And-Remain",
          stPdsgRmndCs: "",
          stPdsgSttsNm: "protected-Movement-Allowed",
          wtPdsgRmndCs: "-10",
          wtPdsgSttsNm: "permissive-Movement-Allowed",
        },
      ],
    ]);
    const signalCrossroads = findSignalCrossroadsForRoute(
      [{ lat: 37.5231971, lng: 126.9713254 }],
      crossroads,
      realtimeIndex,
      10,
    );

    expect(signalCrossroads).toEqual([]);
  });
});

describe("crossing advice", () => {
  it("allows crossing when green time is sufficient", () => {
    expect(
      adviseCrossing({ direction: "nt", state: "green", remainingSeconds: 25 }, 20),
    ).toEqual({
      action: "go",
      message: "지금 건너세요.",
      waitSeconds: 0,
    });
  });

  it("recommends waiting when green time is too short", () => {
    expect(
      adviseCrossing({ direction: "nt", state: "green", remainingSeconds: 8 }, 20),
    ).toEqual({
      action: "wait",
      message: "다음 신호를 기다리세요. 무리하지 마세요.",
      waitSeconds: 8,
    });
  });

  it("recommends waiting through red with the remaining signal estimate", () => {
    expect(
      adviseCrossing({ direction: "nt", state: "red", remainingSeconds: 12.2 }, 20),
    ).toEqual({
      action: "wait",
      message: "약 13초 후 신호 변경 예상, 대기하세요.",
      waitSeconds: 13,
    });
  });

  it("handles missing signal data", () => {
    expect(adviseCrossing(null)).toEqual({
      action: "unknown",
      message: "보행 신호 정보를 확인할 수 없습니다.",
    });
  });

  it("uses an imminent-change message when local countdown reaches zero", () => {
    expect(
      adviseCrossing({ direction: "nt", state: "red", remainingSeconds: 0 }, 20),
    ).toEqual({
      action: "wait",
      message: "곧 신호가 변경됩니다",
      waitSeconds: 0,
    });
  });
});
