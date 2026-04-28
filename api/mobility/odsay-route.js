const ODSAY_ROUTE_URL =
  process.env.ODSAY_API_BASE_URL || "https://api.odsay.com/v1/api/searchPubTransPathT";

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
    body =
      typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body;
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

    return response.status(200).json(payload);
  } catch (error) {
    return response.status(500).json({
      code: "ODSAY_REQUEST_ERROR",
      error: error instanceof Error ? error.message : "ODsay request failed",
    });
  }
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
