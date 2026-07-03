export const TMAP_POI_UPSTREAM_URL = "https://apis.openapi.sk.com/tmap/pois";
export const TMAP_TRANSIT_UPSTREAM_URL = "https://apis.openapi.sk.com/transit/routes";
export const DATA_GO_KR_UPSTREAM_BASE_URL = "https://apis.data.go.kr/B551982/rti";
export const DEFAULT_PROXY_TIMEOUT_MS = 8000;
export const DEFAULT_SIGNAL_STDG_CD = "1100000000";

export type QueryValue = string | string[] | undefined;

export interface ApiRequest {
  method?: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
}

export interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(statusCode: number): ApiResponse;
  json(body: unknown): void;
  end(body?: unknown): void;
}

export interface PoiQuery {
  q: string;
  count: number;
}

export interface TransitRouteBody {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  count: number;
}

export interface SignalQuery {
  pageNo: string;
  numOfRows: string;
  stdgCd: string;
}

export class ProxyHttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ProxyHttpError";
    this.statusCode = statusCode;
  }
}

export function ensureHttpMethod(request: ApiRequest, response: ApiResponse, method: string): boolean {
  if (request.method?.toUpperCase() === method) {
    return true;
  }

  response.setHeader("Allow", method);
  sendJson(response, 405, { error: "허용되지 않은 요청 메서드입니다." });

  return false;
}

export function validatePoiQuery(query: Record<string, QueryValue> = {}): PoiQuery {
  const q = getRequiredQueryString(query, "q", 80);
  const count = parseOptionalInteger(getSingleQueryValue(query.count), "count", 5, 1, 20);

  return { q, count };
}

export function validateTransitBody(body: unknown): TransitRouteBody {
  const payload = parseBodyObject(body);
  const startX = parseCoordinate(payload.startX, "startX", -180, 180);
  const startY = parseCoordinate(payload.startY, "startY", -90, 90);
  const endX = parseCoordinate(payload.endX, "endX", -180, 180);
  const endY = parseCoordinate(payload.endY, "endY", -90, 90);
  const count = parseOptionalInteger(payload.count, "count", 3, 1, 5);

  return { startX, startY, endX, endY, count };
}

export function validateSignalQuery(query: Record<string, QueryValue> = {}): SignalQuery {
  const pageNo = String(parseOptionalInteger(getSingleQueryValue(query.pageNo), "pageNo", 1, 1, 1000));
  const numOfRows = String(parseOptionalInteger(getSingleQueryValue(query.numOfRows), "numOfRows", 1000, 1, 3000));
  const stdgCd = getSingleQueryValue(query.stdgCd)?.trim() || DEFAULT_SIGNAL_STDG_CD;

  if (!/^\d{10}$/.test(stdgCd)) {
    throw new ProxyHttpError(400, "stdgCd는 10자리 숫자여야 합니다.");
  }

  return { pageNo, numOfRows, stdgCd };
}

export function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new ProxyHttpError(500, `${name} 환경변수가 설정되어 있지 않습니다.`);
  }

  return value;
}

export function createSignalUpstreamUrl(
  endpoint: "crsrd_map_info" | "tl_drct_info",
  query: SignalQuery,
  serviceKey: string,
): string {
  const params = new URLSearchParams({
    type: "json",
    stdgCd: query.stdgCd,
    pageNo: query.pageNo,
    numOfRows: query.numOfRows,
  });

  return `${DATA_GO_KR_UPSTREAM_BASE_URL}/${endpoint}?serviceKey=${encodeServiceKey(serviceKey)}&${params.toString()}`;
}

export async function fetchUpstreamJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_PROXY_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ProxyHttpError(502, `업스트림 API 오류: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new ProxyHttpError(504, "업스트림 API 요청 시간이 초과되었습니다.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function sendJson(
  response: ApiResponse,
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  Object.entries(headers).forEach(([key, value]) => {
    response.setHeader(key, value);
  });

  response.status(statusCode).json(body);
}

export function sendProxyError(response: ApiResponse, error: unknown) {
  const statusCode = error instanceof ProxyHttpError ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : "프록시 처리 중 오류가 발생했습니다.";

  sendJson(response, statusCode, { error: message });
}

function getRequiredQueryString(query: Record<string, QueryValue>, name: string, maxLength: number): string {
  const value = getSingleQueryValue(query[name])?.trim() ?? "";

  if (!value) {
    throw new ProxyHttpError(400, `${name} 파라미터가 필요합니다.`);
  }

  if (value.length > maxLength) {
    throw new ProxyHttpError(400, `${name} 파라미터가 너무 깁니다.`);
  }

  return value;
}

function getSingleQueryValue(value: QueryValue): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function parseOptionalInteger(
  value: unknown,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new ProxyHttpError(400, `${name} 값이 허용 범위를 벗어났습니다.`);
  }

  return parsed;
}

function parseCoordinate(value: unknown, name: string, min: number, max: number): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new ProxyHttpError(400, `${name} 좌표가 올바르지 않습니다.`);
  }

  return parsed;
}

function parseBodyObject(body: unknown): Record<string, unknown> {
  if (body instanceof Uint8Array) {
    return parseBodyObject(new TextDecoder().decode(body));
  }

  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as unknown;

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      throw new ProxyHttpError(400, "요청 본문 JSON을 파싱할 수 없습니다.");
    }
  }

  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }

  throw new ProxyHttpError(400, "요청 본문이 필요합니다.");
}

function encodeServiceKey(serviceKey: string): string {
  const trimmed = serviceKey.trim();

  return /%[0-9A-Fa-f]{2}/.test(trimmed) ? trimmed : encodeURIComponent(trimmed);
}
