import {
  type RouteIntent,
  type RoutePoint,
  type TransitLeg,
  type TransitPathStep,
  type TransitRouteEstimate,
} from "../domain/eta";
import { resolveKnownPlacePoint } from "../domain/places";
import { createApiUrl } from "./apiBase";

interface OdsayPathInfo {
  payment?: number | string;
  busTransitCount?: number | string;
  subwayTransitCount?: number | string;
  totalTime?: number | string;
  totalWalk?: number | string;
  trafficDistance?: number | string;
  firstStartStation?: string;
  lastEndStation?: string;
}

interface OdsaySubPath {
  trafficType?: number | string;
  distance?: number | string;
  sectionTime?: number | string;
  stationCount?: number | string;
  lane?: unknown;
  way?: string;
  wayCode?: number | string;
  startName?: string;
  endName?: string;
  startID?: number | string;
  startArsID?: number | string;
  startLocalStationID?: number | string;
}

interface OdsayPath {
  info?: OdsayPathInfo;
  subPath?: OdsaySubPath[];
}

interface OdsaySearchResponse {
  result?: {
    path?: OdsayPath[];
  };
  code?: string;
  error?: unknown;
}

interface RealtimeTransitResponse {
  isRealtime?: boolean;
  waitMinutes?: number;
  message?: string;
  updatedAtLabel?: string;
  sourceLabel?: string;
}

interface TransitServiceContext {
  allowLateNight: boolean;
  allowEarlyMorning: boolean;
}

interface BuiltTransitPath {
  legs: TransitLeg[];
  pathSteps: TransitPathStep[];
}

export async function fetchOdsayTransitEstimate(
  intent: RouteIntent,
  signal: AbortSignal
): Promise<TransitRouteEstimate | undefined> {
  const estimates = await fetchOdsayTransitEstimates(intent, signal);

  return estimates[0];
}

export async function fetchOdsayTransitEstimates(
  intent: RouteIntent,
  signal: AbortSignal
): Promise<TransitRouteEstimate[]> {
  const origin = resolveIntentPoint(intent.origin, intent.originPoint);
  const destination = resolveIntentPoint(intent.destination, intent.destinationPoint);

  if (!origin || !destination) {
    return [];
  }

  const serverPayload = await fetchOdsayFromServer(origin, destination, signal);
  const payload = serverPayload ?? (await fetchOdsayFromBrowser(origin, destination, signal));

  if (!payload || payload.code || hasOdsayError(payload)) {
    return [];
  }

  const serviceContext = getTransitServiceContext(intent);
  const paths = Array.isArray(payload.result?.path) ? payload.result.path : [];
  const estimates = dedupeTransitEstimates(
    paths
      .slice(0, 16)
      .map((path, index) => buildTransitEstimate(path, index, serviceContext))
      .filter(Boolean) as TransitRouteEstimate[]
  ).slice(0, 10);

  const enriched = await Promise.all(
    estimates.map((estimate) => enrichWithRealtimeArrival(estimate, signal))
  );

  return enriched.sort((first, second) => first.totalDurationMinutes - second.totalDurationMinutes);
}

async function fetchOdsayFromBrowser(
  origin: RoutePoint,
  destination: RoutePoint,
  signal: AbortSignal
) {
  const apiKey = getOdsayWebKey();

  if (!apiKey) {
    return undefined;
  }

  try {
    const url = new URL("https://api.odsay.com/v1/api/searchPubTransPathT");
    url.searchParams.set("SX", String(origin.lng));
    url.searchParams.set("SY", String(origin.lat));
    url.searchParams.set("EX", String(destination.lng));
    url.searchParams.set("EY", String(destination.lat));
    url.searchParams.set("SearchPathType", "0");
    url.searchParams.set("apiKey", apiKey);

    const response = await fetch(url, { signal });
    const payload = (await response.json()) as OdsaySearchResponse;

    if (!response.ok || payload.code || hasOdsayError(payload)) {
      return undefined;
    }

    return payload;
  } catch {
    return undefined;
  }
}

