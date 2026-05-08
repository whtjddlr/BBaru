import {
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertCircle,
  ChevronDown,
  Clock,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation2,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { getNaverMapCredential, loadNaverGeocoderSdk, MapView } from "../MapView";
import {
  DEFAULT_PREFERENCES,
  getEstimatedStepLengthCm,
  type ArrivalStrategy,
  type PlanningMode,
  type RouteIntent,
  type RoutePoint,
  type RoutePreferences,
} from "../../domain/eta";
import {
  resolveKnownPlacePoint,
  searchKnownPlaces,
  type ResolvedPlacePoint,
} from "../../domain/places";
import { createApiUrl } from "../../services/apiBase";
import { getLearnedWalkingSpeed } from "../../services/walkingSpeed";

interface MainScreenProps {
  onRouteSearch: (intent: RouteIntent) => void;
  onOpenProfile: () => void;
}

type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type PlaceField = "origin" | "destination";

interface RoutineRoute {
  id: string;
  origin: string;
  destination: string;
  strategy: ArrivalStrategy;
  fallbackArrivalTime: string;
  weekdayArrivalTimes: Partial<Record<WeekdayIndex, string>>;
}

interface PlaceCandidate extends RoutePoint {
  address?: string;
  roadAddress?: string;
  jibunAddress?: string;
  category?: string;
  source?: string;
}

interface GeocodeResponse {
  point?: PlaceCandidate;
  candidates?: PlaceCandidate[];
}

interface BrowserGeocodeResult {
  candidates: PlaceCandidate[];
  error?: string;
}

const PROFILE_STORAGE_KEY = "bbaru.route-profile.v1";
const ROUTINE_STORAGE_KEY = "bbaru.routines.v1";

const DEFAULT_ROUTINES: RoutineRoute[] = [
  {
    id: "default-namseong-multicampus",
    origin: "남성역",
    destination: "역삼역 멀티 캠퍼스",
    strategy: "balanced",
    fallbackArrivalTime: "09:00",
    weekdayArrivalTimes: {
      1: "09:00",
      2: "09:00",
      3: "09:00",
      4: "09:00",
      5: "09:00",
    },
  },
];

const STRATEGY_OPTIONS: Array<{ value: ArrivalStrategy; label: string; detail: string }> = [
  { value: "balanced", label: "균형", detail: "7분 전" },
  { value: "safe", label: "여유", detail: "15분 전" },
  { value: "ontime", label: "딱 맞춰", detail: "1분 전" },
];

export function MainScreen({ onRouteSearch, onOpenProfile }: MainScreenProps) {
  const todayIndex = getTodayIndex();
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [originPoint, setOriginPoint] = useState<RoutePoint | undefined>();
  const [destinationPoint, setDestinationPoint] = useState<RoutePoint | undefined>();
  const [activePlaceField, setActivePlaceField] = useState<PlaceField>("destination");
  const [suggestions, setSuggestions] = useState<PlaceCandidate[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [placeSearchMessage, setPlaceSearchMessage] = useState("");
  const [planningMode, setPlanningMode] = useState<PlanningMode>("leaveNow");
  const [strategy, setStrategy] = useState<ArrivalStrategy>("balanced");
  const [targetArrivalTime, setTargetArrivalTime] = useState(getDefaultArrivalTime);
  const [preferences, setPreferences] = useState<RoutePreferences>(loadRouteProfile);
  const [routines, setRoutines] = useState<RoutineRoute[]>(loadRoutines);
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const [isSearchOptionsOpen, setIsSearchOptionsOpen] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeQuery = activePlaceField === "origin" ? origin : destination;
  const mapOrigin = useMemo(() => getMapPoint(origin, originPoint), [origin, originPoint]);
  const mapDestination = useMemo(
    () => getMapPoint(destination, destinationPoint),
    [destination, destinationPoint]
  );
  const hasRouteInputs = Boolean(origin.trim() && destination.trim());
  const panelTitle = hasRouteInputs
    ? `${origin.trim()} → ${destination.trim()}`
    : "출발지와 도착지를 검색하세요";

  useEffect(() => {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    window.localStorage.setItem(ROUTINE_STORAGE_KEY, JSON.stringify(routines));
  }, [routines]);

  useEffect(() => {
    const query = activeQuery.trim();
    const knownSuggestions = toCandidates(searchKnownPlaces(query, 6));

    if (!query) {
      setSuggestions([]);
      setIsSearchingPlaces(false);
      setPlaceSearchMessage("");
      return;
    }

    setSuggestions(knownSuggestions);
    setPlaceSearchMessage("");

    if (query.length < 2) {
      setIsSearchingPlaces(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setIsSearchingPlaces(true);
      const addressFirst = isAddressLikeQuery(query);

      const serverSearch = fetchServerGeocode(query, 6, controller.signal)
        .then((payload) => {
          if (controller.signal.aborted) {
            return payload;
          }

          const remoteCandidates = getServerGeocodeCandidates(payload);

          if (remoteCandidates.length > 0) {
            setSuggestions(
              mergeCandidates(
                addressFirst
                  ? [...remoteCandidates, ...knownSuggestions]
                  : [...knownSuggestions, ...remoteCandidates]
              )
            );
            setPlaceSearchMessage("");
          }

          return payload;
        })
        .catch(() => undefined);
      const browserGeocode = geocodeWithNaverMapSdk(query, 6)
        .then((result) => {
          if (!controller.signal.aborted && addressFirst && result.candidates.length > 0) {
            setSuggestions(mergeCandidates([...result.candidates, ...knownSuggestions]));
            setPlaceSearchMessage("");
          }

          return result;
        })
        .catch((searchError) => ({
          candidates: [],
          error: getReadableError(searchError),
        }));

      Promise.all([serverSearch, browserGeocode])
        .then(([payload, browserResult]: [GeocodeResponse | undefined, BrowserGeocodeResult]) => {
          if (controller.signal.aborted) {
            return;
          }

          const browserCandidates = browserResult.candidates;
          const remoteCandidates = getServerGeocodeCandidates(payload);

          setSuggestions(
            (() => {
              const nextSuggestions = mergeCandidates(
              addressFirst
                ? [...remoteCandidates, ...browserCandidates, ...knownSuggestions]
                : [...knownSuggestions, ...remoteCandidates, ...browserCandidates]
              );

              setPlaceSearchMessage(
                nextSuggestions.length === 0
                  ? addressFirst
                    ? browserResult.error
                      ? `도로명 주소 검색 실패: ${browserResult.error}`
                      : "도로명 주소 결과가 없어요. 예: 서울 강남구 테헤란로 212"
                    : "검색 결과가 없어요."
                  : ""
              );

              return nextSuggestions;
            })()
          );
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSuggestions(knownSuggestions);
            setPlaceSearchMessage(
              knownSuggestions.length > 0 ? "" : "검색 결과를 불러오지 못했어요."
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsSearchingPlaces(false);
          }
        });
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [activePlaceField, activeQuery]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    openSearchOptions();
  };

  const submitRoute = async (overrides?: Partial<RouteIntent>) => {
    setError(null);

    const draftOrigin = (overrides?.origin ?? origin).trim();
    const draftDestination = (overrides?.destination ?? destination).trim();
    const draftPlanningMode = overrides?.planningMode ?? planningMode;
    const draftStrategy = overrides?.strategy ?? strategy;
    const draftTargetArrivalTime = overrides?.targetArrivalTime ?? targetArrivalTime;
    const draftOriginPoint = overrides?.originPoint ?? originPoint;
    const draftDestinationPoint = overrides?.destinationPoint ?? destinationPoint;

    if (!draftOrigin || !draftDestination) {
      setError("출발지와 도착지를 모두 입력해주세요.");
      return;
    }

    if (draftPlanningMode === "arriveBy" && !isArrivalTime(draftTargetArrivalTime)) {
      setError("목표 도착 시간을 확인해주세요.");
      return;
    }

    setPlanningMode(draftPlanningMode);
    setStrategy(draftStrategy);
    setTargetArrivalTime(draftTargetArrivalTime);
    setIsSearchOptionsOpen(false);
    setIsSubmitting(true);

    try {
      const [resolvedOrigin, resolvedDestination] = await Promise.all([
        resolveRoutePoint(draftOrigin, draftOriginPoint),
        resolveRoutePoint(draftDestination, draftDestinationPoint),
      ]);

      if (!resolvedOrigin || !resolvedDestination) {
        setError("장소를 찾지 못했어요. 검색 후보에서 장소를 선택하거나 더 정확히 입력해주세요.");
        return;
      }

      setOriginPoint(resolvedOrigin);
      setDestinationPoint(resolvedDestination);
      const effectivePreferences = withLearnedWalkingSpeed(
        preferences,
        draftOrigin,
        draftDestination
      );

      onRouteSearch({
        origin: draftOrigin,
        destination: draftDestination,
        planningMode: draftPlanningMode,
        strategy: draftStrategy,
        targetArrivalTime: draftTargetArrivalTime,
        departureTime: getCurrentTimeValue(),
        preferences: effectivePreferences,
        originPoint: { ...resolvedOrigin, name: draftOrigin },
        destinationPoint: { ...resolvedDestination, name: draftDestination },
      });
    } catch {
      setError("장소 검색 서버를 불러오지 못했어요. 네이버 검색/지도 키를 확인해주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openSearchOptions = () => {
    if (!origin.trim() || !destination.trim()) {
      setError("출발지와 도착지를 모두 입력해주세요.");
      return;
    }

    setError(null);
    setIsPanelExpanded(false);
    setIsSearchOptionsOpen(true);
  };

  const handleUseCurrentLocation = () => {
    setError(null);

    if (!navigator.geolocation) {
      setError("이 브라우저에서는 현재 위치를 사용할 수 없어요.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextOriginPoint: RoutePoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          name: "현재 위치",
          accuracyMeters: position.coords.accuracy,
        };

        setOrigin("현재 위치");
        setOriginPoint(nextOriginPoint);
        setActivePlaceField("destination");
        setIsLocating(false);
      },
      (locationError) => {
        setError(getLocationErrorMessage(locationError));
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: 10_000,
      }
    );
  };

  const applySuggestion = (field: PlaceField, candidate: PlaceCandidate) => {
    if (field === "origin") {
      setOrigin(candidate.name || "");
      setOriginPoint(candidate);
      setActivePlaceField("destination");
      return;
    }

    setDestination(candidate.name || "");
    setDestinationPoint(candidate);
  };

  const handleRoutineSearch = (route: RoutineRoute) => {
    const arrivalTime = getRoutineArrivalTime(route, todayIndex);

    setOrigin(route.origin);
    setDestination(route.destination);
    setPlanningMode("arriveBy");
    setStrategy(route.strategy);
    setTargetArrivalTime(arrivalTime);
    setOriginPoint(undefined);
    setDestinationPoint(undefined);

    void submitRoute({
      origin: route.origin,
      destination: route.destination,
      planningMode: "arriveBy",
      strategy: route.strategy,
      targetArrivalTime: arrivalTime,
    });
  };

  const addRoutine = () => {
    const trimmedOrigin = origin.trim();
    const trimmedDestination = destination.trim();

    if (!trimmedOrigin || !trimmedDestination) {
      setError("루틴으로 저장할 출발지와 도착지를 먼저 입력해주세요.");
      return;
    }

    const nextRoutine: RoutineRoute = {
      id: `routine-${Date.now()}`,
      origin: trimmedOrigin,
      destination: trimmedDestination,
      strategy,
      fallbackArrivalTime: targetArrivalTime,
      weekdayArrivalTimes:
        planningMode === "arriveBy"
          ? {
              1: targetArrivalTime,
              2: targetArrivalTime,
              3: targetArrivalTime,
              4: targetArrivalTime,
              5: targetArrivalTime,
            }
          : {},
    };

    setRoutines((current) => {
      const duplicate = current.some(
        (item) =>
          normalizePlaceName(item.origin) === normalizePlaceName(nextRoutine.origin) &&
          normalizePlaceName(item.destination) === normalizePlaceName(nextRoutine.destination)
      );

      return duplicate ? current : [nextRoutine, ...current];
    });
    setError(null);
    setIsPanelExpanded(true);
  };

  const deleteRoutine = (event: MouseEvent<HTMLButtonElement>, id: string) => {
    event.stopPropagation();
    setRoutines((current) => current.filter((route) => route.id !== id));
  };

  return (
    <div className="w-full h-screen bg-[#E8EDF3] relative overflow-hidden">
      <div className="absolute inset-0">
        <MapView
          origin={mapOrigin}
          destination={mapDestination}
          showRoute={Boolean(mapOrigin && mapDestination)}
        />
      </div>

      <form onSubmit={handleSubmit} className="absolute top-4 left-4 right-4 z-30">
        <div className="rounded-2xl bg-white/95 backdrop-blur border border-neutral-200 shadow-lg overflow-hidden">
          <PlaceInput
            markerClassName="bg-blue-600"
            value={origin}
            onChange={(value) => {
              setOrigin(value);
              setOriginPoint(undefined);
            }}
            onFocus={() => setActivePlaceField("origin")}
            placeholder="출발지 검색"
            rightAction={
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={isLocating}
                aria-label="현재 위치 사용"
                title="현재 위치 사용"
                className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center disabled:opacity-60"
              >
                {isLocating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LocateFixed className="w-4 h-4" />
                )}
              </button>
            }
          />
          <div className="h-px bg-neutral-100 ml-10" />
          <PlaceInput
            markerClassName="bg-red-600"
            value={destination}
            onChange={(value) => {
              setDestination(value);
              setDestinationPoint(undefined);
            }}
            onFocus={() => setActivePlaceField("destination")}
            placeholder="도착지 검색"
            rightAction={<Search className="w-5 h-5 text-neutral-400" />}
          />
        </div>

        <SuggestionPanel
          activeField={activePlaceField}
          query={activeQuery}
          suggestions={suggestions}
          isLoading={isSearchingPlaces}
          message={placeSearchMessage}
          onPick={applySuggestion}
        />

        {error && (
          <div className="mt-2 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-3 shadow-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </form>

      <div className="absolute right-4 top-[154px] z-20 flex flex-col gap-2">
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label="이동 프로필 설정"
          title="이동 프로필 설정"
          className="w-11 h-11 rounded-full bg-white border border-neutral-200 shadow-lg text-neutral-700 flex items-center justify-center hover:bg-neutral-50 active:scale-95 transition"
        >
          <UserRound className="w-5 h-5" />
        </button>
      </div>

      <section
        className={`absolute left-0 right-0 bottom-0 z-30 rounded-t-[26px] bg-white border border-neutral-200 shadow-[0_-12px_36px_rgba(15,23,42,0.16)] transition-[max-height] duration-300 ${
          isPanelExpanded ? "max-h-[66vh]" : isSearchOptionsOpen ? "max-h-[360px]" : "max-h-[214px]"
        }`}
      >
        <button
          type="button"
          onClick={() => setIsPanelExpanded((value) => !value)}
          className="w-full pt-3 pb-2 flex items-center justify-center"
          aria-label={isPanelExpanded ? "패널 접기" : "패널 펼치기"}
        >
          <div className="w-10 h-1 rounded-full bg-neutral-300" />
        </button>

        <div className="px-5 pb-6 overflow-y-auto max-h-[calc(66vh-24px)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-neutral-900 truncate" style={{ fontWeight: 800 }}>
                  {panelTitle}
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  {planningMode === "leaveNow" ? "지금 출발 기준" : `${targetArrivalTime} 도착 목표`} · {getStrategyLabel(strategy)}
                </div>
              </div>
              <button
                type="button"
                onClick={addRoutine}
                className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 hover:bg-blue-100"
                style={{ fontWeight: 800 }}
                aria-label="루틴 추가"
                title="루틴 추가"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {isSearchOptionsOpen ? (
              <SearchTimingPanel
                targetArrivalTime={targetArrivalTime}
                isSubmitting={isSubmitting}
                onTimeChange={setTargetArrivalTime}
                onClose={() => setIsSearchOptionsOpen(false)}
                onLeaveNow={() => void submitRoute({ planningMode: "leaveNow" })}
                onArriveBy={() =>
                  void submitRoute({
                    planningMode: "arriveBy",
                    targetArrivalTime,
                  })
                }
              />
            ) : (
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <button
                  type="button"
                  onClick={openSearchOptions}
                  disabled={isSubmitting}
                  className="h-12 bg-blue-600 text-white rounded-2xl shadow-md hover:bg-blue-700 disabled:opacity-70 transition-colors flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Navigation2 className="w-5 h-5" />
                  )}
                  <span style={{ fontWeight: 800 }}>
                    {isSubmitting ? "경로 찾는 중" : "경로 검색"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPanelExpanded((value) => !value)}
                  className="w-12 h-12 rounded-2xl border border-neutral-200 bg-white text-neutral-600 flex items-center justify-center"
                  aria-label="상세 열기"
                >
                  <ChevronDown
                    className={`w-5 h-5 transition-transform ${isPanelExpanded ? "rotate-180" : ""}`}
                  />
                </button>
              </div>
            )}

            {isPanelExpanded && (
              <>
                <Disclosure
                  title="경로 기준"
                  caption={getStrategyLabel(strategy)}
                  isOpen={isOptionsOpen}
                  onToggle={() => setIsOptionsOpen((value) => !value)}
                >
                  <div className="grid grid-cols-3 gap-2">
                    {STRATEGY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setStrategy(option.value)}
                        className={`min-h-[54px] rounded-lg border px-2 py-2 text-sm ${
                          strategy === option.value
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-neutral-200 bg-white text-neutral-700"
                        }`}
                      >
                        <div style={{ fontWeight: 800 }}>{option.label}</div>
                        <div className="mt-0.5 text-[11px] opacity-70">{option.detail}</div>
                      </button>
                    ))}
                  </div>
                </Disclosure>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base text-neutral-900" style={{ fontWeight: 800 }}>
                      루틴 경로
                    </h2>
                    <button
                      type="button"
                      onClick={addRoutine}
                      className="h-8 px-2.5 rounded-full bg-neutral-100 text-neutral-600 text-xs flex items-center gap-1"
                      style={{ fontWeight: 800 }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      추가
                    </button>
                  </div>
                  {routines.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-500">
                      저장된 루틴이 없어요. 출발지와 도착지를 입력한 뒤 루틴을 눌러 저장하세요.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {routines.map((route) => (
                        <RoutineCard
                          key={route.id}
                          route={route}
                          arrivalTime={getRoutineArrivalTime(route, todayIndex)}
                          onSearch={() => handleRoutineSearch(route)}
                          onDelete={(event) => deleteRoutine(event, route.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>

              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function PlaceInput({
  markerClassName,
  value,
  onChange,
  onFocus,
  placeholder,
  rightAction,
}: {
  markerClassName: string;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  placeholder: string;
  rightAction: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className={`w-3 h-3 rounded-full ${markerClassName}`} />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent outline-none text-neutral-900 placeholder:text-neutral-400"
      />
      {rightAction}
    </div>
  );
}

function SuggestionPanel({
  activeField,
  query,
  suggestions,
  isLoading,
  message,
  onPick,
}: {
  activeField: PlaceField;
  query: string;
  suggestions: PlaceCandidate[];
  isLoading: boolean;
  message: string;
  onPick: (field: PlaceField, candidate: PlaceCandidate) => void;
}) {
  const shouldShow =
    query.trim().length > 0 && (suggestions.length > 0 || isLoading || Boolean(message));

  if (!shouldShow) {
    return null;
  }

  return (
    <div className="mt-2 rounded-2xl border border-neutral-200 bg-white/95 backdrop-blur shadow-lg overflow-hidden">
      {isLoading && (
        <div className="flex items-center gap-2 px-4 py-3 text-xs text-neutral-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          장소 찾는 중
        </div>
      )}
      <div className="max-h-56 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {!isLoading && suggestions.length === 0 && message && (
          <div className="px-4 py-3 text-sm text-neutral-500">{message}</div>
        )}
        {suggestions.map((candidate) => (
          <button
            key={`${candidate.name}-${candidate.lat}-${candidate.lng}`}
            type="button"
            onClick={() => onPick(activeField, candidate)}
            className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-neutral-50"
          >
            <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm text-neutral-900 truncate" style={{ fontWeight: 800 }}>
                {candidate.name}
              </div>
              {getCandidateSubtext(candidate) && (
                <div className="text-xs text-neutral-500 truncate">
                  {getCandidateSubtext(candidate)}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SearchTimingPanel({
  targetArrivalTime,
  isSubmitting,
  onTimeChange,
  onClose,
  onLeaveNow,
  onArriveBy,
}: {
  targetArrivalTime: string;
  isSubmitting: boolean;
  onTimeChange: (value: string) => void;
  onClose: () => void;
  onLeaveNow: () => void;
  onArriveBy: () => void;
}) {
  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-sm text-blue-950" style={{ fontWeight: 800 }}>
            언제 기준으로 검색할까요?
          </div>
          <div className="text-xs text-blue-700 mt-0.5">
            경로 검색 전에 시간 기준만 고르면 됩니다.
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-8 px-2 rounded-lg text-xs text-blue-700 hover:bg-blue-100"
          style={{ fontWeight: 800 }}
        >
          닫기
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onLeaveNow}
          disabled={isSubmitting}
          className="rounded-xl bg-blue-600 px-3 py-3 text-left text-white shadow-sm disabled:opacity-70"
        >
          <div className="text-sm" style={{ fontWeight: 800 }}>
            지금 출발
          </div>
          <div className="text-xs text-white/80 mt-1">현재 시각 기준</div>
        </button>

        <div className="rounded-xl bg-white border border-blue-100 p-3">
          <label className="flex items-center gap-2 text-xs text-neutral-500 mb-2">
            <Clock className="w-3.5 h-3.5" />
            도착 시간
          </label>
          <input
            type="time"
            value={targetArrivalTime}
            onChange={(event) => onTimeChange(event.target.value)}
            className="w-full bg-transparent outline-none text-lg text-neutral-950 tabular-nums"
            aria-label="목표 도착 시간"
          />
          <button
            type="button"
            onClick={onArriveBy}
            disabled={isSubmitting}
            className="mt-2 w-full h-8 rounded-lg bg-neutral-900 text-xs text-white disabled:opacity-70"
            style={{ fontWeight: 800 }}
          >
            맞춰 검색
          </button>
        </div>
      </div>
    </div>
  );
}

function RoutineCard({
  route,
  arrivalTime,
  onSearch,
  onDelete,
}: {
  route: RoutineRoute;
  arrivalTime: string;
  onSearch: () => void;
  onDelete: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onSearch} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2 text-sm text-neutral-900 truncate" style={{ fontWeight: 800 }}>
            <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
            {route.origin}
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm text-neutral-900 truncate" style={{ fontWeight: 800 }}>
            <span className="w-2 h-2 rounded-full bg-red-600 shrink-0" />
            {route.destination}
          </div>
          <div className="mt-2 text-xs text-neutral-500">평일 {arrivalTime} 도착</div>
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="루틴 삭제"
          className="w-9 h-9 rounded-full bg-neutral-100 text-neutral-500 flex items-center justify-center hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function Disclosure({
  title,
  caption,
  isOpen,
  onToggle,
  children,
  icon,
}: {
  title: string;
  caption: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-4 text-left"
      >
        <div className="min-w-0 flex items-center gap-2">
          {icon}
          <div className="min-w-0">
            <div className="text-sm text-neutral-900" style={{ fontWeight: 800 }}>
              {title}
            </div>
            <div className="text-xs text-neutral-500 truncate">{caption}</div>
          </div>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-neutral-500 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      {isOpen && <div className="px-4 pb-4 border-t border-neutral-100 pt-4">{children}</div>}
    </section>
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
          className="w-full bg-transparent outline-none text-lg text-neutral-950 tabular-nums"
        />
        <span className="text-sm text-neutral-500">{suffix}</span>
      </div>
    </label>
  );
}

async function resolveRoutePoint(name: string, currentPoint?: RoutePoint) {
  const knownPoint = resolveKnownPlacePoint(name, currentPoint);

  if (knownPoint) {
    return { ...knownPoint, name };
  }

  if (isAddressLikeQuery(name)) {
    const serverPoint = await fetchServerGeocodePoint(name);

    if (serverPoint) {
      return {
        ...serverPoint,
        name: serverPoint.name || name,
      };
    }
  }

  const browserResult = await geocodeWithNaverMapSdk(name, 1);
  const browserCandidates = browserResult.candidates;

  if (isAddressLikeQuery(name) && browserCandidates[0]) {
    return {
      ...browserCandidates[0],
      name: browserCandidates[0].name || name,
    };
  }

  const payload = await fetchServerGeocode(name, 1);
  const point = payload?.point ?? payload?.candidates?.[0];

  if (!point) {
    const fallbackPoint = browserCandidates[0];

    return fallbackPoint
      ? {
          ...fallbackPoint,
          name: fallbackPoint.name || name,
        }
      : undefined;
  }

  return {
    ...point,
    name: point.name || name,
  };
}

async function fetchServerGeocodePoint(name: string) {
  const payload = await fetchServerGeocode(name, 1);

  return payload?.point ?? payload?.candidates?.[0];
}

async function fetchServerGeocode(query: string, limit: number, signal?: AbortSignal) {
  const response = await fetch(createApiUrl("/api/maps/geocode"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit }),
    signal,
  });

  if (!response.ok) {
    return undefined;
  }

  return (await response.json()) as GeocodeResponse;
}

function getServerGeocodeCandidates(payload: GeocodeResponse | undefined) {
  return [
    ...(payload?.candidates ?? []),
    ...(payload?.point ? [payload.point] : []),
  ];
}


async function geocodeWithNaverMapSdk(
  query: string,
  limit: number
): Promise<BrowserGeocodeResult> {
  const credential = getNaverMapCredential();
  const trimmedQuery = query.trim();

  if (!credential || !trimmedQuery || typeof window === "undefined") {
    return {
      candidates: [],
      error: !credential ? "네이버 지도 키가 없어요." : "브라우저에서만 주소 검색이 가능해요.",
    };
  }

  try {
    const naver = await loadNaverGeocoderSdk(
      credential,
      import.meta.env.VITE_NAVER_MAP_SUBMODULES
    );
    const geocode = naver?.maps?.Service?.geocode;

    if (typeof geocode !== "function") {
      return {
        candidates: [],
        error: "geocoder 모듈이 로드되지 않았어요.",
      };
    }

    const queryResults = await requestNaverGeocode(naver, geocode, { query: trimmedQuery }, limit);

    if (queryResults.candidates.length > 0) {
      return queryResults;
    }

    const addressResults = await requestNaverGeocode(
      naver,
      geocode,
      { address: trimmedQuery },
      limit
    );

    if (addressResults.candidates.length > 0) {
      return addressResults;
    }

    return {
      candidates: [],
      error: addressResults.error || queryResults.error,
    };
  } catch (searchError) {
    return {
      candidates: [],
      error: getReadableError(searchError),
    };
  }
}

function requestNaverGeocode(
  naver: any,
  geocode: (options: Record<string, string>, callback: (status: unknown, response: any) => void) => void,
  options: Record<string, string>,
  limit: number
) {
  return new Promise<BrowserGeocodeResult>((resolve) => {
    let isSettled = false;
    const timeoutId = window.setTimeout(() => {
      isSettled = true;
      resolve({
        candidates: [],
        error: "주소 검색 응답이 지연되고 있어요.",
      });
    }, 1800);
    const settle = (result: BrowserGeocodeResult) => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      window.clearTimeout(timeoutId);
      resolve(result);
    };

    geocode(options, (status: unknown, response: any) => {
      const okStatus = naver.maps.Service.Status.OK;

      if (status !== okStatus) {
        settle({
          candidates: [],
          error: getNaverGeocodeError(status, response),
        });
        return;
      }

      const addresses = Array.isArray(response?.v2?.addresses) ? response.v2.addresses : [];
      const fallbackName = options.query || options.address || "";

      settle(
        {
          candidates: addresses
            .slice(0, limit)
            .map((address: any) => {
              const roadAddress = String(address.roadAddress || "").trim();
              const jibunAddress = String(address.jibunAddress || "").trim();
              const name = roadAddress || jibunAddress || fallbackName;

              return {
                lat: Number(address.y),
                lng: Number(address.x),
                name,
                address: roadAddress && jibunAddress ? jibunAddress : roadAddress || jibunAddress,
                roadAddress,
                jibunAddress,
                category: roadAddress ? "도로명 주소" : "지번 주소",
                source: "naver-map-sdk-geocoder",
              };
            })
            .filter((candidate: PlaceCandidate) =>
              Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng)
            ),
        }
      );
    });
  });
}

function getNaverGeocodeError(status: unknown, response: any) {
  const statusText = String(status ?? "unknown");
  const message =
    response?.v2?.errorMessage ||
    response?.error?.message ||
    response?.errorMessage ||
    response?.message ||
    "";

  return message ? `웹 지오코더 ${statusText} · ${message}` : `웹 지오코더 ${statusText}`;
}

function getReadableError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "웹 지오코더 호출 실패";
}

function getMapPoint(name: string, point?: RoutePoint) {
  const resolvedPoint = resolveKnownPlacePoint(name, point ? { ...point, name } : undefined);

  if (!resolvedPoint) {
    return undefined;
  }

  return {
    lat: resolvedPoint.lat,
    lng: resolvedPoint.lng,
    name: resolvedPoint.name || name,
  };
}

function toCandidates(points: ResolvedPlacePoint[]): PlaceCandidate[] {
  return points.map((point) => ({
    lat: point.lat,
    lng: point.lng,
    name: point.name,
    source: point.isApproximate ? "known-place" : "coordinate",
  }));
}

function mergeCandidates(candidates: PlaceCandidate[]) {
  const unique: PlaceCandidate[] = [];

  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) {
      continue;
    }

    const identity = candidate.roadAddress || candidate.address || candidate.name;
    const key = `${identity}:${candidate.lat.toFixed(6)}:${candidate.lng.toFixed(6)}`;
    const exists = unique.some(
      (item) =>
        `${item.roadAddress || item.address || item.name}:${item.lat.toFixed(6)}:${item.lng.toFixed(6)}` ===
        key
    );

    if (!exists) {
      unique.push(candidate);
    }
  }

  return unique.slice(0, 8);
}

function getCandidateSubtext(candidate: PlaceCandidate) {
  const values = [
    candidate.roadAddress,
    candidate.jibunAddress,
    candidate.address,
    candidate.category,
  ]
    .map((value) => String(value || "").trim())
    .filter((value) => value && value !== candidate.name);
  const uniqueValues = values.filter((value, index) => values.indexOf(value) === index);

  return uniqueValues.slice(0, 2).join(" · ");
}

function isAddressLikeQuery(query: string) {
  const normalized = query.trim();

  if (!normalized) {
    return false;
  }

  return (
    /\d/.test(normalized) ||
    /(로|길|대로|번길|가|동|읍|면|리)\s*\d/.test(normalized) ||
    /\b\d{1,5}-\d{1,5}\b/.test(normalized)
  );
}

function loadRouteProfile(): RoutePreferences {
  if (typeof window === "undefined") {
    return { ...DEFAULT_PREFERENCES };
  }

  try {
    const saved = window.localStorage.getItem(PROFILE_STORAGE_KEY);

    if (!saved) {
      return { ...DEFAULT_PREFERENCES };
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
      ...DEFAULT_PREFERENCES,
      ...parsed,
      walkingPace: "normal",
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
    return { ...DEFAULT_PREFERENCES };
  }
}

function withLearnedWalkingSpeed(
  preferences: RoutePreferences,
  origin: string,
  destination: string
): RoutePreferences {
  const learnedSpeed = getLearnedWalkingSpeed(origin, destination);
  const {
    learnedWalkingMetersPerMinute: _storedMetersPerMinute,
    learnedWalkingConfidence: _storedConfidence,
    ...basePreferences
  } = preferences;

  return {
    ...basePreferences,
    walkingPace: "normal",
    ...(learnedSpeed
      ? {
          learnedWalkingMetersPerMinute: learnedSpeed.metersPerMinute,
          learnedWalkingConfidence: learnedSpeed.confidence,
        }
      : {}),
  };
}

function loadRoutines(): RoutineRoute[] {
  if (typeof window === "undefined") {
    return DEFAULT_ROUTINES;
  }

  try {
    const saved = window.localStorage.getItem(ROUTINE_STORAGE_KEY);

    if (!saved) {
      return DEFAULT_ROUTINES;
    }

    const parsed = JSON.parse(saved) as RoutineRoute[];

    return Array.isArray(parsed) ? parsed : DEFAULT_ROUTINES;
  } catch {
    return DEFAULT_ROUTINES;
  }
}

function getTodayIndex(): WeekdayIndex {
  return new Date().getDay() as WeekdayIndex;
}

function getRoutineArrivalTime(route: RoutineRoute, weekday: WeekdayIndex) {
  return route.weekdayArrivalTimes[weekday] ?? route.fallbackArrivalTime;
}

function getStrategyLabel(value: ArrivalStrategy) {
  return STRATEGY_OPTIONS.find((option) => option.value === value)?.label ?? "균형";
}

function isArrivalTime(value?: string) {
  return Boolean(value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
}

function getDefaultArrivalTime(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30);

  return formatTimeValue(now);
}

function getCurrentTimeValue(): string {
  return formatTimeValue(new Date());
}

function formatTimeValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

function getLocationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return "위치 권한이 거절되었어요. 브라우저 권한을 허용하거나 출발지를 직접 입력해주세요.";
  }

  if (error.code === error.POSITION_UNAVAILABLE) {
    return "현재 위치를 가져오지 못했어요. 잠시 후 다시 시도해주세요.";
  }

  if (error.code === error.TIMEOUT) {
    return "현재 위치 확인 시간이 초과되었어요. 다시 시도해주세요.";
  }

  return "현재 위치를 사용할 수 없어요. 출발지를 직접 입력해주세요.";
}

function normalizePlaceName(value: string) {
  return value.trim().replace(/\s+/g, "").toLowerCase();
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
