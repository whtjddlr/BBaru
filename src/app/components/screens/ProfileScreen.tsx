import { useEffect, useState } from "react";
import { ArrowLeft, Footprints, RotateCcw, Ruler, UserRound } from "lucide-react";
import {
  DEFAULT_PREFERENCES,
  getEstimatedStepLengthCm,
  type RoutePreferences,
} from "../../domain/eta";
import {
  getFallbackWalkingMetersPerMinute,
  getLearnedWalkingSpeed,
  resetLearnedWalkingSpeed,
  type LearnedWalkingSpeed,
} from "../../services/walkingSpeed";
import {
  getHealthProviderLabel,
  readNativeWalkingSpeedSummary,
} from "../../services/healthBridge";

interface ProfileScreenProps {
  onBack: () => void;
}

const PROFILE_STORAGE_KEY = "bbaru.route-profile.v1";

export function ProfileScreen({ onBack }: ProfileScreenProps) {
  const [preferences, setPreferences] = useState<RoutePreferences>(loadRouteProfile);
  const [learnedSpeed, setLearnedSpeed] = useState<LearnedWalkingSpeed | undefined>(() =>
    getLearnedWalkingSpeed()
  );
  const [healthMessage, setHealthMessage] = useState("");
  const [isSyncingHealth, setIsSyncingHealth] = useState(false);
  const fallbackWalkingSpeed = getFallbackWalkingMetersPerMinute(preferences);
  const appliedWalkingSpeed =
    preferences.manualWalkingMetersPerMinute ??
    preferences.healthWalkingMetersPerMinute ??
    learnedSpeed?.metersPerMinute ??
    fallbackWalkingSpeed;
  const appliedSource = preferences.manualWalkingMetersPerMinute
    ? "직접 입력"
    : preferences.healthWalkingMetersPerMinute
    ? getHealthProviderLabel(preferences.healthWalkingSource)
    : learnedSpeed
    ? "GPS 학습"
    : "보폭 계산";

  useEffect(() => {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  const updatePreference = <Key extends keyof RoutePreferences>(
    key: Key,
    value: RoutePreferences[Key]
  ) => {
    setPreferences((current) => ({ ...current, walkingPace: "normal", [key]: value }));
  };

  const handleResetLearning = () => {
    resetLearnedWalkingSpeed();
    setLearnedSpeed(undefined);
  };

  const handleUseAutomaticWalkingSpeed = () => {
    updatePreference("manualWalkingMetersPerMinute", undefined);
  };

  const handleSyncHealthSpeed = async () => {
    setIsSyncingHealth(true);
    setHealthMessage("");

    const result = await readNativeWalkingSpeedSummary();

    if (result.ok) {
      setPreferences((current) => ({
        ...current,
        walkingPace: "normal",
        healthWalkingMetersPerMinute: result.summary.metersPerMinute,
        healthWalkingSource: result.summary.provider,
        healthWalkingUpdatedAt: result.summary.updatedAt,
      }));
      setHealthMessage(
        `${getHealthProviderLabel(result.summary.provider)}에서 ${Math.round(
          result.summary.metersPerMinute
        )}m/분을 가져왔어요.`
      );
    } else {
      setHealthMessage(result.message);
    }

    setIsSyncingHealth(false);
  };

  const handleClearHealthSpeed = () => {
    setPreferences((current) => ({
      ...current,
      healthWalkingMetersPerMinute: undefined,
      healthWalkingSource: undefined,
      healthWalkingUpdatedAt: undefined,
    }));
    setHealthMessage("");
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#F8F9FB]">
      <header className="border-b border-neutral-200 bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="뒤로"
            className="-ml-2 rounded-xl p-2 hover:bg-neutral-100"
          >
            <ArrowLeft className="h-5 w-5 text-neutral-900" />
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg text-neutral-950" style={{ fontWeight: 900 }}>
              이동 프로필
            </h1>
            <p className="mt-0.5 text-xs text-neutral-500">
              도보 시간 계산에 쓰는 기본값과 학습된 평균입니다.
            </p>
          </div>
        </div>
      </header>

      <main className="absolute inset-x-0 bottom-0 top-[73px] overflow-y-auto px-5 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="space-y-4">
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Ruler className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm text-neutral-900" style={{ fontWeight: 900 }}>
                기본 보행 정보
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="키"
                value={preferences.heightCm}
                suffix="cm"
                min={120}
                max={220}
                onChange={(value) => updatePreference("heightCm", value)}
              />
              <NumberField
                label="보폭"
                value={preferences.stepLengthCm}
                suffix="cm"
                min={45}
                max={95}
                onChange={(value) => updatePreference("stepLengthCm", value)}
              />
            </div>
            <button
              type="button"
              onClick={() =>
                updatePreference(
                  "stepLengthCm",
                  getEstimatedStepLengthCm(preferences.heightCm)
                )
              }
              className="mt-3 h-11 w-full rounded-xl bg-neutral-100 text-sm text-neutral-800"
              style={{ fontWeight: 900 }}
            >
              키 기준 보폭 자동 계산
            </button>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Footprints className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm text-neutral-900" style={{ fontWeight: 900 }}>
                  평균 보행속도
                </h2>
              </div>
              {learnedSpeed && (
                <button
                  type="button"
                  onClick={handleResetLearning}
                  className="flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1.5 text-xs text-neutral-700"
                  style={{ fontWeight: 800 }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  초기화
                </button>
              )}
            </div>

            <div className="mb-3 rounded-2xl border border-blue-100 bg-blue-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-blue-700">현재 적용 속도</div>
                  <div className="text-2xl text-blue-950 tabular-nums" style={{ fontWeight: 950 }}>
                    {Math.round(appliedWalkingSpeed)}
                    <span className="ml-1 text-sm">m/분</span>
                  </div>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs text-blue-700" style={{ fontWeight: 900 }}>
                  {appliedSource}
                </span>
              </div>
              <NumberField
                label="직접 입력"
                value={preferences.manualWalkingMetersPerMinute ?? fallbackWalkingSpeed}
                suffix="m/분"
                min={15}
                max={175}
                onChange={(value) => updatePreference("manualWalkingMetersPerMinute", value)}
              />
              {preferences.manualWalkingMetersPerMinute && (
                <button
                  type="button"
                  onClick={handleUseAutomaticWalkingSpeed}
                  className="mt-2 h-10 w-full rounded-xl bg-white text-sm text-blue-700"
                  style={{ fontWeight: 900 }}
                >
                  자동값 사용
                </button>
              )}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleSyncHealthSpeed}
                  disabled={isSyncingHealth}
                  className="h-10 rounded-xl bg-blue-600 px-3 text-sm text-white disabled:opacity-60"
                  style={{ fontWeight: 900 }}
                >
                  {isSyncingHealth ? "가져오는 중" : "건강 앱 연동"}
                </button>
                <button
                  type="button"
                  onClick={handleClearHealthSpeed}
                  disabled={!preferences.healthWalkingMetersPerMinute}
                  className="h-10 rounded-xl bg-white px-3 text-sm text-blue-700 disabled:text-neutral-400"
                  style={{ fontWeight: 900 }}
                >
                  건강값 제거
                </button>
              </div>
              {preferences.healthWalkingMetersPerMinute && (
                <p className="mt-2 text-xs leading-5 text-blue-700">
                  {getHealthProviderLabel(preferences.healthWalkingSource)} 기준{" "}
                  {Math.round(preferences.healthWalkingMetersPerMinute)}m/분
                  {preferences.healthWalkingUpdatedAt
                    ? ` · ${formatUpdatedAt(preferences.healthWalkingUpdatedAt)}`
                    : ""}
                </p>
              )}
              {healthMessage && (
                <p className="mt-2 text-xs leading-5 text-blue-700">{healthMessage}</p>
              )}
            </div>

            {learnedSpeed ? (
              <div className="space-y-3">
                <div className="rounded-2xl bg-blue-50 p-4 text-blue-950">
                  <div className="text-xs text-blue-700">안내 중 GPS로 학습한 평균</div>
                  <div className="mt-1 text-3xl tabular-nums" style={{ fontWeight: 950 }}>
                    {Math.round(learnedSpeed.metersPerMinute)}
                    <span className="ml-1 text-base">m/분</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <ProfileMetric label="샘플" value={`${learnedSpeed.sampleCount}개`} />
                  <ProfileMetric
                    label="신뢰도"
                    value={formatConfidence(learnedSpeed.confidence)}
                  />
                  <ProfileMetric
                    label="기준"
                    value={learnedSpeed.source === "route" ? "이 경로" : "전체"}
                  />
                </div>
                <p className="text-xs leading-5 text-neutral-500">
                  다음 경로 검색부터 도보 구간 시간에 이 평균을 먼저 반영합니다.
                  업데이트 {formatUpdatedAt(learnedSpeed.updatedAt)}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl bg-neutral-50 p-4">
                <div className="text-base text-neutral-950" style={{ fontWeight: 900 }}>
                  아직 학습된 속도가 없어요
                </div>
                <p className="mt-1 text-sm leading-6 text-neutral-500">
                  안내를 시작하고 실제로 걸으면 GPS 오차가 낮은 구간만 골라 평균을
                  쌓습니다. 정지하거나 대기한 시간은 평균에서 제외합니다.
                </p>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm text-neutral-900" style={{ fontWeight: 900 }}>
              계산 여유
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="환승 여유"
                value={preferences.transferBufferMinutes}
                suffix="분"
                min={0}
                max={15}
                onChange={(value) => updatePreference("transferBufferMinutes", value)}
              />
              <NumberField
                label="신호 여유"
                value={preferences.signalBufferMinutes}
                suffix="분"
                min={0}
                max={10}
                onChange={(value) => updatePreference("signalBufferMinutes", value)}
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function ProfileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 px-3 py-2">
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div className="mt-0.5 truncate text-sm text-neutral-950" style={{ fontWeight: 900 }}>
        {value}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  suffix,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
      <span className="text-xs text-neutral-500">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(clampNumber(event.target.value, min, max, value))}
          className="w-full bg-transparent text-lg tabular-nums text-neutral-950 outline-none"
        />
        <span className="text-sm text-neutral-500">{suffix}</span>
      </div>
    </label>
  );
}

function loadRouteProfile(): RoutePreferences {
  if (typeof window === "undefined") {
    return { ...DEFAULT_PREFERENCES, walkingPace: "normal" };
  }

  try {
    const saved = window.localStorage.getItem(PROFILE_STORAGE_KEY);

    if (!saved) {
      return { ...DEFAULT_PREFERENCES, walkingPace: "normal" };
    }

    const parsed = JSON.parse(saved) as Partial<RoutePreferences>;
    const heightCm = clampNumber(
      parsed.heightCm,
      120,
      220,
      DEFAULT_PREFERENCES.heightCm
    );
    const stepLengthCm = clampNumber(
      parsed.stepLengthCm,
      45,
      95,
      getEstimatedStepLengthCm(heightCm)
    );

    return {
      walkingPace: "normal",
      transferBufferMinutes: clampNumber(
        parsed.transferBufferMinutes,
        0,
        15,
        DEFAULT_PREFERENCES.transferBufferMinutes
      ),
      signalBufferMinutes: clampNumber(
        parsed.signalBufferMinutes,
        0,
        10,
        DEFAULT_PREFERENCES.signalBufferMinutes
      ),
      manualWalkingMetersPerMinute: clampOptionalNumber(
        parsed.manualWalkingMetersPerMinute,
        15,
        175
      ),
      healthWalkingMetersPerMinute: clampOptionalNumber(
        parsed.healthWalkingMetersPerMinute,
        15,
        175
      ),
      healthWalkingSource: isHealthWalkingSource(parsed.healthWalkingSource)
        ? parsed.healthWalkingSource
        : undefined,
      healthWalkingUpdatedAt:
        typeof parsed.healthWalkingUpdatedAt === "string"
          ? parsed.healthWalkingUpdatedAt
          : undefined,
      heightCm,
      stepLengthCm,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES, walkingPace: "normal" };
  }
}

function formatConfidence(confidence: number) {
  return `${Math.round(confidence * 100)}%`;
}

function formatUpdatedAt(value: string) {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "방금";
  }

  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));

  if (minutes < 1) {
    return "방금";
  }

  if (minutes < 60) {
    return `${minutes}분 전`;
  }

  return `${Math.round(minutes / 60)}시간 전`;
}

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, Math.round(numberValue)));
}

function clampOptionalNumber(value: unknown, minimum: number, maximum: number) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return undefined;
  }

  return Math.min(maximum, Math.max(minimum, Math.round(numberValue)));
}

function isHealthWalkingSource(value: unknown) {
  return value === "healthkit" || value === "health-connect";
}