async function fetchOdsayFromServer(
  origin: RoutePoint,
  destination: RoutePoint,
  signal: AbortSignal
) {
  const response = await fetch(createApiUrl("/api/mobility/odsay-route"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin,
      destination,
      searchPathType: "0",
    }),
    signal,
  });
  const payload = (await response.json()) as OdsaySearchResponse;

  if (!response.ok || payload.code || hasOdsayError(payload)) {
    return undefined;
  }

  return payload;
}

function getOdsayWebKey() {
  return (
    import.meta.env.VITE_ODSAY_API_KEY?.trim() ||
    import.meta.env.ODSAY_API_KEY?.trim() ||
    ""
  );
}

function buildTransitEstimate(
  path: OdsayPath,
  index = 0,
  serviceContext: TransitServiceContext
): TransitRouteEstimate | undefined {
  const subPaths = Array.isArray(path.subPath) ? path.subPath : [];
  const info = path.info ?? {};
  const transitSubPaths = subPaths.filter((subPath) => isTransitType(subPath.trafficType));
  const walkSubPaths = subPaths.filter((subPath) => toNumber(subPath.trafficType) === 3);
  const { legs, pathSteps } = buildTransitPath(subPaths, serviceContext);

  if (legs.length === 0) {
    return undefined;
  }

  const totalDurationMinutes =
    positiveNumber(info.totalTime) ?? sumSectionMinutes(subPaths);
  const walkDurationMinutes = sumSectionMinutes(walkSubPaths);
  const transitDurationMinutes = Math.max(1, sumSectionMinutes(transitSubPaths));
  const boardingWaitMinutes = Math.max(
    0,
    totalDurationMinutes - walkDurationMinutes - transitDurationMinutes
  );
  const firstTransitIndex = subPaths.findIndex((subPath) =>
    isTransitType(subPath.trafficType)
  );
  const lastTransitIndex = findLastTransitIndex(subPaths);
  const firstWalkMinutes = sumSectionMinutes(subPaths.slice(0, firstTransitIndex));
  const lastWalkMinutes =
    lastTransitIndex >= 0 ? sumSectionMinutes(subPaths.slice(lastTransitIndex + 1)) : 0;
  const mainTransitLabel = getMainTransitLabel(legs);
  const routeMode = getRouteMode(legs);
  const mainTransitDetail = legs
    .map((leg) => `${leg.routeName} ${leg.startName}→${leg.endName}`)
    .join(" · ");

  return {
    provider: "odsay",
    routeOptionId: `odsay-${index}-${routeMode}-${legs
      .map((leg) => leg.routeName)
      .join("-")}`,
    routeOptionLabel: getRouteOptionLabel(routeMode, legs),
    routeMode,
    sourceLabel: "ODsay 경로 시간",
    updatedAtLabel: formatCurrentTime(new Date()),
    isRealtime: false,
    totalDurationMinutes,
    firstWalkMinutes,
    lastWalkMinutes,
    walkDurationMinutes,
    walkDistanceMeters: positiveNumber(info.totalWalk),
    transitDurationMinutes,
    boardingWaitMinutes,
    payment: positiveNumber(info.payment),
    firstStartStation: info.firstStartStation || legs[0]?.startName,
    lastEndStation: info.lastEndStation || legs[legs.length - 1]?.endName,
    mainTransitLabel,
    mainTransitDetail,
    legs,
    pathSteps,
  };
}

function dedupeTransitEstimates(estimates: TransitRouteEstimate[]) {
  const unique: TransitRouteEstimate[] = [];

  for (const estimate of estimates) {
    const key = `${estimate.routeMode}:${estimate.legs
      .map((leg) => `${leg.routeName}:${leg.startName}:${leg.endName}`)
      .join("|")}`;

    if (unique.some((item) => `${item.routeMode}:${item.legs.map((leg) => `${leg.routeName}:${leg.startName}:${leg.endName}`).join("|")}` === key)) {
      continue;
    }

    unique.push(estimate);
  }

  return unique;
}

