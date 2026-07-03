import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createEtaPlan, EtaMode, EtaPlan, EtaSearchRequest, GeoPoint, normalizeRequest } from "../lib/eta";
import { fetchTransitRoutes, searchPois, TmapTransitResponse } from "../lib/tmap";
import { mapTransitResponseToPlan } from "../lib/transitMapper";

const ACTIVE_SEARCH_KEY = "bbaru:active-search";
const RECENT_ROUTES_KEY = "bbaru:recent-routes";
const MAX_RECENT_ROUTES = 5;

export interface RecentRoute extends EtaSearchRequest {
  updatedAt: string;
  totalDuration: number;
}

interface StoredSearch {
  request: EtaSearchRequest;
  mode: EtaMode;
}

export type RoutePlanState =
  | { status: "idle" }
  | { status: "loading"; request: EtaSearchRequest }
  | {
      status: "success";
      request: EtaSearchRequest;
      plan: EtaPlan;
      source: "tmap" | "mock";
      isFallback: boolean;
      error?: string;
      transitResponse?: TmapTransitResponse;
    }
  | { status: "error"; request: EtaSearchRequest; error: string };

interface RouteContextValue {
  searchRequest: EtaSearchRequest | null;
  selectedMode: EtaMode;
  recentRoutes: RecentRoute[];
  routePlanState: RoutePlanState;
  hasActiveSearch: boolean;
  setSelectedMode: (mode: EtaMode) => void;
  startSearch: (request: EtaSearchRequest) => EtaSearchRequest;
  retrySearch: () => void;
  clearSearch: () => void;
  refreshRecentRoutes: () => void;
}

const RouteContext = createContext<RouteContextValue | null>(null);

export function RouteProvider({ children }: { children: ReactNode }) {
  const initialSearch = useMemo(() => readActiveSearch(), []);
  const [searchRequest, setSearchRequest] = useState<EtaSearchRequest | null>(
    initialSearch?.request ?? null,
  );
  const [selectedMode, setSelectedModeState] = useState<EtaMode>(initialSearch?.mode ?? "balanced");
  const [recentRoutes, setRecentRoutes] = useState<RecentRoute[]>(() => readRecentRoutes());
  const [routePlanState, setRoutePlanState] = useState<RoutePlanState>({ status: "idle" });
  const routeRequestIdRef = useRef(0);

  const loadRoutePlan = useCallback(async (request: EtaSearchRequest) => {
    const requestId = routeRequestIdRef.current + 1;
    routeRequestIdRef.current = requestId;
    const normalizedRequest = normalizeRequest(request);

    setRoutePlanState({ status: "loading", request: normalizedRequest });

    try {
      const resolvedRequest = await resolveSearchRequest(normalizedRequest);
      const response = await fetchTransitRoutes(resolvedRequest.originPoint!, resolvedRequest.destinationPoint!, 3);
      const plan = mapTransitResponseToPlan(resolvedRequest, response, "balanced", new Date());

      if (routeRequestIdRef.current !== requestId) {
        return;
      }

      const nextRecentRoutes = upsertRecentRoute(readRecentRoutes(), {
        ...resolvedRequest,
        totalDuration: plan.totalDuration,
        updatedAt: new Date().toISOString(),
      });

      setSearchRequest(resolvedRequest);
      setRecentRoutes(nextRecentRoutes);
      setRoutePlanState({
        status: "success",
        request: resolvedRequest,
        plan,
        source: "tmap",
        isFallback: false,
        transitResponse: response,
      });
      writeRecentRoutes(nextRecentRoutes);
    } catch (error) {
      if (routeRequestIdRef.current !== requestId) {
        return;
      }

      try {
        const fallbackPlan = createEtaPlan(normalizedRequest, "balanced", new Date());
        const nextRecentRoutes = upsertRecentRoute(readRecentRoutes(), {
          ...normalizedRequest,
          totalDuration: fallbackPlan.totalDuration,
          updatedAt: new Date().toISOString(),
        });

        setRecentRoutes(nextRecentRoutes);
        setRoutePlanState({
          status: "success",
          request: normalizedRequest,
          plan: fallbackPlan,
          source: "mock",
          isFallback: true,
          error: getErrorMessage(error),
        });
        writeRecentRoutes(nextRecentRoutes);
      } catch (fallbackError) {
        setRoutePlanState({
          status: "error",
          request: normalizedRequest,
          error: getErrorMessage(fallbackError),
        });
      }
    }
  }, []);

  useEffect(() => {
    if (!searchRequest) {
      return;
    }

    writeActiveSearch({ request: searchRequest, mode: selectedMode });
  }, [searchRequest, selectedMode]);

  useEffect(() => {
    if (!initialSearch?.request) {
      return;
    }

    void loadRoutePlan(initialSearch.request);
  }, [initialSearch, loadRoutePlan]);

  const value = useMemo<RouteContextValue>(
    () => ({
      searchRequest,
      selectedMode,
      recentRoutes,
      routePlanState,
      hasActiveSearch: Boolean(searchRequest),
      setSelectedMode: (mode) => {
        setSelectedModeState(mode);
      },
      startSearch: (request) => {
        const normalizedRequest = normalizeRequest(request);

        setSearchRequest(normalizedRequest);
        setSelectedModeState("balanced");
        writeActiveSearch({ request: normalizedRequest, mode: "balanced" });
        void loadRoutePlan(normalizedRequest);

        return normalizedRequest;
      },
      retrySearch: () => {
        if (!searchRequest) {
          return;
        }

        void loadRoutePlan(searchRequest);
      },
      clearSearch: () => {
        routeRequestIdRef.current += 1;
        setSearchRequest(null);
        setSelectedModeState("balanced");
        setRoutePlanState({ status: "idle" });
        removeActiveSearch();
      },
      refreshRecentRoutes: () => {
        setRecentRoutes(readRecentRoutes());
      },
    }),
    [loadRoutePlan, recentRoutes, routePlanState, searchRequest, selectedMode],
  );

  return <RouteContext.Provider value={value}>{children}</RouteContext.Provider>;
}

