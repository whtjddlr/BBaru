import { handleCors } from "../_utils/cors.js";
import { readJsonBody } from "../_utils/body.js";

const NAVER_GEOCODE_URL =
  process.env.NAVER_GEOCODE_BASE_URL ||
  "https://maps.apigw.ntruss.com/map-geocode/v2/geocode";
const NAVER_LOCAL_SEARCH_URL = "https://openapi.naver.com/v1/search/local.json";
const ROAD_NAME_PROBE_NUMBERS = [
  1, 5, 10, 20, 30, 40, 43, 50, 60, 70, 80, 90, 100, 120, 150, 200,
];

export default async function handler(request, response) {
  if (handleCors(request, response, ["POST", "OPTIONS"])) {
    return;
  }

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
  const limit = normalizeLimit(body?.limit);

  if (!query) {
    return response.status(400).json({ error: "query is required" });
  }

  const geocodingResult = await geocodeWithNaverMaps(query, limit);
  const localSearchResult = await geocodeWithNaverLocalSearch(query, limit);

  if (localSearchResult.ok) {
    return response.status(200).json({
      ...mergeGeocodeAndLocalResults(query, geocodingResult.payload, localSearchResult.payload),
      fallbackReason: geocodingResult.ok ? undefined : geocodingResult.error,
    });
  }

  if (geocodingResult.ok) {
    return response.status(200).json(geocodingResult.payload);
  }

  const roadNameResult = await geocodeRoadNameFallback(query, limit);

  if (roadNameResult.ok) {
    return response.status(200).json({
      ...roadNameResult.payload,
      fallbackReason: geocodingResult.error || localSearchResult.error,
    });
  }

  return response.status(502).json({
    code: "NAVER_GEOCODE_FAILED",
    error: localSearchResult.error || geocodingResult.error,
  });
}

async function geocodeWithNaverMaps(query, limit) {
  const keyId = getEnvValue("VITE_NAVER_MAP_KEY_ID") || getEnvValue("VITE_NAVER_MAP_CLIENT_ID");
  const key = getEnvValue("NAVER_MAP_CLIENT_SECRET");

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
  const addresses = Array.isArray(payload?.addresses) ? payload.addresses : [];
  const address = addresses[0];

  if (!naverResponse.ok || !address) {
    return {
      ok: false,
      error: payload?.error?.message || payload?.errorMessage || "Naver Maps geocoding returned no result",
    };
  }

  const candidates = addresses.slice(0, limit).map((candidate) => {
    const roadAddress = String(candidate.roadAddress || "").trim();
    const jibunAddress = String(candidate.jibunAddress || "").trim();
    const name = roadAddress || jibunAddress || query;

    return {
      lat: Number(candidate.y),
      lng: Number(candidate.x),
      name,
      address: roadAddress && jibunAddress ? jibunAddress : roadAddress || jibunAddress || "",
      roadAddress,
      jibunAddress,
      category: roadAddress ? "도로명 주소" : "지번 주소",
      source: "naver-maps-geocoding",
    };
  });

  return {
    ok: true,
    payload: {
      source: "naver-maps-geocoding",
      query,
      point: {
        lat: Number(address.y),
        lng: Number(address.x),
        name: address.roadAddress || address.jibunAddress || query,
        address: address.roadAddress || address.jibunAddress || "",
        roadAddress: address.roadAddress || "",
        jibunAddress: address.jibunAddress || "",
      },
      candidates,
    },
  };
}

async function geocodeRoadNameFallback(query, limit) {
  const roadName = normalizeRoadNameOnlyQuery(query);

  if (!roadName) {
    return { ok: false, error: "query is not a road name without building number" };
  }

  const probeLimit = Math.max(limit, 8);
  const results = await Promise.all(
    ROAD_NAME_PROBE_NUMBERS.map((buildingNumber) =>
      geocodeWithNaverMaps(`${roadName} ${buildingNumber}`, 1)
    )
  );
  const candidates = [];

  for (const result of results) {
    if (!result.ok) {
      continue;
    }

    const candidate = result.payload?.candidates?.[0] || result.payload?.point;

    if (!candidate || !Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) {
      continue;
    }

    const identity = candidate.roadAddress || candidate.address || candidate.name;
    const key = `${identity}:${candidate.lat.toFixed(6)}:${candidate.lng.toFixed(6)}`;

    if (candidates.some((item) => item.key === key)) {
      continue;
    }

    candidates.push({
      ...candidate,
      category: "도로명 건물번호 후보",
      source: "naver-maps-road-name-probe",
      key,
    });

    if (candidates.length >= probeLimit) {
      break;
    }
  }

  if (!candidates.length) {
    return { ok: false, error: "Naver Maps road name fallback returned no result" };
  }

  const payloadCandidates = candidates.map(({ key, ...candidate }) => candidate);

  return {
    ok: true,
    payload: {
      source: "naver-maps-road-name-probe",
      query,
      needsBuildingNumber: true,
      message: "건물번호를 붙이면 더 정확해요.",
      point: payloadCandidates[0],
      candidates: payloadCandidates,
    },
  };
}

