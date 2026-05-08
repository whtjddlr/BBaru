import { handleCors } from "../_utils/cors.js";
import { readJsonBody } from "../_utils/body.js";

const ODSAY_ROUTE_URL =
  process.env.ODSAY_API_BASE_URL || "https://api.odsay.com/v1/api/searchPubTransPathT";
const ODSAY_LANE_URL =
  process.env.ODSAY_LANE_BASE_URL || "https://api.odsay.com/v1/api/loadLane";

export default async function handler(request, response) {
  if (handleCors(request, response, ["POST", "OPTIONS"])) {
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = getEnvValue("ODSAY_API_KEY");

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

    const odsayHeaders = buildOdsayRequestHeaders(request);
    const odsayResponse = await fetch(url, { headers: odsayHeaders });
    const payload = await odsayResponse.json();
    const upstreamError = Array.isArray(payload?.error)
      ? payload.error[0]
      : payload?.error;

    if (!odsayResponse.ok || upstreamError) {
      return response.status(200).json({
        code: "ODSAY_UPSTREAM_ERROR",
        upstreamStatus: odsayResponse.status,
        error: upstreamError || payload,
        routeGeometry: {
          source: "estimated-fallback",
          points: buildEstimatedGeometry(coordinates.origin, coordinates.destination),
        },
      });
    }

    const firstPath = payload?.result?.path?.[0];
    const routeGeometry = await buildRouteGeometry(
      firstPath,
      coordinates,
      apiKey,
      odsayHeaders
    );

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

function getEnvValue(name) {
  const value = process.env[name];

  return typeof value === "string" && value.trim() ? value.trim() : "";
}

async function buildRouteGeometry(path, coordinates, apiKey, headers) {
  const laneGeometry = await fetchLaneGeometry(path?.info?.mapObj, apiKey, headers);
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

async function fetchLaneGeometry(mapObj, apiKey, headers) {
  if (!mapObj || typeof mapObj !== "string") {
    return { points: [] };
  }

  try {
    const url = new URL(ODSAY_LANE_URL);
    url.searchParams.set("mapObject", normalizeMapObject(mapObj));
    url.searchParams.set("apiKey", apiKey);

    const laneResponse = await fetch(url, { headers });
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

function buildOdsayRequestHeaders(request) {
  const appOrigin = getRequestOrigin(request);

  if (!appOrigin) {
    return {};
  }

  return {
    Origin: appOrigin,
    Referer: `${appOrigin}/`,
  };
}

function getRequestOrigin(request) {
  const origin = getHeaderValue(request, "origin");

  if (origin) {
    return normalizeOrigin(origin);
  }

  const referer = getHeaderValue(request, "referer");

  if (referer) {
    return normalizeOrigin(referer);
  }

  const forwardedHost = getHeaderValue(request, "x-forwarded-host");
  const host = forwardedHost || getHeaderValue(request, "host");
  const forwardedProto =
    getHeaderValue(request, "x-forwarded-proto") || getDefaultProtocol(host);

  if (host) {
    return normalizeOrigin(`${forwardedProto}://${host}`);
  }

  if (process.env.VERCEL_URL) {
    return normalizeOrigin(`https://${process.env.VERCEL_URL}`);
  }

  return "";
}

function getDefaultProtocol(host) {
  return /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host) ? "http" : "https";
}

function getHeaderValue(request, name) {
  const value = request.headers?.[name];

  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return typeof value === "string" ? value : "";
}

function normalizeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, "");
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

function buildEstimatedGeometry(origin, destination) {
  const latDelta = destination.lat - origin.lat;
  const lngDelta = destination.lng - origin.lng;
  const bendScale = Math.max(Math.abs(latDelta), Math.abs(lngDelta), 0.004) * 0.18;
  const normalLat = -lngDelta >= 0 ? bendScale : -bendScale;
  const normalLng = latDelta >= 0 ? bendScale : -bendScale;

  return dedupeCoordinates([
    origin,
    {
      lat: origin.lat + latDelta * 0.22 + normalLat * 0.6,
      lng: origin.lng + lngDelta * 0.18 + normalLng * 0.6,
    },
    {
      lat: origin.lat + latDelta * 0.5 + normalLat,
      lng: origin.lng + lngDelta * 0.5 + normalLng,
    },
    {
      lat: origin.lat + latDelta * 0.78 + normalLat * 0.35,
      lng: origin.lng + lngDelta * 0.82 + normalLng * 0.35,
    },
    destination,
  ]);
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
