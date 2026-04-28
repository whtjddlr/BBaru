import {
  createDefaultRouteIntent,
  normalizeRouteIntent,
  type ArrivalStrategy,
  type RouteIntent,
  type WalkingPace,
} from "../../domain/eta";

interface SolarRouteIntentResponse {
  intent?: Partial<RouteIntent>;
  error?: string;
  code?: string;
}

export async function interpretRouteRequest(text: string): Promise<RouteIntent> {
  const trimmedText = text.trim();

  if (!trimmedText) {
    return createDefaultRouteIntent();
  }

  try {
    const response = await fetch("/api/ai/route-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: trimmedText }),
    });

    if (!response.ok) {
      throw new Error(`Solar route intent failed: ${response.status}`);
    }

    const payload = (await response.json()) as SolarRouteIntentResponse;

    if (!payload.intent) {
      throw new Error(payload.error || "Solar route intent was empty");
    }

    return normalizeRouteIntent({
      ...payload.intent,
      naturalLanguage: trimmedText,
    });
  } catch {
    return interpretRouteRequestLocally(trimmedText);
  }
}

export function interpretRouteRequestLocally(text: string): RouteIntent {
  const defaults = createDefaultRouteIntent();
  const time = parseTime(text) ?? defaults.targetArrivalTime;
  const [origin, destination] = parseRoutePoints(text);

  return normalizeRouteIntent({
    origin: origin || defaults.origin,
    destination: destination || defaults.destination,
    targetArrivalTime: time,
    strategy: parseStrategy(text),
    naturalLanguage: text,
    context: text,
    preferences: {
      walkingPace: parseWalkingPace(text),
      transferBufferMinutes: text.includes("여유") ? 4 : 2,
      signalBufferMinutes: text.includes("신호") ? 2 : 1,
    },
  });
}

function parseRoutePoints(text: string): [string | undefined, string | undefined] {
  const routeMatch = text.match(/(.+?)(?:에서|부터)\s+(.+?)(?:까지|로|으로)/);

  if (routeMatch) {
    return [cleanPoint(routeMatch[1]), cleanPoint(routeMatch[2])];
  }

  const arrowMatch = text.match(/(.+?)\s*(?:->|→)\s*(.+?)(?:\s|$)/);

  if (arrowMatch) {
    return [cleanPoint(arrowMatch[1]), cleanPoint(arrowMatch[2])];
  }

  return [undefined, undefined];
}

function parseTime(text: string): string | undefined {
  const explicitTime = text.match(/([01]?\d|2[0-3]):([0-5]\d)/);

  if (explicitTime) {
    return `${explicitTime[1].padStart(2, "0")}:${explicitTime[2]}`;
  }

  const koreanTime = text.match(/(오전|오후)?\s*([0-2]?\d)\s*시(?:\s*([0-5]?\d)\s*분?)?/);

  if (!koreanTime) {
    return undefined;
  }

  const meridiem = koreanTime[1];
  let hour = Number(koreanTime[2]);
  const minute = Number(koreanTime[3] ?? 0);

  if (meridiem === "오후" && hour < 12) {
    hour += 12;
  }

  if (meridiem === "오전" && hour === 12) {
    hour = 0;
  }

  if (hour > 23 || minute > 59) {
    return undefined;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseStrategy(text: string): ArrivalStrategy {
  if (text.includes("안전") || text.includes("여유") || text.includes("일찍")) {
    return "safe";
  }

  if (text.includes("정시") || text.includes("딱 맞게") || text.includes("맞춰")) {
    return "ontime";
  }

  return "balanced";
}

function parseWalkingPace(text: string): WalkingPace {
  if (text.includes("느리") || text.includes("천천히")) {
    return "slow";
  }

  if (text.includes("빠르") || text.includes("서둘")) {
    return "fast";
  }

  return "normal";
}

function cleanPoint(value: string): string {
  return value
    .replace(/오늘|내일|모레|오전|오후/g, "")
    .replace(/\d{1,2}(?::\d{2})?\s*시?/g, "")
    .replace(/도착|출발|가야|갈래|가고 싶어/g, "")
    .trim();
}
