import type { GeoPoint } from "./eta";

const TMAP_POI_URL = "https://apis.openapi.sk.com/tmap/pois";
const TMAP_TRANSIT_URL = "https://apis.openapi.sk.com/transit/routes";
const DEFAULT_TIMEOUT_MS = 8000;
const SDK_POLL_INTERVAL_MS = 100;

let tmapSdkPromise: Promise<void> | null = null;

export interface TmapPoi {
  name: string;
  point: GeoPoint;
}

export interface TmapPoiResponse {
  searchPoiInfo?: {
    pois?: {
      poi?: Array<{
        name?: string;
        frontLat?: string;
        frontLon?: string;
      }>;
    };
  };
}

export type TmapLegMode = "WALK" | "SUBWAY" | "BUS";

export interface TmapStation {
  index?: number;
  stationName?: string;
  lon?: string;
  lat?: string;
}

export interface TmapWalkStep {
  description?: string;
  linestring?: string;
}

export interface TmapLeg {
  mode: TmapLegMode;
  sectionTime: number;
  distance?: number;
  route?: string;
  routeColor?: string;
  start?: { name?: string; lon?: number; lat?: number };
  end?: { name?: string; lon?: number; lat?: number };
  passStopList?: {
    stations?: TmapStation[];
  };
  passShape?: {
    linestring?: string;
  };
  steps?: TmapWalkStep[];
}

export interface TmapItinerary {
  totalTime: number;
  transferCount?: number;
  fare?: {
    regular?: {
      totalFare?: number;
    };
  };
  legs: TmapLeg[];
}

export interface TmapTransitResponse {
  metaData?: {
    plan?: {
      itineraries?: TmapItinerary[];
    };
  };
}

declare global {
  interface Window {
    Tmapv3?: any;
  }
}

export function getTmapAppKey(): string {
  const key = import.meta.env.VITE_TMAP_APP_KEY?.trim();

  if (!key || key.includes("%VITE_TMAP_APP_KEY%")) {
    throw new Error("VITE_TMAP_APP_KEY가 설정되어 있지 않습니다.");
  }

  return key;
}

export async function searchPois(query: string, count = 5): Promise<TmapPoi[]> {
  const keyword = query.trim();

  if (!keyword) {
    return [];
  }

  const appKey = getTmapAppKey();
  const url = new URL(TMAP_POI_URL);
  url.searchParams.set("version", "1");
  url.searchParams.set("searchKeyword", keyword);
  url.searchParams.set("count", String(count));

  const data = await fetchJson<TmapPoiResponse>(url.toString(), {
    method: "GET",
    headers: {
      appKey,
    },
  });

  return (data.searchPoiInfo?.pois?.poi ?? [])
    .map((poi) => ({
      name: poi.name ?? "",
      point: {
        lat: Number(poi.frontLat),
        lng: Number(poi.frontLon),
      },
    }))
    .filter((poi) => poi.name && Number.isFinite(poi.point.lat) && Number.isFinite(poi.point.lng));
}

export async function fetchTransitRoutes(
  start: GeoPoint,
  end: GeoPoint,
  count = 3,
): Promise<TmapTransitResponse> {
  const appKey = getTmapAppKey();

  return fetchJson<TmapTransitResponse>(TMAP_TRANSIT_URL, {
    method: "POST",
    headers: {
      appKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startX: start.lng,
      startY: start.lat,
      endX: end.lng,
      endY: end.lat,
      count,
    }),
  });
}

export async function loadTmapSdk(): Promise<void> {
  getTmapAppKey();

  if (typeof window === "undefined") {
    throw new Error("브라우저 환경에서만 Tmap 지도를 로드할 수 있습니다.");
  }

  if (window.Tmapv3) {
    return;
  }

  if (tmapSdkPromise) {
    return tmapSdkPromise;
  }

  tmapSdkPromise = waitForTmapSdk().catch((error) => {
    tmapSdkPromise = null;
    throw error;
  });

  return tmapSdkPromise;
}

function waitForTmapSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const pollTimer = window.setInterval(() => {
      if (window.Tmapv3) {
        window.clearInterval(pollTimer);
        resolve();
        return;
      }

      if (Date.now() - startedAt >= DEFAULT_TIMEOUT_MS) {
        window.clearInterval(pollTimer);
        reject(new Error("Tmap SDK 로드 시간이 초과되었습니다."));
      }
    }, SDK_POLL_INTERVAL_MS);
  });
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Tmap API 오류: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error("Tmap API 요청 시간이 초과되었습니다.");
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