export function useRouteState() {
  const context = useContext(RouteContext);

  if (!context) {
    throw new Error("useRouteState must be used within RouteProvider");
  }

  return context;
}

function upsertRecentRoute(routes: RecentRoute[], route: RecentRoute): RecentRoute[] {
  const routeKey = createRouteKey(route);
  const withoutDuplicate = routes.filter((item) => createRouteKey(item) !== routeKey);

  return [route, ...withoutDuplicate].slice(0, MAX_RECENT_ROUTES);
}

async function resolveSearchRequest(request: EtaSearchRequest): Promise<EtaSearchRequest> {
  const [originPoint, destinationPoint] = await Promise.all([
    request.originPoint ? Promise.resolve(request.originPoint) : geocodeFirst(request.origin),
    request.destinationPoint ? Promise.resolve(request.destinationPoint) : geocodeFirst(request.destination),
  ]);

  return {
    ...request,
    originPoint,
    destinationPoint,
  };
}

async function geocodeFirst(query: string): Promise<GeoPoint> {
  const [poi] = await searchPois(query, 1);

  if (!poi) {
    throw new Error(`'${query}' 좌표를 찾을 수 없습니다.`);
  }

  return poi.point;
}

function createRouteKey(route: EtaSearchRequest): string {
  return `${route.origin.trim().toLowerCase()}|${route.destination.trim().toLowerCase()}`;
}

function readActiveSearch(): StoredSearch | null {
  const parsed = readJson<StoredSearch>(ACTIVE_SEARCH_KEY);

  if (!parsed?.request?.origin || !parsed.request.destination || !parsed.request.targetTime) {
    return null;
  }

  return {
    request: normalizeRequest(parsed.request),
    mode: isEtaMode(parsed.mode) ? parsed.mode : "balanced",
  };
}

function writeActiveSearch(search: StoredSearch) {
  writeJson(ACTIVE_SEARCH_KEY, search);
}

function removeActiveSearch() {
  if (!canUseStorage()) {
    return;
  }

  window.sessionStorage.removeItem(ACTIVE_SEARCH_KEY);
}

function readRecentRoutes(): RecentRoute[] {
  const parsed = readJson<RecentRoute[]>(RECENT_ROUTES_KEY);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter((route) => route.origin && route.destination && route.targetTime)
    .map((route) => ({
      ...normalizeRequest(route),
      totalDuration: Number.isFinite(route.totalDuration) ? route.totalDuration : 0,
      updatedAt: route.updatedAt,
    }))
    .slice(0, MAX_RECENT_ROUTES);
}

function writeRecentRoutes(routes: RecentRoute[]) {
  writeJson(RECENT_ROUTES_KEY, routes.slice(0, MAX_RECENT_ROUTES));
}

function readJson<T>(key: string): T | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const rawValue =
      key === ACTIVE_SEARCH_KEY ? window.sessionStorage.getItem(key) : window.localStorage.getItem(key);

    return rawValue ? (JSON.parse(rawValue) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (!canUseStorage()) {
    return;
  }

  const serialized = JSON.stringify(value);

  if (key === ACTIVE_SEARCH_KEY) {
    window.sessionStorage.setItem(key, serialized);
    return;
  }

  window.localStorage.setItem(key, serialized);
}

function isEtaMode(value: unknown): value is EtaMode {
  return value === "safe" || value === "balanced" || value === "punctual";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "경로 조회 중 알 수 없는 오류가 발생했습니다.";
}

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}
