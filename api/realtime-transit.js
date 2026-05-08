import { handleCors } from "./_utils/cors.js";

const BUS_ARRIVAL_URL = "http://ws.bus.go.kr/api/rest/arrive/getArrInfoByRouteAll";
const SUBWAY_ARRIVAL_URL = "http://swopenapi.seoul.go.kr/api/subway";

export default async function handler(request, response) {
  if (handleCors(request, response, ["GET", "OPTIONS"])) {
    return;
  }

  const query = new URL(request.url, "http://localhost").searchParams;
  const mode = query.get("mode");

  try {
    if (mode === "bus") {
      return response.status(200).json(await getBusArrival(query));
    }

    if (mode === "subway") {
      return response.status(200).json(await getSubwayArrival(query));
    }

    return response.status(400).json({ isRealtime: false, reason: "unknown_mode" });
  } catch (error) {
    return response.status(200).json({
      isRealtime: false,
      reason: "realtime_fetch_failed",
      message: error instanceof Error ? error.message : "unknown error",
    });
  }
}

async function getBusArrival(query) {
  const serviceKey = getEnv("SEOUL_BUS_SERVICE_KEY", "PUBLIC_DATA_SERVICE_KEY", "DATA_GO_KR_SERVICE_KEY");
  const routeId = query.get("routeId");
  const stationId = query.get("stationId");
  const arsId = query.get("arsId");

  if (!serviceKey || !routeId || !stationId) {
    return { isRealtime: false, reason: "missing_bus_key_or_ids" };
  }

  const url = buildDataGoKrUrl(BUS_ARRIVAL_URL, serviceKey, {
    busRouteId: routeId,
  });
  const text = await fetch(url).then((result) => result.text());
  const items = parseXmlItems(text);
  const item =
    items.find((candidate) => candidate.stId === stationId) ??
    items.find((candidate) => candidate.arsId === arsId);

  if (!item) {
    return { isRealtime: false, reason: "bus_station_not_found" };
  }

  const waitSeconds = toNumber(item.traTime1);
  const waitMinutes = Number.isFinite(waitSeconds)
    ? Math.max(0, Math.ceil(waitSeconds / 60))
    : parseWaitMinutes(item.arrmsg1);

  if (!Number.isFinite(waitMinutes)) {
    return {
      isRealtime: false,
      reason: "bus_arrival_unavailable",
      message: item.arrmsg1,
    };
  }

  return {
    isRealtime: true,
    waitMinutes,
    message: item.arrmsg1,
    routeName: item.rtNm,
    sourceLabel: "실시간 버스 도착",
    updatedAtLabel: formatCurrentTime(new Date()),
  };
}

async function getSubwayArrival(query) {
  const serviceKeys = getEnvValues("SEOUL_SUBWAY_SERVICE_KEY", "SEOUL_OPEN_API_KEY");
  const stationName = query.get("stationName");
  const routeName = query.get("routeName") ?? "";
  const direction = query.get("direction") ?? "";

  if (!serviceKeys.length || !stationName) {
    return { isRealtime: false, reason: "missing_subway_key_or_station" };
  }

  let lastError;

  for (const serviceKey of serviceKeys) {
    const url = `${SUBWAY_ARRIVAL_URL}/${encodeURIComponent(
      serviceKey
    )}/json/realtimeStationArrival/0/8/${encodeURIComponent(cleanSubwayStationName(stationName))}`;
    const payload = await fetch(url).then((result) => result.json());
    const errorCode = payload?.errorMessage?.code ?? payload?.code;

    if (errorCode && errorCode !== "INFO-000") {
      lastError = payload?.errorMessage?.message ?? payload?.message ?? errorCode;
      continue;
    }

    const arrivals = Array.isArray(payload.realtimeArrivalList)
      ? payload.realtimeArrivalList
      : [];

    if (!arrivals.length) {
      lastError = "subway_arrival_empty";
      continue;
    }

    return toSubwayArrivalResponse(arrivals, routeName, direction);
  }

  return {
    isRealtime: false,
    reason: "subway_arrival_unavailable",
    message: lastError,
  };
}

function toSubwayArrivalResponse(arrivals, routeName, direction) {
  const lineArrivals = routeName
    ? arrivals.filter((candidate) => isSameSubwayLine(routeName, candidate))
    : arrivals;

  if (!lineArrivals.length) {
    return {
      isRealtime: false,
      reason: "subway_line_not_found",
      message: `${routeName} 실시간 도착 없음`,
    };
  }

  const directionArrivals = filterBySubwayDirection(lineArrivals, direction);
  const arrival = pickBestSubwayArrival(
    directionArrivals.length ? directionArrivals : lineArrivals
  );

  if (!arrival) {
    return { isRealtime: false, reason: "subway_arrival_unavailable" };
  }

  const waitSeconds = getSubwayWaitSeconds(arrival);

  return {
    isRealtime: Number.isFinite(waitSeconds),
    waitMinutes: Number.isFinite(waitSeconds)
      ? Math.max(0, Math.ceil(waitSeconds / 60))
      : undefined,
    message: arrival.arvlMsg2,
    routeName: arrival.trainLineNm,
    sourceLabel: "실시간 지하철 도착",
    updatedAtLabel: formatCurrentTime(new Date()),
  };
}

