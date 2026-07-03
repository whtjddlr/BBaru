import {
  AlternativeRouteInput,
  createEtaPlanFromSegments,
  EtaMode,
  EtaPlan,
  EtaSearchRequest,
  GeoPoint,
  RouteSegment,
} from "./eta";
import type { TmapItinerary, TmapLeg, TmapTransitResponse } from "./tmap";

export interface MappedItinerary {
  segments: RouteSegment[];
  totalDuration: number;
  crossingCount: number;
  transferCount?: number;
  fare?: number;
  summaryLabel: string;
  summaryDetail: string;
}

export function mapTransitResponseToPlan(
  request: EtaSearchRequest,
  response: TmapTransitResponse,
  mode: EtaMode,
  now: Date,
): EtaPlan {
  const itineraries = getTransitItineraries(response);

  if (itineraries.length === 0) {
    throw new Error("Tmap 대중교통 경로 응답에 itineraries가 없습니다.");
  }

  return createPlanFromItineraries(request, itineraries, mode, now);
}

export function createPlanFromItineraries(
  request: EtaSearchRequest,
  itineraries: TmapItinerary[],
  mode: EtaMode,
  now: Date,
): EtaPlan {
  const [mainItinerary, ...alternativeItineraries] = itineraries;
  const mappedMain = mapItinerary(mainItinerary);
  const alternatives = alternativeItineraries.map((itinerary, index) =>
    mapAlternativeItinerary(itinerary, index),
  );

  return createEtaPlanFromSegments({
    request,
    mode,
    now,
    segments: mappedMain.segments,
    totalDuration: mappedMain.totalDuration,
    alternatives,
    crossingCount: mappedMain.crossingCount,
    source: "tmap",
    transitMeta: {
      transferCount: mappedMain.transferCount,
      fare: mappedMain.fare,
    },
  });
}

export function getTransitItineraries(response: TmapTransitResponse): TmapItinerary[] {
  return response.metaData?.plan?.itineraries ?? [];
}

export function mapItinerary(itinerary: TmapItinerary): MappedItinerary {
  const segments = itinerary.legs.map((leg, index) =>
    mapLegToSegment(leg, index, itinerary.legs.length),
  );
  const crossingCount = itinerary.legs.reduce((sum, leg) => sum + countCrossings(leg), 0);
  return {
    segments,
    totalDuration: itinerary.totalTime,
    crossingCount,
    transferCount: itinerary.transferCount,
    fare: itinerary.fare?.regular?.totalFare,
    summaryLabel: createSummaryLabel(itinerary),
    summaryDetail: createSummaryDetail(itinerary),
  };
}

export function mapAlternativeItinerary(
  itinerary: TmapItinerary,
  index: number,
): AlternativeRouteInput {
  const mapped = mapItinerary(itinerary);

  return {
    id: `tmap-${index + 1}`,
    label: mapped.summaryLabel,
    detail: mapped.summaryDetail,
    duration: mapped.totalDuration,
    transferCount: mapped.transferCount,
    fare: mapped.fare,
    crossingCount: mapped.crossingCount,
  };
}

