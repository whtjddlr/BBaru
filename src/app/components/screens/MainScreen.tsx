import { type FormEvent, useState } from "react";
import {
  AlertCircle,
  Clock,
  MapPin,
  Navigation2,
  Search,
  TrendingUp,
} from "lucide-react";
import { type RouteIntent } from "../../domain/eta";

interface MainScreenProps {
  onRouteSearch: (intent: RouteIntent) => void;
}

const recentRoutes: RouteIntent[] = [
  {
    origin: "강남역 2번 출구",
    destination: "선릉역",
    targetArrivalTime: "10:00",
    strategy: "balanced",
  },
  {
    origin: "홍대입구역",
    destination: "합정역",
    targetArrivalTime: "14:30",
    strategy: "ontime",
  },
  {
    origin: "서울역",
    destination: "광화문",
    targetArrivalTime: "09:00",
    strategy: "safe",
  },
];

export function MainScreen({ onRouteSearch }: MainScreenProps) {
  const [origin, setOrigin] = useState("강남역 2번 출구");
  const [destination, setDestination] = useState("선릉역");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmedOrigin = origin.trim();
    const trimmedDestination = destination.trim();

    if (!trimmedOrigin || !trimmedDestination) {
      setError("출발지와 도착지를 입력해 주세요.");
      return;
    }

    onRouteSearch({
      origin: trimmedOrigin,
      destination: trimmedDestination,
      targetArrivalTime: getDefaultArrivalTime(),
      strategy: "balanced",
    });
  };

  return (
    <div className="w-full h-screen bg-[#F8F9FB] relative overflow-hidden">
      {/* Status Bar */}
      <div className="absolute top-0 left-0 right-0 h-11 bg-white z-30 flex items-center justify-between px-5 border-b border-neutral-100">
        <span className="text-sm text-neutral-900" style={{ fontWeight: 600 }}>
          9:41
        </span>
        <div className="flex items-center gap-1">
          <div className="w-4 h-3 border border-neutral-900 rounded-sm flex items-end px-0.5">
            <div className="w-full h-2 bg-neutral-900 rounded-[1px]" />
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="absolute top-11 left-0 right-0 bg-white z-20 border-b border-neutral-200">
        <div className="px-5 py-6">
          <h1 className="text-3xl text-[#1E40AF] mb-1" style={{ fontWeight: 700 }}>
            BBARU
          </h1>
          <p className="text-sm text-neutral-600">출발지와 도착지만으로 이동 판단</p>
        </div>
      </div>

      {/* Search Section */}
      <form
        onSubmit={handleSubmit}
        className="absolute top-[130px] left-0 right-0 px-5 z-20"
      >
        <div className="space-y-3">
          {/* Origin Input */}
          <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm border border-neutral-200">
            <div className="w-3 h-3 rounded-full bg-blue-600" />
            <input
              type="text"
              value={origin}
              onChange={(event) => setOrigin(event.target.value)}
              placeholder="출발지를 입력하세요"
              className="flex-1 bg-transparent outline-none text-neutral-900"
            />
            <MapPin className="w-5 h-5 text-neutral-400" />
          </div>

          {/* Destination Input */}
          <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm border border-neutral-200">
            <div className="w-3 h-3 rounded-full bg-red-600" />
            <input
              type="text"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="도착지를 입력하세요"
              className="flex-1 bg-transparent outline-none text-neutral-900"
            />
            <Search className="w-5 h-5 text-neutral-400" />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          {/* Search Button */}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white rounded-xl py-4 shadow-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <Navigation2 className="w-5 h-5" />
            <span style={{ fontWeight: 600 }}>경로 계산</span>
          </button>
        </div>
      </form>

      {/* Recent Routes */}
      <div className="absolute top-[360px] left-0 right-0 bottom-0 px-5 overflow-y-auto pb-8">
        <div className="mb-4">
          <h2 className="text-lg text-neutral-900 mb-3" style={{ fontWeight: 600 }}>
            최근 경로
          </h2>
          <div className="space-y-3">
            {recentRoutes.map((route) => (
              <button
                key={`${route.origin}-${route.destination}-${route.targetArrivalTime}`}
                onClick={() => onRouteSearch(route)}
                className="w-full bg-white rounded-2xl p-4 shadow-sm border border-neutral-200 hover:border-blue-300 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-blue-600" />
                      <span
                        className="text-sm text-neutral-900"
                        style={{ fontWeight: 600 }}
                      >
                        {route.origin}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-600" />
                      <span
                        className="text-sm text-neutral-900"
                        style={{ fontWeight: 600 }}
                      >
                        {route.destination}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
                  <span className="text-xs text-neutral-500">최근 사용</span>
                  <span className="text-xs text-blue-600" style={{ fontWeight: 600 }}>
                    다시 사용
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Quick Tips */}
        <div className="mt-6">
          <h3 className="text-base text-neutral-900 mb-3" style={{ fontWeight: 600 }}>
            BBARU 활용 팁
          </h3>
          <div className="space-y-2">
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
              <div className="flex items-start gap-3">
                <TrendingUp className="w-4 h-4 text-blue-600 mt-0.5" />
                <div>
                  <div
                    className="text-sm text-blue-900 mb-1"
                    style={{ fontWeight: 600 }}
                  >
                    실시간 신호 반영
                  </div>
                  <div className="text-xs text-blue-700">
                    횡단보도와 지하철 도착 정보를 실시간으로 반영합니다
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-emerald-600 mt-0.5" />
                <div>
                  <div
                    className="text-sm text-emerald-900 mb-1"
                    style={{ fontWeight: 600 }}
                  >
                    정시 도착 최적화
                  </div>
                  <div className="text-xs text-emerald-700">
                    너무 빠르지도, 늦지도 않게 목표 시각에 정확히 도착합니다
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getDefaultArrivalTime(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30);

  return `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;
}
