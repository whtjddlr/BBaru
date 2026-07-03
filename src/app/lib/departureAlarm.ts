export const DEPARTURE_ALARM_STORAGE_KEY = "bbaru:departure-alarm";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export type DepartureAlarmFireType = "fiveMinutesBefore" | "departure";
export type DepartureAlarmPermission = NotificationPermission | "unsupported";

export interface DepartureAlarmRouteSummary {
  origin: string;
  destination: string;
  targetTime: string;
}

export interface DepartureAlarmFiredFlags {
  fiveMinutesBefore: boolean;
  departure: boolean;
}

export interface DepartureAlarm {
  routeSummary: DepartureAlarmRouteSummary;
  recommendedDepartureIso: string;
  fired: DepartureAlarmFiredFlags;
  createdAtIso: string;
}

export interface DepartureAlarmTime {
  type: DepartureAlarmFireType;
  scheduledAt: Date;
}

export interface DepartureAlarmFire {
  type: DepartureAlarmFireType;
  scheduledAt: Date;
  alarm: DepartureAlarm;
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function computeAlarmTimes(recommendedDeparture: Date, now: Date): DepartureAlarmTime[] {
  if (!isValidDate(recommendedDeparture) || !isValidDate(now)) {
    return [];
  }

  const fiveMinutesBefore = new Date(recommendedDeparture.getTime() - FIVE_MINUTES_MS);
  const alarmTimes: DepartureAlarmTime[] = [];

  if (fiveMinutesBefore.getTime() >= now.getTime()) {
    alarmTimes.push({ type: "fiveMinutesBefore", scheduledAt: fiveMinutesBefore });
  }

  if (recommendedDeparture.getTime() >= now.getTime()) {
    alarmTimes.push({ type: "departure", scheduledAt: new Date(recommendedDeparture) });
  }

  return alarmTimes;
}

export function createDepartureAlarm(
  routeSummary: DepartureAlarmRouteSummary,
  recommendedDeparture: Date,
  now = new Date(),
): DepartureAlarm {
  const alarmTypes = new Set(computeAlarmTimes(recommendedDeparture, now).map((alarmTime) => alarmTime.type));

  return {
    routeSummary: {
      origin: routeSummary.origin.trim(),
      destination: routeSummary.destination.trim(),
      targetTime: routeSummary.targetTime,
    },
    recommendedDepartureIso: recommendedDeparture.toISOString(),
    fired: {
      fiveMinutesBefore: !alarmTypes.has("fiveMinutesBefore"),
      departure: !alarmTypes.has("departure"),
    },
    createdAtIso: now.toISOString(),
  };
}

export function shouldFire(alarm: DepartureAlarm | null, now: Date): DepartureAlarmFire | null {
  if (!alarm || !isValidDate(now)) {
    return null;
  }

  const recommendedDeparture = new Date(alarm.recommendedDepartureIso);

  if (!isValidDate(recommendedDeparture)) {
    return null;
  }

  if (!alarm.fired.departure && now.getTime() >= recommendedDeparture.getTime()) {
    return {
      type: "departure",
      scheduledAt: recommendedDeparture,
      alarm,
    };
  }

  const fiveMinutesBefore = new Date(recommendedDeparture.getTime() - FIVE_MINUTES_MS);

  if (
    !alarm.fired.fiveMinutesBefore &&
    now.getTime() >= fiveMinutesBefore.getTime() &&
    now.getTime() < recommendedDeparture.getTime()
  ) {
    return {
      type: "fiveMinutesBefore",
      scheduledAt: fiveMinutesBefore,
      alarm,
    };
  }

  return null;
}

export function markAlarmFired(alarm: DepartureAlarm, fireType: DepartureAlarmFireType): DepartureAlarm {
  return {
    ...alarm,
    fired: {
      fiveMinutesBefore: fireType === "departure" ? true : alarm.fired.fiveMinutesBefore || fireType === "fiveMinutesBefore",
      departure: alarm.fired.departure || fireType === "departure",
    },
  };
}

export function isDepartureAlarmActive(alarm: DepartureAlarm | null, now = new Date()): boolean {
  if (!alarm || alarm.fired.departure) {
    return false;
  }

  const recommendedDeparture = new Date(alarm.recommendedDepartureIso);

  return isValidDate(recommendedDeparture) && recommendedDeparture.getTime() > now.getTime();
}

export function isMatchingDepartureAlarm(
  alarm: DepartureAlarm | null,
  routeSummary: DepartureAlarmRouteSummary,
  recommendedDeparture: Date,
): boolean {
  if (!alarm || !isValidDate(recommendedDeparture)) {
    return false;
  }

  return alarm.recommendedDepartureIso === recommendedDeparture.toISOString() &&
    alarm.routeSummary.origin === routeSummary.origin.trim() &&
    alarm.routeSummary.destination === routeSummary.destination.trim() &&
    alarm.routeSummary.targetTime === routeSummary.targetTime;
}

export function getDepartureAlarmContent(fire: DepartureAlarmFire): { title: string; body: string } {
  const targetTime = fire.alarm.routeSummary.targetTime;

  return {
    title: "BBARU 출발 알림",
    body: fire.type === "fiveMinutesBefore"
      ? `5분 후 출발하면 ${targetTime} 도착 목표에 맞습니다`
      : `지금 출발하면 ${targetTime} 도착 목표에 맞습니다`,
  };
}

export function readDepartureAlarm(storage = getDepartureAlarmStorage()): DepartureAlarm | null {
  if (!storage) {
    return null;
  }

  try {
    const rawValue = storage.getItem(DEPARTURE_ALARM_STORAGE_KEY);

    return rawValue ? parseStoredDepartureAlarm(JSON.parse(rawValue) as unknown) : null;
  } catch {
    return null;
  }
}

export function writeDepartureAlarm(alarm: DepartureAlarm, storage = getDepartureAlarmStorage()): void {
  if (!storage) {
    return;
  }

  storage.setItem(DEPARTURE_ALARM_STORAGE_KEY, JSON.stringify(alarm));
}

export function clearDepartureAlarm(storage = getDepartureAlarmStorage()): void {
  if (!storage) {
    return;
  }

  storage.removeItem(DEPARTURE_ALARM_STORAGE_KEY);
}

export function getNotificationPermission(): DepartureAlarmPermission {
  if (!canUseNotification()) {
    return "unsupported";
  }

  return window.Notification.permission;
}

export async function requestDepartureNotificationPermission(): Promise<DepartureAlarmPermission> {
  if (!canUseNotification()) {
    return "unsupported";
  }

  if (window.Notification.permission !== "default") {
    return window.Notification.permission;
  }

  try {
    return await window.Notification.requestPermission();
  } catch {
    return window.Notification.permission;
  }
}

export function fireDepartureNotification(fire: DepartureAlarmFire): boolean {
  if (!canUseNotification() || window.Notification.permission !== "granted") {
    return false;
  }

  const content = getDepartureAlarmContent(fire);

  try {
    const notification = new window.Notification(content.title, {
      body: content.body,
      tag: `bbaru-departure-alarm-${fire.type}`,
      renotify: true,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    return true;
  } catch {
    return false;
  }
}

function parseStoredDepartureAlarm(value: unknown): DepartureAlarm | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const routeSummary = record.routeSummary as Record<string, unknown> | undefined;
  const fired = record.fired as Record<string, unknown> | undefined;
  const recommendedDeparture = new Date(String(record.recommendedDepartureIso ?? ""));
  const createdAt = new Date(String(record.createdAtIso ?? ""));

  if (
    !routeSummary ||
    typeof routeSummary.origin !== "string" ||
    typeof routeSummary.destination !== "string" ||
    typeof routeSummary.targetTime !== "string" ||
    !isValidDate(recommendedDeparture)
  ) {
    return null;
  }

  return {
    routeSummary: {
      origin: routeSummary.origin,
      destination: routeSummary.destination,
      targetTime: routeSummary.targetTime,
    },
    recommendedDepartureIso: recommendedDeparture.toISOString(),
    fired: {
      fiveMinutesBefore: Boolean(fired?.fiveMinutesBefore),
      departure: Boolean(fired?.departure),
    },
    createdAtIso: isValidDate(createdAt) ? createdAt.toISOString() : new Date(0).toISOString(),
  };
}

function getDepartureAlarmStorage(): StorageAdapter | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function canUseNotification(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function isValidDate(date: Date): boolean {
  return Number.isFinite(date.getTime());
}