export function parseLinestring(linestring?: string): GeoPoint[] {
  if (!linestring) {
    return [];
  }

  return linestring
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [lng, lat] = pair.split(",").map(Number);
      return { lat, lng };
    })
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function mapLegToSegment(leg: TmapLeg, index: number, legCount: number): RouteSegment {
  if (leg.mode === "WALK") {
    const isFinalWalk = index === legCount - 1;

    return {
      id: `leg-${index}`,
      type: isFinalWalk ? "final_walk" : "walk",
      label: isFinalWalk ? "하차 후 도보" : "도보 이동",
      duration: leg.sectionTime,
      distance: leg.distance,
      geometry: collectWalkGeometry(leg),
      crossings: collectWalkCrossings(leg),
      detail: createWalkDetail(leg),
    };
  }

  if (leg.mode === "SUBWAY") {
    const stationCount = Math.max(0, (leg.passStopList?.stations?.length ?? 1) - 1);
    const line = extractSubwayLine(leg.route);

    return {
      id: `leg-${index}`,
      type: "subway",
      label: `${line} 탑승`,
      duration: leg.sectionTime,
      distance: leg.distance,
      line,
      route: leg.route,
      routeColor: normalizeRouteColor(leg.routeColor),
      stationCount,
      geometry: parseLinestring(leg.passShape?.linestring),
      detail: createRideDetail(leg, stationCount),
    };
  }

  return {
    id: `leg-${index}`,
    type: "bus",
    label: `${extractBusRoute(leg.route)} 버스`,
    duration: leg.sectionTime,
    distance: leg.distance,
    route: extractBusRoute(leg.route),
    routeColor: normalizeRouteColor(leg.routeColor),
    stationCount: Math.max(0, (leg.passStopList?.stations?.length ?? 1) - 1),
    geometry: parseLinestring(leg.passShape?.linestring),
    detail: createRideDetail(leg, Math.max(0, (leg.passStopList?.stations?.length ?? 1) - 1)),
  };
}

function countCrossings(leg: TmapLeg): number {
  return (leg.steps ?? []).filter((step) => step.description?.includes("횡단보도")).length;
}

function collectWalkGeometry(leg: TmapLeg): GeoPoint[] {
  return (leg.steps ?? []).flatMap((step) => parseLinestring(step.linestring));
}

function collectWalkCrossings(leg: TmapLeg): RouteSegment["crossings"] {
  const crossings = (leg.steps ?? [])
    .filter((step) => step.description?.includes("횡단보도"))
    .map((step) => {
      const points = parseLinestring(step.linestring);
      const position = points[Math.floor(points.length / 2)] ?? points[0];

      if (!position) {
        return null;
      }

      return {
        description: step.description ?? "횡단보도",
        position,
      };
    })
    .filter((crossing): crossing is NonNullable<RouteSegment["crossings"]>[number] => Boolean(crossing));

  return crossings.length > 0 ? crossings : undefined;
}

function createWalkDetail(leg: TmapLeg): string {
  const firstDescription = leg.steps?.find((step) => step.description)?.description;

  return firstDescription ?? `${leg.distance ?? 0}m 도보`;
}

function createRideDetail(leg: TmapLeg, stationCount: number): string {
  const startName = leg.start?.name ?? "승차";
  const endName = leg.end?.name ?? "하차";

  return `${startName} → ${endName} (${stationCount}개 정류장)`;
}

function extractSubwayLine(route?: string): string {
  if (!route) {
    return "지하철";
  }

  const match = route.match(/(\d+호선|[가-힣A-Za-z]+선)$/);

  return match?.[1] ?? route.replace(/^수도권/, "");
}

function extractBusRoute(route?: string): string {
  if (!route) {
    return "버스";
  }

  return route.includes(":") ? route.split(":").pop() ?? route : route;
}

function normalizeRouteColor(routeColor?: string): string | undefined {
  if (!routeColor) {
    return undefined;
  }

  return routeColor.startsWith("#") ? routeColor : `#${routeColor}`;
}

function createSummaryLabel(itinerary: TmapItinerary): string {
  const transitLeg = itinerary.legs.find((leg) => leg.mode === "SUBWAY" || leg.mode === "BUS");

  if (!transitLeg) {
    return "도보 전체";
  }

  if (transitLeg.mode === "SUBWAY") {
    return `${extractSubwayLine(transitLeg.route)} 중심`;
  }

  return `${extractBusRoute(transitLeg.route)} 버스`;
}

function createSummaryDetail(itinerary: TmapItinerary): string {
  const fare = itinerary.fare?.regular?.totalFare;
  const transfer = itinerary.transferCount ?? 0;
  const fareText = typeof fare === "number" ? ` · ${fare.toLocaleString("ko-KR")}원` : "";

  return `환승 ${transfer}회${fareText}`;
}