function resolveIntentPoint(name: string, point?: RoutePoint) {
  return resolveKnownPlacePoint(name, point ? { ...point, name } : undefined);
}

function buildTransitPath(
  subPaths: OdsaySubPath[],
  serviceContext: TransitServiceContext
): BuiltTransitPath {
  const legs: TransitLeg[] = [];
  const pathSteps: TransitPathStep[] = [];

  for (const [index, subPath] of subPaths.entries()) {
    const trafficType = toNumber(subPath.trafficType);
    const durationMinutes = positiveNumber(subPath.sectionTime) ?? 0;
    const distanceMeters = positiveNumber(subPath.distance);

    if (trafficType === 3 && (durationMinutes > 0 || (distanceMeters ?? 0) > 0)) {
      pathSteps.push({
        id: `walk-${index}`,
        type: "walk",
        durationMinutes,
        distanceMeters,
      });
      continue;
    }

    if (!isTransitType(trafficType)) {
      continue;
    }

    const leg = toTransitLeg(subPath, serviceContext);

    if (!leg) {
      continue;
    }

    const legIndex = legs.length;
    legs.push(leg);
    pathSteps.push({
      id: `ride-${index}`,
      type: "ride",
      durationMinutes: leg.durationMinutes,
      legIndex,
    });
  }

  return { legs, pathSteps };
}

function toTransitLeg(
  subPath: OdsaySubPath,
  serviceContext: TransitServiceContext
): TransitLeg | undefined {
  const trafficType = toNumber(subPath.trafficType);
  const mode = trafficType === 1 ? "subway" : trafficType === 2 ? "bus" : undefined;

  if (!mode) {
    return undefined;
  }

  const laneName = getLaneName(subPath.lane, serviceContext);

  if (mode === "bus" && !laneName) {
    return undefined;
  }

  const routeName = laneName ?? "지하철";
  const startName = subPath.startName || "탑승지";
  const endName = subPath.endName || "하차지";
  const routeId = getRouteId(subPath, mode, serviceContext);

  return {
    mode,
    routeName,
    startName,
    endName,
    durationMinutes: positiveNumber(subPath.sectionTime) ?? 0,
    stationCount: positiveNumber(subPath.stationCount),
    direction: subPath.way,
    directionLabel: getDirectionLabel({
      mode,
      routeId,
      routeName,
      startName,
      endName,
      way: subPath.way,
      wayCode: subPath.wayCode,
    }),
    routeId,
    stationId: getStationId(subPath, mode),
    arsId: toText(subPath.startArsID),
  };
}

function getDirectionLabel({
  mode,
  routeId,
  routeName,
  startName,
  endName,
  way,
  wayCode,
}: {
  mode: TransitLeg["mode"];
  routeId?: string;
  routeName: string;
  startName: string;
  endName: string;
  way?: string;
  wayCode?: number | string;
}) {
  const wayText = toText(way);

  if (mode !== "subway") {
    return wayText ? `${wayText} 방면` : undefined;
  }

  const lineKey = getSubwayLineKey(routeId, routeName);

  if (lineKey === "2") {
    return getLine2DirectionLabel(startName, endName, wayText);
  }

  const code = toText(wayCode);
  const terminal = lineKey && code ? SUBWAY_TERMINAL_BY_LINE[lineKey]?.[code] : undefined;

  if (terminal) {
    return `${terminal} 방면`;
  }

  return wayText ? `${wayText} 방면` : undefined;
}

