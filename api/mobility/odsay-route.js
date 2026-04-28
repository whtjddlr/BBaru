import { readJsonBody } from "../_utils/body.js";

const ODSAY_ROUTE_URL =
  process.env.ODSAY_API_BASE_URL || "https://api.odsay.com/v1/api/searchPubTransPathT";
const ODSAY_LANE_URL =
  process.env.ODSAY_LANE_BASE_URL || "https://api.odsay.com/v1/api/loadLane";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ODSAY_API_KEY;

  if (!apiKey) {
    return response.status(503).json({
      code: "ODSAY_NOT_CONFIGURED",
      error: "ODSAY_API_KEY is not configured",
    });
  }

  let body;

  try {
    body = await readJsonBody(request);
  } catch {
    return response.status(400).json({ error: "invalid JSON body" });
  }

  const coordinates = normalizeCoordinates(body);

  if (!coordinates) {
    return response.status(400).json({
      error: "origin and destination coordinates are required",
    });
  }

  try {
    const url = new URL(ODSAY_ROUTE_URL);
    url.searchParams.set("SX", String(coordinates.origin.lng));
    url.searchParams.set("SY", String(coordinates.origin.lat));
    url.searchParams.set("EX", String(coordinates.destination.lng));
    url.searchParams.set("EY", String(coordinates.destination.lat));
    url.searchParams.set("apiKey", apiKey);

    if (body.searchPathType) {
      url.searchParams.set("SearchPathType", String(body.searchPathType));
    }

    const odsayResponse = await fetch(url);
    const payload = await odsayResponse.json();
    const upstreamError = Array.isArray(payload?.error)
      ? payload.error[0]
      : payload?.error;

    if (!odsayResponse.ok || upstreamError) {
      return response.status(502).json({
        code: "ODSAY_UPSTREAM_ERROR",
        error: upstreamError || payload,
      });
    }

    const firstPath = payload?.result?.path?.[0];
    const routeGeometry = await buildRouteGeometry(firstPath, coordinates, apiKey);

    return response.status(200).json({
      ...payload,
      routeGeometry,
    });
  } catch (error) {
    return response.status(500).json({
      code: "ODSAY_REQUEST_ERROR",
      error: error instanceof Error ? error.message : "ODsay request failed",
    });
  }
}

async function buildRouteGeometry(path, coordinates, apiKey) {
  const laneGeometry = await fetchLaneGeometry(path?.info?.mapObj, apiKey);
  const fallbackGeometry = extractSubPathGeometry(path, coordinates);

  if (laneGeometry.points.length > 1) {
    return {
      source: "odsay-load-lane",
      points: mergeRoutePoints(coordinates.origin, laneGeometry.points, coordinates.destination),
      bounds: laneGeometry.bounds,
    };
  }

  return {
    source: "odsay-sub-path",
    points: fallbackGeometry,
  };
}

async function fetchLaneGeometry(mapObj, apiKey) {
  if (!mapObj || typeof mapObj !== "string") {
    return { points: [] };
  }

  try {
    const url = new URL(ODSAY_LANE_URL);
    url.searchParams.set("mapObject", normalizeMapObject(mapObj));
    url.searchParams.set("apiKey", apiKey);

    const laneResponse = await fetch(url);
    const payload = await laneResponse.json();
    const upstreamError = Array.isArray(payload?.error)
      ? payload.error[0]
      : payload?.error;

    if (!laneResponse.ok || upstreamError) {
      return { points: [] };
    }

    return {
      points: extractLanePoints(payload),
      bounds: payload?.result?.boundary,
    };
  } catch {
    return { points: [] };
  }
}

function normalizeMapObject(mapObj) {
  return mapObj.includes("@") ? mapObj : `0:0@${mapObj}`;
}

function extractLanePoints(payload) {
  const lanes = Array.isArray(payload?.result?.lane) ? payload.result.lane : [];
  const points = [];

  for (const lane of lanes) {
    const sections = Array.isArray(lane?.section) ? lane.section : [];

    for (const section of sections) {
      const graphPositions = Array.isArray(section?.graphPos) ? section.graphPos : [];

      for (const position of graphPositions) {
        pushCoordinate(points, {
          lat: Number(position?.y),
          lng: Number(position?.x),
        });
      }
    }
  }

  return dedupeCoordinates(points);
}

function extractSubPathGeometry(path, coordinates) {
  const points = [];

  pushCoordinate(points, coordinates.origin);

  const subPaths = Array.isArray(path?.subPath) ? path.subPath : [];

  for (const subPath of subPaths) {
    pushCoordinate(points, {
      lat: Number(subPath?.startY),
      lng: Number(subPath?.startX),
    });

    const stations = Array.isArray(subPath?.passStopList?.stations)
      ? subPath.passStopList.stations
      : [];

    for (const station of stations) {
      pushCoordinate(points, {
        lat: Number(station?.y),
        lng: Number(station?.x),
      });
    }

    pushCoordinate(points, {
      lat: Number(subPath?.endY),
      lng: Number(subPath?.endX),
    });
  }

  pushCoordinate(points, coordinates.destination);

  return dedupeCoordinates(points);
}

function mergeRoutePoints(origin, routePoints, destination) {
  const points = [origin, ...routePoints, destination];

  return dedupeCoordinates(points);
}

function pushCoordinate(points, point) {
  if (isCoordinate(point)) {
    points.push({
      lat: Number(point.lat),
      lng: Number(point.lng),
    });
  }
}

function dedupeCoordinates(points) {
  return points.filter((point, index) => {
    const previous = points[index - 1];

    if (!previous) {
      return true;
    }

    return (
      Math.abs(previous.lat - point.lat) > 0.00001 ||
      Math.abs(previous.lng - point.lng) > 0.00001
    );
  });
}

function normalizeCoordinates(body) {
  const origin = body?.origin;
  const destination = body?.destination;

  if (!isCoordinate(origin) || !isCoordinate(destination)) {
    return null;
  }

  return { origin, destination };
}

function isCoordinate(value) {
  return (
    typeof value?.lat === "number" &&
    typeof value?.lng === "number" &&
    value.lat >= 33 &&
    value.lat <= 39 &&
    value.lng >= 124 &&
    value.lng <= 132
  );
}
