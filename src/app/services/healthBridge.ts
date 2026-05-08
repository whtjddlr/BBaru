export type HealthWalkingSource = "healthkit" | "health-connect";

export interface HealthWalkingSpeedSummary {
  provider: HealthWalkingSource;
  metersPerMinute: number;
  sampleCount?: number;
  startDate?: string;
  endDate?: string;
  updatedAt: string;
}

export type HealthWalkingSpeedReadResult =
  | {
      ok: true;
      summary: HealthWalkingSpeedSummary;
    }
  | {
      ok: false;
      status: "unavailable" | "permission_denied" | "invalid_data" | "error";
      message: string;
    };

interface NativeHealthBridge {
  isAvailable?: () => boolean | Promise<boolean>;
  requestPermissions?: (permissions: string[]) => boolean | Promise<boolean>;
  readWalkingSpeedSummary?: (options: {
    from: string;
    to: string;
  }) =>
    | Promise<NativeWalkingSpeedPayload | undefined>
    | NativeWalkingSpeedPayload
    | undefined;
  openSettings?: () => void | Promise<void>;
}

interface NativeWalkingSpeedPayload {
  provider?: HealthWalkingSource | string;
  source?: HealthWalkingSource | string;
  metersPerMinute?: number;
  metersPerSecond?: number;
  sampleCount?: number;
  startDate?: string;
  endDate?: string;
  updatedAt?: string;
}

declare global {
  interface Window {
    BBaruHealth?: NativeHealthBridge;
  }
}

const MIN_HEALTH_WALKING_METERS_PER_MINUTE = 15;
const MAX_HEALTH_WALKING_METERS_PER_MINUTE = 175;

export async function readNativeWalkingSpeedSummary(
  days = 30
): Promise<HealthWalkingSpeedReadResult> {
  if (typeof window === "undefined") {
    return {
      ok: false,
      status: "unavailable",
      message: "브라우저 환경에서는 건강 데이터를 직접 읽을 수 없어요.",
    };
  }

  const bridge = window.BBaruHealth;
  const expectedProvider = detectExpectedHealthProvider();

  if (!bridge?.readWalkingSpeedSummary) {
    return {
      ok: false,
      status: "unavailable",
      message: `${getHealthProviderLabel(
        expectedProvider
      )} 연결은 앱으로 빌드했을 때 사용할 수 있어요.`,
    };
  }

  try {
    const isAvailable = bridge.isAvailable ? await bridge.isAvailable() : true;

    if (!isAvailable) {
      return {
        ok: false,
        status: "unavailable",
        message: `${getHealthProviderLabel(expectedProvider)}을 사용할 수 없는 기기예요.`,
      };
    }

    const hasPermission = bridge.requestPermissions
      ? await bridge.requestPermissions(["walkingSpeed", "steps", "distance"])
      : true;

    if (!hasPermission) {
      return {
        ok: false,
        status: "permission_denied",
        message: "건강 데이터 읽기 권한이 필요해요.",
      };
    }

    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const payload = await bridge.readWalkingSpeedSummary({
      from: from.toISOString(),
      to: to.toISOString(),
    });
    const summary = normalizeWalkingSpeedPayload(payload, expectedProvider);

    if (!summary) {
      return {
        ok: false,
        status: "invalid_data",
        message: "최근 보행속도 데이터가 충분하지 않아요.",
      };
    }

    return {
      ok: true,
      summary,
    };
  } catch {
    return {
      ok: false,
      status: "error",
      message: "건강 데이터를 불러오지 못했어요.",
    };
  }
}

export function getHealthProviderLabel(provider?: HealthWalkingSource) {
  if (provider === "healthkit") {
    return "Apple 건강";
  }

  if (provider === "health-connect") {
    return "Health Connect";
  }

  return "건강 데이터";
}

function normalizeWalkingSpeedPayload(
  payload: NativeWalkingSpeedPayload | undefined,
  fallbackProvider: HealthWalkingSource | undefined
): HealthWalkingSpeedSummary | undefined {
  const rawMetersPerMinute =
    Number(payload?.metersPerMinute) ||
    (Number(payload?.metersPerSecond) ? Number(payload?.metersPerSecond) * 60 : undefined);
  const metersPerMinute = clampWalkingSpeed(rawMetersPerMinute);

  if (!metersPerMinute) {
    return undefined;
  }

  return {
    provider: normalizeProvider(payload?.provider ?? payload?.source) ?? fallbackProvider ?? "healthkit",
    metersPerMinute,
    sampleCount: normalizeSampleCount(payload?.sampleCount),
    startDate: payload?.startDate,
    endDate: payload?.endDate,
    updatedAt: payload?.updatedAt ?? new Date().toISOString(),
  };
}

function normalizeProvider(value: unknown): HealthWalkingSource | undefined {
  if (value === "healthkit" || value === "apple-health" || value === "ios") {
    return "healthkit";
  }

  if (value === "health-connect" || value === "android" || value === "google-health-connect") {
    return "health-connect";
  }

  return undefined;
}

function normalizeSampleCount(value: unknown) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return undefined;
  }

  return Math.max(0, Math.round(numberValue));
}

function clampWalkingSpeed(value: unknown) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return undefined;
  }

  return Math.min(
    MAX_HEALTH_WALKING_METERS_PER_MINUTE,
    Math.max(MIN_HEALTH_WALKING_METERS_PER_MINUTE, Math.round(numberValue))
  );
}

function detectExpectedHealthProvider(): HealthWalkingSource | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }

  const platform = `${navigator.userAgent} ${navigator.platform}`.toLowerCase();

  if (/android/.test(platform)) {
    return "health-connect";
  }

  if (/iphone|ipad|ipod|mac/.test(platform)) {
    return "healthkit";
  }

  return undefined;
}