function getLine2DirectionLabel(startName: string, endName: string, wayText?: string) {
  const startIndex = getLine2StationIndex(startName);
  const endIndex = getLine2StationIndex(endName);
  const targetName = wayText || endName;

  if (startIndex === -1 || endIndex === -1 || startIndex === endIndex) {
    return targetName ? `${targetName} 방면` : undefined;
  }

  const clockwisePath = getCircularPath(LINE2_STATIONS, startIndex, endIndex, 1);
  const counterClockwisePath = getCircularPath(LINE2_STATIONS, startIndex, endIndex, -1);
  const selectedPath =
    clockwisePath.length <= counterClockwisePath.length ? clockwisePath : counterClockwisePath;
  const nextStation = selectedPath[0];

  if (!nextStation) {
    return targetName ? `${targetName} 방면` : undefined;
  }

  return `${nextStation} 쪽`;
}

function getCircularPath(stations: string[], startIndex: number, endIndex: number, step: 1 | -1) {
  const path: string[] = [];
  let index = startIndex;

  while (path.length < stations.length) {
    index = (index + step + stations.length) % stations.length;
    path.push(stations[index]);

    if (index === endIndex) {
      break;
    }
  }

  return path;
}

function getLine2StationIndex(stationName: string) {
  const normalizedName = normalizeStationName(stationName);

  return LINE2_STATIONS.findIndex((station) => normalizeStationName(station) === normalizedName);
}

function normalizeStationName(stationName: string) {
  return stationName
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, "")
    .replace(/역$/g, "")
    .trim();
}

const LINE2_STATIONS = [
  "시청",
  "을지로입구",
  "을지로3가",
  "을지로4가",
  "동대문역사문화공원",
  "신당",
  "상왕십리",
  "왕십리",
  "한양대",
  "뚝섬",
  "성수",
  "건대입구",
  "구의",
  "강변",
  "잠실나루",
  "잠실",
  "잠실새내",
  "종합운동장",
  "삼성",
  "선릉",
  "역삼",
  "강남",
  "교대",
  "서초",
  "방배",
  "사당",
  "낙성대",
  "서울대입구",
  "봉천",
  "신림",
  "신대방",
  "구로디지털단지",
  "대림",
  "신도림",
  "문래",
  "영등포구청",
  "당산",
  "합정",
  "홍대입구",
  "신촌",
  "이대",
  "아현",
  "충정로",
];

function getSubwayLineKey(routeId?: string, routeName = "") {
  const normalizedId = routeId?.trim();

  if (normalizedId && SUBWAY_TERMINAL_BY_LINE[normalizedId]) {
    return normalizedId;
  }

  if (routeName.includes("신분당")) {
    return "shinbundang";
  }

  const match = routeName.match(/(\d+)호선/);

  return match?.[1];
}

const SUBWAY_TERMINAL_BY_LINE: Record<string, Record<string, string>> = {
  "3": {
    "1": "대화",
    "2": "오금",
  },
  "7": {
    "1": "장암",
    "2": "석남",
  },
  shinbundang: {
    "1": "신사",
    "2": "광교",
  },
};

async function enrichWithRealtimeArrival(
  estimate: TransitRouteEstimate,
  signal: AbortSignal
) {
  const firstLeg = estimate.legs[0];

  if (!firstLeg) {
    return estimate;
  }

  const realtime = await fetchRealtimeArrival(firstLeg, signal);

  if (!realtime?.isRealtime || !Number.isFinite(realtime.waitMinutes)) {
    return estimate;
  }

  const waitMinutes = Math.max(0, Math.round(realtime.waitMinutes ?? 0));
  const nextLeg = {
    ...firstLeg,
    realtimeWaitMinutes: waitMinutes,
    realtimeMessage: realtime.message,
    realtimeUpdatedAtLabel: realtime.updatedAtLabel,
  };
  const waitDelta = waitMinutes - estimate.boardingWaitMinutes;

  return {
    ...estimate,
    sourceLabel: realtime.sourceLabel ?? "실시간 대중교통 도착",
    updatedAtLabel: realtime.updatedAtLabel ?? estimate.updatedAtLabel,
    isRealtime: true,
    boardingWaitMinutes: waitMinutes,
    totalDurationMinutes: Math.max(1, estimate.totalDurationMinutes + waitDelta),
    legs: [nextLeg, ...estimate.legs.slice(1)],
  };
}

