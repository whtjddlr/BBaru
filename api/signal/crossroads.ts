import {
  createSignalUpstreamUrl,
  ensureHttpMethod,
  fetchUpstreamJson,
  getRequiredEnv,
  sendJson,
  sendProxyError,
  validateSignalQuery,
  type ApiRequest,
  type ApiResponse,
} from "../../src/server/proxy";

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!ensureHttpMethod(request, response, "GET")) {
    return;
  }

  try {
    const query = validateSignalQuery(request.query);
    const serviceKey = getRequiredEnv("DATA_GO_KR_KEY");
    const url = createSignalUpstreamUrl("crsrd_map_info", query, serviceKey);
    const data = await fetchUpstreamJson(url);

    sendJson(response, 200, data, {
      "Cache-Control": "s-maxage=86400",
    });
  } catch (error) {
    sendProxyError(response, error);
  }
}
