import {
  ensureHttpMethod,
  fetchUpstreamJson,
  getRequiredEnv,
  sendJson,
  sendProxyError,
  TMAP_POI_UPSTREAM_URL,
  validatePoiQuery,
  type ApiRequest,
  type ApiResponse,
} from "../_lib/proxy.js";

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!ensureHttpMethod(request, response, "GET")) {
    return;
  }

  try {
    const { q, count } = validatePoiQuery(request.query);
    const appKey = getRequiredEnv("TMAP_APP_KEY");
    const url = new URL(TMAP_POI_UPSTREAM_URL);

    url.searchParams.set("version", "1");
    url.searchParams.set("searchKeyword", q);
    url.searchParams.set("count", String(count));

    const data = await fetchUpstreamJson(url.toString(), {
      method: "GET",
      headers: { appKey },
    });

    sendJson(response, 200, data, {
      "Cache-Control": "s-maxage=3600",
    });
  } catch (error) {
    sendProxyError(response, error);
  }
}