function cleanSubwayStationName(stationName) {
  return String(stationName || "").replace(/\s*역$/, "").trim();
}

function buildDataGoKrUrl(baseUrl, serviceKey, params) {
  const query = new URLSearchParams(params);
  const serviceKeyParam = /%[0-9A-Fa-f]{2}/.test(serviceKey)
    ? serviceKey
    : encodeURIComponent(serviceKey);

  return `${baseUrl}?serviceKey=${serviceKeyParam}&${query.toString()}`;
}

function parseXmlItems(xml) {
  return Array.from(xml.matchAll(/<itemList>([\s\S]*?)<\/itemList>/g)).map(
    (match) => parseXmlFields(match[1])
  );
}

function parseXmlFields(xml) {
  const fields = {};

  for (const match of xml.matchAll(/<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g)) {
    fields[match[1]] = decodeXml(match[2]);
  }

  return fields;
}

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseWaitMinutes(message) {
  const minuteMatch = String(message ?? "").match(/(\d+)\s*분/);

  if (minuteMatch) {
    return Number(minuteMatch[1]);
  }

  const soonMatch = String(message ?? "").match(/곧|진입|도착/);

  return soonMatch ? 0 : undefined;
}

function isSameSubwayLine(routeName, arrival) {
  const normalizedRouteName = normalizeSubwayLineName(routeName);
  const subwayId = String(arrival?.subwayId ?? "");
  const candidateLineName = normalizeSubwayLineName(
    `${arrival?.subwayNm ?? ""} ${arrival?.trainLineNm ?? ""}`
  );

  if (normalizedRouteName.includes("신분당")) {
    return subwayId === "1077" || candidateLineName.includes("신분당");
  }

  if (normalizedRouteName.includes("수인분당") || normalizedRouteName === "분당선") {
    return subwayId === "1075" || candidateLineName.includes("수인분당");
  }

  const lineMatch = normalizedRouteName.match(/(\d+)호선/);

  if (!lineMatch) {
    return false;
  }

  return String(subwayId).endsWith(lineMatch[1]);
}

function filterBySubwayDirection(arrivals, direction) {
  const normalizedDirection = normalizeDirection(direction);

  if (!normalizedDirection) {
    return arrivals;
  }

  return arrivals.filter((arrival) => {
    const trainLine = normalizeDirection(arrival.trainLineNm);
    const updnLine = normalizeDirection(arrival.updnLine);

    return trainLine.includes(normalizedDirection) || updnLine.includes(normalizedDirection);
  });
}

function pickBestSubwayArrival(arrivals) {
  return [...arrivals].sort((first, second) => {
    const firstSeconds = getSubwayWaitSeconds(first);
    const secondSeconds = getSubwayWaitSeconds(second);

    return (
      (Number.isFinite(firstSeconds) ? firstSeconds : Number.POSITIVE_INFINITY) -
      (Number.isFinite(secondSeconds) ? secondSeconds : Number.POSITIVE_INFINITY)
    );
  })[0];
}

function getSubwayWaitSeconds(arrival) {
  const message = String(arrival?.arvlMsg2 ?? "");
  const previousStationMatch = message.match(/\[(\d+)\]번째\s*전역/);

  if (previousStationMatch) {
    return Math.max(60, Number(previousStationMatch[1]) * 120);
  }

  if (/전역/.test(message)) {
    return 120;
  }

  if (/진입|도착/.test(message)) {
    return 0;
  }

  const waitSeconds = toNumber(arrival?.barvlDt);

  return Number.isFinite(waitSeconds) ? waitSeconds : undefined;
}

function normalizeSubwayLineName(value) {
  return String(value ?? "")
    .replace(/^수도권\s*/, "")
    .replace(/\s+/g, "")
    .trim();
}

function normalizeDirection(value) {
  return String(value ?? "")
    .replace(/행|방면|급행|일반|\s|-/g, "")
    .trim();
}

function toNumber(value) {
  return typeof value === "number" ? value : Number(value);
}

function getEnv(...names) {
  for (const name of names) {
    const value = process.env[name];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function getEnvValues(...names) {
  const values = [];

  for (const name of names) {
    const value = getEnv(name);

    if (value && !values.includes(value)) {
      values.push(value);
    }
  }

  return values;
}

function formatCurrentTime(date) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";

  return `${hour}:${minute} 반영`;
}