async function fetchRealtimeArrival(leg: TransitLeg, signal: AbortSignal) {
  const params = new URLSearchParams({
    mode: leg.mode,
    stationName: leg.startName,
    routeName: leg.routeName,
  });

  if (leg.routeId) {
    params.set("routeId", leg.routeId);
  }

  if (leg.stationId) {
    params.set("stationId", leg.stationId);
  }

  if (leg.arsId) {
    params.set("arsId", leg.arsId);
  }

  if (leg.direction) {
    params.set("direction", leg.direction);
  }

  try {
    const response = await fetch(createApiUrl(`/api/realtime-transit?${params.toString()}`), {
      signal,
    });

    if (!response.ok) {
      return undefined;
    }

    return (await response.json()) as RealtimeTransitResponse;
  } catch {
    return undefined;
  }
}

function getTransitServiceContext(intent: RouteIntent): TransitServiceContext {
  const timeCandidates = [intent.departureTime, intent.targetArrivalTime];

  return {
    allowLateNight: timeCandidates.some(isLateNightTransitTime),
    allowEarlyMorning: timeCandidates.some(isEarlyMorningTransitTime),
  };
}

function getLaneName(
  lane: unknown,
  serviceContext: TransitServiceContext
): string | undefined {
  const laneRecord = getBestLane(lane, serviceContext);
  const name = laneRecord ? getLaneDisplayName(laneRecord) : undefined;

  return typeof name === "string" && name.trim() ? name.trim() : undefined;
}

function getRouteId(
  subPath: OdsaySubPath,
  mode: TransitLeg["mode"],
  serviceContext: TransitServiceContext
) {
  const firstLane = getBestLane(subPath.lane, serviceContext);

  if (mode === "bus") {
    return toText(firstLane?.busLocalBlID ?? firstLane?.busID);
  }

  return toText(firstLane?.subwayCode ?? firstLane?.subwayID);
}

function getStationId(subPath: OdsaySubPath, mode: TransitLeg["mode"]) {
  if (mode === "bus") {
    return toText(subPath.startLocalStationID ?? subPath.startID);
  }

  return toText(subPath.startID);
}

function getBestLane(
  lane: unknown,
  serviceContext: TransitServiceContext
): Record<string, unknown> | undefined {
  const lanes = getLaneRecords(lane);
  const matchingSpecialLane = lanes.find((laneRecord) =>
    isLanePreferredForCurrentTime(laneRecord, serviceContext)
  );

  if (matchingSpecialLane) {
    return matchingSpecialLane;
  }

  const regularLane = lanes.find((laneRecord) => getLaneServicePeriod(laneRecord) === "regular");

  if (regularLane) {
    return regularLane;
  }

  return lanes.find((laneRecord) => isLaneAllowed(laneRecord, serviceContext));
}

function getLaneRecords(lane: unknown): Record<string, unknown>[] {
  if (Array.isArray(lane)) {
    return lane
      .filter((item) => item && typeof item === "object")
      .map((item) => item as Record<string, unknown>);
  }

  if (!lane || typeof lane !== "object") {
    return [];
  }

  return [lane as Record<string, unknown>];
}

function getLaneDisplayName(laneRecord: Record<string, unknown>) {
  const name = laneRecord.name ?? laneRecord.busNo;

  return typeof name === "string" && name.trim() ? name.trim() : undefined;
}

function isLaneAllowed(
  laneRecord: Record<string, unknown>,
  serviceContext: TransitServiceContext
) {
  const servicePeriod = getLaneServicePeriod(laneRecord);

  if (servicePeriod === "lateNight") {
    return serviceContext.allowLateNight;
  }

  if (servicePeriod === "earlyMorning") {
    return serviceContext.allowEarlyMorning;
  }

  return true;
}

