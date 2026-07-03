import type { GeoPoint } from "./eta";

const DATA_GO_KR_BASE_URL = "https://apis.data.go.kr/B551982/rti";
const CROSSROADS_CACHE_KEY = "bbaru:crossroads:v1";
const CROSSROADS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 8000;
const SEOUL_STDG_CD = "1100000000";
const DIRECTION_PREFIXES = ["nt", "et", "st", "wt", "ne", "se", "sw", "nw"] as const;

export interface Crossroad {
  id: string;
  name: string;
  coord: GeoPoint;
}

export interface NearestCrossroad extends Crossroad {
  distanceMeters: number;
}

export type PedestrianSignalState = "green" | "red" | "unknown";

export interface PedestrianSignal {
  direction: string;
  state: PedestrianSignalState;
  remainingSeconds: number | null;
}

export interface CrossingAdvice {
  action: "go" | "wait" | "unknown";
  message: string;
  waitSeconds?: number;
  nextGreenInSeconds?: number;
}

export interface SignalRealtimeItem {
  crsrdId?: string;
  [key: string]: unknown;
}

export interface RouteSignalCrossroad {
  crossroad: NearestCrossroad;
  signals: PedestrianSignal[];
}

interface CrossroadApiItem {
  crsrdId?: string;
  crsrdNm?: string;
  mapCtptIntLat?: string;
  mapCtptIntLot?: string;
}

interface DataGoKrResponse<TItem> {
  header?: {
    resultCode?: string;
    resultMsg?: string;
  };
  body?: {
    items?: {
      item?: TItem[] | TItem;
    };
  };
}

interface CrossroadsCache {
  cachedAt: number;
  crossroads: Crossroad[];
}

export async function fetchCrossroads(): Promise<Crossroad[]> {
  const cached = readCrossroadsCache();

  if (cached) {
    return cached;
  }

  try {
    const appKey = getDataGoKrKey();
    const allCrossroads: Crossroad[] = [];
    const pageSize = 1000;

    for (let pageNo = 1; pageNo <= 3; pageNo += 1) {
      const url = createSignalUrl("/crsrd_map_info", appKey, {
        pageNo: String(pageNo),
        numOfRows: String(pageSize),
      });
      const data = await fetchJson<DataGoKrResponse<CrossroadApiItem>>(url);
      const items = getResponseItems(data);

      allCrossroads.push(...items.map(parseCrossroad).filter((crossroad): crossroad is Crossroad => Boolean(crossroad)));

      if (items.length < pageSize) {
        break;
      }
    }

    writeCrossroadsCache(allCrossroads);

    return allCrossroads;
  } catch {
    return [];
  }
}

export async function fetchRealtimeSignals(): Promise<Map<string, SignalRealtimeItem>> {
  try {
    const appKey = getDataGoKrKey();
    const url = createSignalUrl("/tl_drct_info", appKey, {
      pageNo: "1",
      numOfRows: "1000",
    });
    const data = await fetchJson<DataGoKrResponse<SignalRealtimeItem>>(url);
    const items = getResponseItems(data);

    return items.reduce((index, item) => {
      const id = String(item.crsrdId ?? "").trim();

      if (id) {
        index.set(id, item);
      }

      return index;
    }, new Map<string, SignalRealtimeItem>());
  } catch {
    return new Map();
  }
}

export function parsePedestrianSignals(item: SignalRealtimeItem | null | undefined): PedestrianSignal[] {
  if (!item) {
    return [];
  }

  return DIRECTION_PREFIXES.flatMap((direction) => {
    const remainingValue = item[`${direction}PdsgRmndCs`];
    const stateValue = item[`${direction}PdsgSttsNm`];
    const hasState = String(stateValue ?? "").trim().length > 0;
    const remainingSeconds = parseRemainingSeconds(remainingValue);

    if (!hasState || remainingSeconds === "expired") {
      return [];
    }

    return [
      {
        direction,
        state: parseSignalState(stateValue),
        remainingSeconds,
      },
    ];
  });
}

export function findNearestCrossroad(
  coord: GeoPoint,
  crossroads: Crossroad[],
  maxDistanceMeters = 150,
): NearestCrossroad | null {
  let nearest: NearestCrossroad | null = null;

  crossroads.forEach((crossroad) => {
    const distanceMeters = getDistanceMeters(coord, crossroad.coord);

    if (distanceMeters > maxDistanceMeters) {
      return;
    }

    if (!nearest || distanceMeters < nearest.distanceMeters) {
      nearest = {
        ...crossroad,
        distanceMeters,
      };
    }
  });

  return nearest;
}

export function findSignalCrossroadsForRoute(
  routePoints: GeoPoint[],
  crossroads: Crossroad[],
  realtimeSignals: Map<string, SignalRealtimeItem>,
  maxDistanceMeters = 150,
): RouteSignalCrossroad[] {
  if (routePoints.length === 0) {
    return [];
  }

  const results = crossroads.flatMap((crossroad) => {
    const signals = parsePedestrianSignals(realtimeSignals.get(crossroad.id));

    if (signals.length === 0) {
      return [];
    }

    const distanceMeters = routePoints.reduce(
      (nearestDistance, point) => Math.min(nearestDistance, getDistanceMeters(point, crossroad.coord)),
      Number.POSITIVE_INFINITY,
    );

    if (distanceMeters > maxDistanceMeters) {
      return [];
    }

    return [{
      crossroad: {
        ...crossroad,
        distanceMeters,
      },
      signals,
    }];
  });

  return results.sort(
    (first, second) => first.crossroad.distanceMeters - second.crossroad.distanceMeters,
  );
}

