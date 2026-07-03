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

  it("keeps state-only pedestrian signals and excludes only non-positive remaining values", () => {
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
      { direction: "et", state: "green", remainingSeconds: null },
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

  it("keeps route-near crossroads that have state-only pedestrian signal data", () => {
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

    expect(signalCrossroads.length).toBe(1);
    expect(signalCrossroads[0].signals).toEqual([
      { direction: "st", state: "green", remainingSeconds: null },
    ]);
  });

  it("excludes route-near crossroads when no pedestrian direction has a valid state", () => {
    const realtimeIndex = new Map<string, SignalRealtimeItem>([
      [
        "1",
        {
          crsrdId: "1",
          etPdsgRmndCs: "0",
          etPdsgSttsNm: "stop-And-Remain",
          stPdsgRmndCs: "",
          stPdsgSttsNm: "",
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
      message: "지금 건너세요 (잔여 25초).",
      waitSeconds: 0,
    });
  });

  it("recommends waiting when green time is too short", () => {
    expect(
      adviseCrossing({ direction: "nt", state: "green", remainingSeconds: 8 }, 20),
    ).toEqual({
      action: "wait",
      message: "이번 신호는 무리입니다. 다음 신호를 기다리세요.",
    });
  });

  it("recommends waiting through red with the remaining signal estimate", () => {
    expect(
      adviseCrossing({ direction: "nt", state: "red", remainingSeconds: 12.2 }, 20),
    ).toEqual({
      action: "wait",
      message: "약 13초 후 보행 신호로 바뀝니다. 대기하세요.",
      waitSeconds: 13,
      nextGreenInSeconds: 13,
    });
  });

  it("describes state-only pedestrian signals without countdown advice", () => {
    expect(
      adviseCrossing({ direction: "nt", state: "green", remainingSeconds: null }, 20),
    ).toEqual({
      action: "go",
      message: "보행 신호 녹색 · 잔여시간 미제공",
    });
    expect(
      adviseCrossing({ direction: "nt", state: "red", remainingSeconds: null }, 20),
    ).toEqual({
      action: "wait",
      message: "보행 신호 적색 · 잔여시간 미제공",
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