async function geocodeWithNaverLocalSearch(query, limit) {
  const clientId = getEnvValue("NAVER_SEARCH_CLIENT_ID");
  const clientSecret = getEnvValue("NAVER_SEARCH_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    return { ok: false, error: "Naver Local Search credentials are missing" };
  }

  const url = new URL(NAVER_LOCAL_SEARCH_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(limit));

  const naverResponse = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
  });
  const payload = await naverResponse.json();
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const item = items[0];

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
      candidates: items.map((candidate) => ({
        lat: Number(candidate.mapy) / 10000000,
        lng: Number(candidate.mapx) / 10000000,
        name: stripHtml(candidate.title) || query,
        address: candidate.roadAddress || candidate.address || "",
        roadAddress: candidate.roadAddress || "",
        jibunAddress: candidate.address || "",
        category: candidate.category || "",
        source: "naver-local-search",
      })),
    },
  };
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, "");
}

function mergeGeocodeAndLocalResults(query, geocodePayload, localPayload) {
  const geocodeCandidates = Array.isArray(geocodePayload?.candidates)
    ? geocodePayload.candidates
    : [];
  const localCandidates = Array.isArray(localPayload?.candidates)
    ? localPayload.candidates
    : [];
  const isAddressQuery = isAddressLikeQuery(query);
  const candidates = isAddressQuery
    ? [...geocodeCandidates, ...localCandidates]
    : [...localCandidates, ...geocodeCandidates];
  const uniqueCandidates = [];

  for (const candidate of candidates) {
    if (!Number.isFinite(candidate?.lat) || !Number.isFinite(candidate?.lng)) {
      continue;
    }

    const identity = candidate.roadAddress || candidate.address || candidate.name;
    const key = `${identity}:${candidate.lat.toFixed(6)}:${candidate.lng.toFixed(6)}`;

    if (uniqueCandidates.some((item) => item.key === key)) {
      continue;
    }

    uniqueCandidates.push({ ...candidate, key });
  }

  return {
    source:
      (isAddressQuery ? geocodePayload?.source : localPayload?.source) ||
      localPayload?.source ||
      geocodePayload?.source ||
      "naver",
    query,
    point:
      (isAddressQuery ? geocodePayload?.point : localPayload?.point) ||
      localPayload?.point ||
      geocodePayload?.point,
    candidates: uniqueCandidates.map(({ key, ...candidate }) => candidate),
  };
}

function isAddressLikeQuery(query) {
  const normalized = String(query || "").trim();

  if (!normalized) {
    return false;
  }

  return (
    /\d/.test(normalized) ||
    /(로|길|대로|번길|가|동|읍|면|리)\s*\d/.test(normalized) ||
    /\b\d{1,5}-\d{1,5}\b/.test(normalized)
  );
}

function normalizeRoadNameOnlyQuery(query) {
  const normalized = String(query || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/([가-힣])\s+(\d+(?:번)?길)/g, "$1$2");

  if (!normalized) {
    return "";
  }

  if (!/(?:대로|번길|로|길)$/.test(normalized)) {
    return "";
  }

  if (/(?:대로|번길|로|길)\s*\d/.test(normalized)) {
    return "";
  }

  return normalized;
}

function normalizeLimit(value) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return 5;
  }

  return Math.min(10, Math.max(1, Math.round(numberValue)));
}

function getEnvValue(name) {
  const value = process.env[name];

  return typeof value === "string" && value.trim() ? value.trim() : "";
}
