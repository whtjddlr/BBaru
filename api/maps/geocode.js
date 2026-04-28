import { readJsonBody } from "../_utils/body.js";

const NAVER_GEOCODE_URL =
  process.env.NAVER_GEOCODE_BASE_URL ||
  "https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode";
const NAVER_LOCAL_SEARCH_URL = "https://openapi.naver.com/v1/search/local.json";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  let body;

  try {
    body = await readJsonBody(request);
  } catch {
    return response.status(400).json({ error: "invalid JSON body" });
  }

  const query = String(body?.query || "").trim();

  if (!query) {
    return response.status(400).json({ error: "query is required" });
  }

  const geocodingResult = await geocodeWithNaverMaps(query);

  if (geocodingResult.ok) {
    return response.status(200).json(geocodingResult.payload);
  }

  const localSearchResult = await geocodeWithNaverLocalSearch(query);

  if (localSearchResult.ok) {
    return response.status(200).json({
      ...localSearchResult.payload,
      fallbackReason: geocodingResult.error,
    });
  }

  return response.status(502).json({
    code: "NAVER_GEOCODE_FAILED",
    error: localSearchResult.error || geocodingResult.error,
  });
}

async function geocodeWithNaverMaps(query) {
  const keyId = process.env.VITE_NAVER_MAP_KEY_ID || process.env.VITE_NAVER_MAP_CLIENT_ID;
  const key = process.env.NAVER_MAP_CLIENT_SECRET;

  if (!keyId || !key) {
    return { ok: false, error: "Naver Maps geocoding credentials are missing" };
  }

  const url = new URL(NAVER_GEOCODE_URL);
  url.searchParams.set("query", query);

  const naverResponse = await fetch(url, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": keyId,
      "X-NCP-APIGW-API-KEY": key,
    },
  });
  const payload = await naverResponse.json();
  const address = payload?.addresses?.[0];

  if (!naverResponse.ok || !address) {
    return {
      ok: false,
      error: payload?.error?.message || payload?.errorMessage || "Naver Maps geocoding returned no result",
    };
  }

  return {
    ok: true,
    payload: {
      source: "naver-maps-geocoding",
      query,
      point: {
        lat: Number(address.y),
        lng: Number(address.x),
        name: address.roadAddress || address.jibunAddress || query,
      },
    },
  };
}

async function geocodeWithNaverLocalSearch(query) {
  const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return { ok: false, error: "Naver Local Search credentials are missing" };
  }

  const url = new URL(NAVER_LOCAL_SEARCH_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("display", "1");

  const naverResponse = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
  });
  const payload = await naverResponse.json();
  const item = payload?.items?.[0];

  if (!naverResponse.ok || !item) {
    return {
      ok: false,
      error: payload?.errorMessage || "Naver Local Search returned no result",
    };
  }

  return {
    ok: true,
    payload: {
      source: "naver-local-search",
      query,
      point: {
        lat: Number(item.mapy) / 10000000,
        lng: Number(item.mapx) / 10000000,
        name: stripHtml(item.title) || query,
      },
    },
  };
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, "");
}
