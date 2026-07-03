import { type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Search, Clock, MapPin, TrendingUp, Navigation2, Smartphone, X } from "lucide-react";
import { useRouteState } from "../../context/RouteContext";
import { formatDurationCompact, GeoPoint } from "../../lib/eta";
import { searchPois, TmapPoi } from "../../lib/tmap";
import { useInstallPrompt } from "../../lib/useInstallPrompt";

type PoiSuggestionStatus = "idle" | "loading" | "success" | "empty";

export function MainScreen() {
  const navigate = useNavigate();
  const { recentRoutes, searchRequest, startSearch } = useRouteState();
  const [origin, setOrigin] = useState(searchRequest?.origin ?? "");
  const [destination, setDestination] = useState(searchRequest?.destination ?? "");
  const [originPoint, setOriginPoint] = useState<GeoPoint | undefined>(searchRequest?.originPoint);
  const [destinationPoint, setDestinationPoint] = useState<GeoPoint | undefined>(searchRequest?.destinationPoint);
  const [targetTime, setTargetTime] = useState(searchRequest?.targetTime ?? getDefaultTargetTime());
  const originSuggestions = usePoiSuggestions(origin, originPoint);
  const destinationSuggestions = usePoiSuggestions(destination, destinationPoint);
  const installPrompt = useInstallPrompt();
  const sameRoute = origin.trim().length > 0 &&
    destination.trim().length > 0 &&
    origin.trim().toLowerCase() === destination.trim().toLowerCase();
  const canSearch = origin.trim().length > 0 && destination.trim().length > 0 && !sameRoute;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSearch) {
      return;
    }

    startSearch({ origin, destination, targetTime, originPoint, destinationPoint });
    navigate("/route");
  };

  return (
    <main className="flex h-full min-h-0 w-full flex-col bg-[#F8F9FB]">
      <header className="shrink-0 border-b border-neutral-200 bg-white">
        <div className="px-5 py-6">
          <h1 className="mb-1 text-3xl font-bold text-[#1E40AF]">BBARU</h1>
          <p className="text-sm text-neutral-600">정시 도착 최적화</p>
        </div>
      </header>

      <section aria-labelledby="route-search-title" className="shrink-0 px-5 py-4">
        <h2 id="route-search-title" className="sr-only">경로 검색</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <PoiField
            id="origin-input"
            label="출발지"
            placeholder="출발지를 입력하세요"
            value={origin}
            point={originPoint}
            suggestions={originSuggestions.items}
            suggestionStatus={originSuggestions.status}
            markerClassName="bg-blue-600"
            icon={<MapPin className="size-5 text-neutral-400" aria-hidden="true" />}
            onChange={(value) => {
              setOrigin(value);
              setOriginPoint(undefined);
            }}
            onSelect={(poi) => {
              setOrigin(poi.name);
              setOriginPoint(poi.point);
            }}
          />

          <PoiField
            id="destination-input"
            label="도착지"
            placeholder="도착지를 입력하세요"
            value={destination}
            point={destinationPoint}
            suggestions={destinationSuggestions.items}
            suggestionStatus={destinationSuggestions.status}
            markerClassName="bg-red-600"
            icon={<Search className="size-5 text-neutral-400" aria-hidden="true" />}
            onChange={(value) => {
              setDestination(value);
              setDestinationPoint(undefined);
            }}
            onSelect={(poi) => {
              setDestination(poi.name);
              setDestinationPoint(poi.point);
            }}
          />

          <label className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
            <Clock className="size-5 text-blue-600" aria-hidden="true" />
            <span className="mr-2 text-sm text-neutral-600">목표 도착 시각</span>
            <input
              type="time"
              value={targetTime}
              onChange={(event) => setTargetTime(event.target.value)}
              className="flex-1 bg-transparent text-lg font-semibold tabular-nums text-neutral-900 outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={!canSearch}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-4 font-semibold text-white shadow-lg transition-colors ${
              canSearch ? "bg-blue-600 hover:bg-blue-700" : "cursor-not-allowed bg-neutral-300 shadow-none"
            }`}
          >
            <Navigation2 className="size-5" aria-hidden="true" />
            <span>경로 검색</span>
          </button>
          {sameRoute && (
            <p role="status" aria-live="polite" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
              출발지와 도착지가 같습니다. 다른 도착지를 입력하세요.
            </p>
          )}
        </form>
      </section>

      <section aria-labelledby="recent-routes-title" className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
        <div className="mb-4">
          <h2 id="recent-routes-title" className="mb-3 text-lg font-semibold text-neutral-900">최근 경로</h2>
          <div className="flex flex-col gap-3">
            {recentRoutes.length === 0 ? (
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                <p className="text-sm text-neutral-500">아직 저장된 최근 경로가 없습니다.</p>
              </div>
            ) : (
              recentRoutes.map((route) => (
                <button
                  key={`${route.origin}-${route.destination}-${route.updatedAt}`}
                  type="button"
                  onClick={() => {
                    startSearch(route);
                    navigate("/route");
                  }}
                  className="w-full rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="size-2 rounded-full bg-blue-600" aria-hidden="true" />
                        <span className="text-sm font-semibold text-neutral-900">{route.origin}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-red-600" aria-hidden="true" />
                        <span className="text-sm font-semibold text-neutral-900">{route.destination}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="mb-1 text-xs text-neutral-500">목표 도착</div>
                      <div className="text-lg font-bold tabular-nums text-neutral-900">{route.targetTime}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-neutral-100 pt-3">
                    <span className="text-xs text-neutral-500">
                      약 {formatDurationCompact(route.totalDuration ?? 0)} 소요
                    </span>
                    <span className="text-xs font-semibold text-blue-600">다시 사용</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <section aria-labelledby="tips-title" className="mt-6">
          <h2 id="tips-title" className="mb-3 text-base font-semibold text-neutral-900">BBARU 활용 팁</h2>
          <div className="flex flex-col gap-2">
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
              <div className="flex items-start gap-3">
                <TrendingUp className="mt-0.5 size-4 text-blue-600" aria-hidden="true" />
                <div>
                  <div className="mb-1 text-sm font-semibold text-blue-900">실시간 신호 반영</div>
                  <div className="text-xs text-blue-700">
                    횡단보도와 지하철 도착 정보를 실시간으로 반영합니다
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 size-4 text-emerald-600" aria-hidden="true" />
                <div>
                  <div className="mb-1 text-sm font-semibold text-emerald-900">정시 도착 최적화</div>
                  <div className="text-xs text-emerald-700">
                    너무 빠르지도, 늦지도 않게 목표 시각에 정확히 도착합니다
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {installPrompt.canPrompt && (
          <section aria-label="앱 설치" className="mt-6">
            <div role="status" aria-live="polite" className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                  <Smartphone className="size-5 text-blue-600" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-sm font-semibold text-neutral-900">홈 화면에 추가</div>
                  <div className="text-xs text-neutral-500">
                    BBARU를 앱처럼 바로 열 수 있습니다.
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="설치 안내 닫기"
                  onClick={installPrompt.dismiss}
                  className="-mr-1 -mt-1 rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
              <button
                type="button"
                onClick={installPrompt.promptInstall}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm"
              >
                홈 화면에 추가
              </button>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function PoiField({
  id,
  label,
  placeholder,
  value,
  point,
  suggestions,
  suggestionStatus,
  markerClassName,
  icon,
  onChange,
  onSelect,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  point?: GeoPoint;
  suggestions: TmapPoi[];
  suggestionStatus: PoiSuggestionStatus;
  markerClassName: string;
  icon: ReactNode;
  onChange: (value: string) => void;
  onSelect: (poi: TmapPoi) => void;
}) {
  return (
    <div className="relative">
      <label
        htmlFor={id}
        className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-4 shadow-sm"
      >
        <span className={`size-3 rounded-full ${markerClassName}`} aria-hidden="true" />
        <span className="sr-only">{label}</span>
        <input
          id={id}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="off"
          className="flex-1 bg-transparent text-neutral-900 outline-none"
        />
        {icon}
      </label>

      {point && (
        <div className="mt-1 px-4 text-xs text-blue-600">좌표 확정됨</div>
      )}

      {(suggestions.length > 0 || suggestionStatus === "empty") && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl">
          {suggestionStatus === "empty" ? (
            <div role="status" className="px-4 py-3 text-sm font-semibold text-neutral-500">
              검색 결과가 없습니다
            </div>
          ) : (
            suggestions.map((poi) => (
              <button
                key={`${poi.name}-${poi.point.lat}-${poi.point.lng}`}
                type="button"
                onClick={() => onSelect(poi)}
                className="flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-3 text-left last:border-b-0 hover:bg-blue-50"
              >
                <MapPin className="size-4 shrink-0 text-blue-600" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">
                  {poi.name}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function usePoiSuggestions(query: string, selectedPoint?: GeoPoint): { items: TmapPoi[]; status: PoiSuggestionStatus } {
  const [suggestions, setSuggestions] = useState<{ items: TmapPoi[]; status: PoiSuggestionStatus }>({
    items: [],
    status: "idle",
  });

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2 || selectedPoint) {
      setSuggestions({ items: [], status: "idle" });
      return undefined;
    }

    let cancelled = false;
    setSuggestions((current) => ({ ...current, status: "loading" }));
    const timer = window.setTimeout(() => {
      searchPois(trimmedQuery, 5)
        .then((pois) => {
          if (!cancelled) {
            setSuggestions({
              items: pois,
              status: pois.length > 0 ? "success" : "empty",
            });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSuggestions({ items: [], status: "idle" });
          }
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, selectedPoint]);

  return suggestions;
}

function getDefaultTargetTime(): string {
  const now = new Date();
  const target = new Date(now.getTime() + 45 * 60 * 1000);

  if (target.getDate() !== now.getDate()) {
    return "23:59";
  }

  return `${String(target.getHours()).padStart(2, "0")}:${String(target.getMinutes()).padStart(2, "0")}`;
}
