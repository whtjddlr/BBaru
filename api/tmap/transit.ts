import {
  ensureHttpMethod,
  fetchUpstreamJson,
  getRequiredEnv,
  sendJson,
  sendProxyError,
  TMAP_TRANSIT_UPSTREAM_URL,
  validateTransitBody,
  type ApiRequest,
  type ApiResponse,
} from "../../src/server/proxy";

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!ensureHttpMethod(request, response, "POST")) {
    return;
  }

  try {
    const payload = validateTransitBody(request.body);
    const appKey = getRequiredEnv("TMAP_APP_KEY");
    const data = await fetchUpstreamJson(TMAP_TRANSIT_UPSTREAM_URL, {
      method: "POST",
      headers: {
        appKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    sendJson(response, 200, data, {
      "Cache-Control": "no-store",
    });
  } catch (error) {
    sendProxyError(response, error);
  }
}
