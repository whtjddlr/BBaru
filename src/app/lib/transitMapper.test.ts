import { describe, expect, it } from "vitest";
import transitResponse from "./__fixtures__/transit-response.json";
import type { EtaSearchRequest } from "./eta.ts";
import {
  getTransitItineraries,
  mapAlternativeItinerary,
  mapItinerary,
  mapTransitResponseToPlan,
  parseLinestring,
} from "./transitMapper.ts";
import type { TmapTransitResponse } from "./tmap.ts";

const response = transitResponse as TmapTransitResponse;
const request: EtaSearchRequest = {
  origin: "강남역",
  destination: "선릉역",
  targetTime: "10:00",
  originPoint: { lat: 37.497952, lng: 127.027619 },
  destinationPoint: { lat: 37.504503, lng: 127.048957 },
};

describe("transitMapper", () => {
  it("extracts itineraries from the Tmap fixture", () => {
    const itineraries = getTransitItineraries(response);

    expect(itineraries.length).toBe(3);
  });

  it("maps the main subway itinerary into route segments", () => {
    const [itinerary] = getTransitItineraries(response);
    const mapped = mapItinerary(itinerary);
    const durationSum = mapped.segments.reduce((sum, segment) => sum + segment.duration, 0);

    expect(mapped.segments.map((segment) => segment.type)).toEqual(["walk", "subway", "final_walk"]);
    expect(mapped.totalDuration).toBe(itinerary.totalTime);
    expect(durationSum).toBe(itinerary.totalTime);
    expect(mapped.crossingCount).toBe(2);
    expect(mapped.fare).toBe(1550);
    expect(mapped.transferCount).toBe(0);
    expect(mapped.segments[1].line).toBe("2호선");
    expect(mapped.segments[1].routeColor).toBe("#009D3E");
    expect(mapped.segments[1].stationCount).toBe(2);
  });

  it("maps bus itineraries as alternatives with fare and crossing metadata", () => {
    const [, firstBus, secondBus] = getTransitItineraries(response);
    const firstAlternative = mapAlternativeItinerary(firstBus, 0);
    const secondAlternative = mapAlternativeItinerary(secondBus, 1);

    expect(firstAlternative.id).toBe("tmap-1");
    expect(firstAlternative.label).toBe("N61 버스");
    expect(firstAlternative.duration).toBe(584);
    expect(firstAlternative.fare).toBe(1500);
    expect(firstAlternative.transferCount).toBe(0);
    expect(firstAlternative.crossingCount).toBe(2);
    expect(secondAlternative.id).toBe("tmap-2");
    expect(secondAlternative.label).toBe("8146 버스");
    expect(secondAlternative.duration).toBe(589);
  });

  it("creates a Tmap ETA plan with the first itinerary and two alternatives", () => {
    const plan = mapTransitResponseToPlan(request, response, "balanced", new Date("2026-01-01T09:00:00"));
    const segmentSum = plan.segments.reduce((sum, segment) => sum + segment.duration, 0);

    expect(plan.source).toBe("tmap");
    expect(plan.totalDuration).toBe(452);
    expect(segmentSum).toBe(452);
    expect(plan.alternatives.length).toBe(2);
    expect(plan.crossingCount).toBe(2);
    expect(plan.transitMeta?.fare).toBe(1550);
    expect(plan.alternatives[0].label).toBe("N61 버스");
    expect(plan.alternatives[1].label).toBe("8146 버스");
  });

  it("parses Tmap linestring coordinates as lng,lat pairs", () => {
    expect(parseLinestring("127.027619,37.497952 127.028000,37.498000")).toEqual([
      { lat: 37.497952, lng: 127.027619 },
      { lat: 37.498, lng: 127.028 },
    ]);
  });
});