function isLanePreferredForCurrentTime(
  laneRecord: Record<string, unknown>,
  serviceContext: TransitServiceContext
) {
  const servicePeriod = getLaneServicePeriod(laneRecord);

  return (
    (servicePeriod === "lateNight" && serviceContext.allowLateNight) ||
    (servicePeriod === "earlyMorning" && serviceContext.allowEarlyMorning)
  );
}

function getLaneServicePeriod(laneRecord: Record<string, unknown>) {
  const name = getLaneDisplayName(laneRecord) ?? "";

  if (/새벽/.test(name)) {
    return "earlyMorning";
  }

  if (/심야|올빼미|(^|[^A-Z0-9])N\d+/i.test(name)) {
    return "lateNight";
  }

  return "regular";
}

function isLateNightTransitTime(value?: string) {
  const minutes = parseTimeToMinutes(value);

  return minutes !== undefined && (minutes >= 23 * 60 || minutes <= 4 * 60 + 30);
}

function isEarlyMorningTransitTime(value?: string) {
  const minutes = parseTimeToMinutes(value);

  return minutes !== undefined && minutes >= 4 * 60 && minutes <= 6 * 60 + 30;
}

function parseTimeToMinutes(value?: string) {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return undefined;
  }

  const [hour, minute] = value.split(":").map(Number);

  return hour * 60 + minute;
}

function getMainTransitLabel(legs: TransitLeg[]) {
  if (legs.length === 1) {
    return legs[0].routeName;
  }

  const subwayCount = legs.filter((leg) => leg.mode === "subway").length;
  const busCount = legs.filter((leg) => leg.mode === "bus").length;

  if (subwayCount && busCount) {
    return `대중교통 ${legs.length}개 구간`;
  }

  return subwayCount ? `지하철 ${subwayCount}개 구간` : `버스 ${busCount}개 구간`;
}

function getRouteMode(legs: TransitLeg[]): TransitRouteEstimate["routeMode"] {
  const hasBus = legs.some((leg) => leg.mode === "bus");
  const hasSubway = legs.some((leg) => leg.mode === "subway");

  if (hasBus && hasSubway) {
    return "mixed";
  }

  return hasSubway ? "subway" : "bus";
}

function getRouteOptionLabel(
  routeMode: TransitRouteEstimate["routeMode"],
  legs: TransitLeg[]
) {
  if (routeMode === "mixed") {
    return "버스+지하철";
  }

  if (routeMode === "subway") {
    return "지하철";
  }

  const firstBus = legs.find((leg) => leg.mode === "bus");

  return firstBus?.routeName ? `버스 ${firstBus.routeName}` : "버스";
}

function findLastTransitIndex(subPaths: OdsaySubPath[]) {
  for (let index = subPaths.length - 1; index >= 0; index -= 1) {
    if (isTransitType(subPaths[index]?.trafficType)) {
      return index;
    }
  }

  return -1;
}

function sumSectionMinutes(subPaths: OdsaySubPath[]) {
  return subPaths.reduce(
    (sum, subPath) => sum + (positiveNumber(subPath.sectionTime) ?? 0),
    0
  );
}

function isTransitType(value: unknown) {
  const trafficType = toNumber(value);

  return trafficType === 1 || trafficType === 2;
}

function hasOdsayError(payload: { error?: unknown }) {
  return Array.isArray(payload.error) ? payload.error.length > 0 : Boolean(payload.error);
}

function positiveNumber(value: unknown) {
  const numberValue = toNumber(value);

  return Number.isFinite(numberValue) && numberValue >= 0 ? Math.round(numberValue) : undefined;
}

function toNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}

function toText(value: unknown) {
  if (typeof value === "number") {
    return String(value);
  }

  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function formatCurrentTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")} 반영`;
}