export function adviseCrossing(
  signal: PedestrianSignal | null | undefined,
  estimatedCrossingSeconds = 20,
): CrossingAdvice {
  if (!signal || signal.state === "unknown") {
    return {
      action: "unknown",
      message: "보행 신호 정보를 확인할 수 없습니다.",
    };
  }

  if (signal.remainingSeconds === null) {
    return {
      action: signal.state === "green" ? "go" : "wait",
      message: `보행 신호 ${signal.state === "green" ? "녹색" : "적색"} · 잔여시간 미제공`,
    };
  }

  const waitSeconds = Math.max(0, Math.ceil(signal.remainingSeconds));

  if (signal.remainingSeconds <= 0) {
    return {
      action: "wait",
      message: "곧 신호가 변경됩니다",
      waitSeconds: 0,
    };
  }

  if (signal.state === "green") {
    if (signal.remainingSeconds >= estimatedCrossingSeconds) {
      return {
        action: "go",
        message: `지금 건너세요 (잔여 ${waitSeconds}초).`,
        waitSeconds: 0,
      };
    }

    return {
      action: "wait",
      message: "이번 신호는 무리입니다. 다음 신호를 기다리세요.",
    };
  }

  return {
    action: "wait",
    message: `약 ${waitSeconds}초 후 보행 신호로 바뀝니다. 대기하세요.`,
    waitSeconds,
    nextGreenInSeconds: waitSeconds,
  };
}

export function getWalkingRoutePoints(segments: Array<{ type: string; geometry?: GeoPoint[] }>): GeoPoint[] {
  return segments
    .filter((segment) => segment.type === "walk" || segment.type === "final_walk")
    .flatMap((segment) => segment.geometry ?? []);
}

export function createWalkingRouteSignalKey(segments: Array<{ type: string; geometry?: GeoPoint[] }>): string {
  return getWalkingRoutePoints(segments)
    .map((point) => `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`)
    .join("|");
}

function parseCrossroad(item: CrossroadApiItem): Crossroad | null {
  const id = String(item.crsrdId ?? "").trim();
  const name = String(item.crsrdNm ?? "").trim();
  const lat = Number(item.mapCtptIntLat);
  const lng = Number(item.mapCtptIntLot);

  if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    id,
    name,
    coord: { lat, lng },
  };
}

function parseRemainingSeconds(value: unknown): number | null | "expired" {
  const rawValue = String(value ?? "").trim();

  if (!rawValue) {
    return null;
  }

  const centiseconds = Number(rawValue);

  if (!Number.isFinite(centiseconds)) {
    return null;
  }

  if (centiseconds <= 0) {
    return "expired";
  }

  return centiseconds / 100;
}

function parseSignalState(value: unknown): PedestrianSignalState {
  const state = String(value ?? "").trim();

  if (state === "protected-Movement-Allowed" || state === "permissive-Movement-Allowed") {
    return "green";
  }

  if (state === "stop-And-Remain") {
    return "red";
  }

  return "unknown";
}

function getDistanceMeters(from: GeoPoint, to: GeoPoint): number {
  const earthRadiusMeters = 6371000;
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function getDataGoKrKey(): string {
  const key = import.meta.env.VITE_DATA_GO_KR_KEY;

  if (!key) {
    throw new Error("VITE_DATA_GO_KR_KEY가 설정되어 있지 않습니다.");
  }

  return key;
}

function createSignalUrl(pathname: string, serviceKey: string, params: Record<string, string>): string {
  const url = new URL(`${DATA_GO_KR_BASE_URL}${pathname}`);
  url.searchParams.set("type", "json");
  url.searchParams.set("stdgCd", SEOUL_STDG_CD);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const keyParam = serviceKey.includes("%") ? serviceKey : encodeURIComponent(serviceKey);

  return `${url.origin}${url.pathname}?serviceKey=${keyParam}&${url.searchParams.toString()}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`공공데이터 API 오류: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as T;
    const resultCode = (data as DataGoKrResponse<unknown>).header?.resultCode;

    if (resultCode !== "K0") {
      throw new Error(`공공데이터 API 응답 오류: ${resultCode ?? "unknown"}`);
    }

    return data;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function getResponseItems<TItem>(response: DataGoKrResponse<TItem>): TItem[] {
  if (response.header?.resultCode !== "K0") {
    return [];
  }

  const rawItems = response.body?.items?.item;

  if (!rawItems) {
    return [];
  }

  return Array.isArray(rawItems) ? rawItems : [rawItems];
}

function readCrossroadsCache(): Crossroad[] | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(CROSSROADS_CACHE_KEY);

    if (!rawValue) {
      return null;
    }

    const cache = JSON.parse(rawValue) as CrossroadsCache;

    if (!Array.isArray(cache.crossroads) || Date.now() - cache.cachedAt > CROSSROADS_CACHE_TTL_MS) {
      return null;
    }

    return cache.crossroads;
  } catch {
    return null;
  }
}

function writeCrossroadsCache(crossroads: Crossroad[]) {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(
      CROSSROADS_CACHE_KEY,
      JSON.stringify({
        cachedAt: Date.now(),
        crossroads,
      } satisfies CrossroadsCache),
    );
  } catch {
    // Cache writes are optional; signal UI can still work without persistence.
  }
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}
