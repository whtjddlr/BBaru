import { ArrowLeft, Clock, TrendingUp, TrendingDown, Minus, Timer, Play, AlertTriangle } from "lucide-react";
import { MapView } from "../MapView";
import { BottomSheet } from "../BottomSheet";
import { StatusBadge } from "../StatusBadge";
import { ActionCard } from "../ActionCard";
import { TimeDisplay } from "../TimeDisplay";

export function RouteResultScreen() {
  return (
    <div className="w-full h-screen bg-[#F8F9FB] relative overflow-hidden">
      {/* Status Bar */}
      <div className="absolute top-0 left-0 right-0 h-11 bg-white/95 backdrop-blur-sm z-30 flex items-center justify-between px-5">
        <span className="text-sm" style={{ fontWeight: 600 }}>9:41</span>
        <div className="flex items-center gap-1">
          <div className="w-4 h-3 border border-neutral-900 rounded-sm flex items-end px-0.5">
            <div className="w-full h-2 bg-neutral-900 rounded-[1px]" />
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="absolute top-11 left-0 right-0 bg-white/95 backdrop-blur-sm border-b border-neutral-200 z-30">
        <div className="px-5 py-3 flex items-center gap-3">
          <button className="p-2 -ml-2 hover:bg-neutral-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-neutral-900" />
          </button>
          <div className="flex-1">
            <div className="text-sm text-neutral-900" style={{ fontWeight: 600 }}>강남역 → 선릉역</div>
            <div className="text-xs text-neutral-500">목표 도착: 10:00</div>
          </div>
        </div>
      </div>

      {/* Map with Route */}
      <div className="absolute inset-0 top-[100px]">
        <MapView
          origin={{ lat: 1, lng: 1, name: "강남역 2번 출구" }}
          destination={{ lat: 2, lng: 2, name: "선릉역" }}
          showRoute
        />
      </div>

      {/* Summary Card Overlay */}
      <div className="absolute top-[120px] left-5 right-5 z-20">
        <div className="bg-white rounded-2xl shadow-xl p-5 border border-neutral-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <span className="text-neutral-900" style={{ fontWeight: 600 }}>도착 예상</span>
            </div>
            <StatusBadge variant="early">3분 일찍 도착</StatusBadge>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <TimeDisplay label="목표 도착" time="10:00" />
            <TimeDisplay label="예상 도착" time="09:57" subtext="3분 빠름" />
            <TimeDisplay label="총 소요" time="28분" />
          </div>

          <div className="h-px bg-neutral-200 my-4" />

          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-neutral-500 mb-1">권장 출발 시각</div>
              <div className="text-xl text-blue-600 tabular-nums" style={{ fontWeight: 700 }}>09:32</div>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-xl">
              <Timer className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-blue-600" style={{ fontWeight: 600 }}>지금 출발 가능</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Sheet with Details */}
      <BottomSheet defaultExpanded={false}>
        <div className="space-y-4">
          {/* Action Guidance */}
          <div>
            <h3 className="text-neutral-900 mb-3" style={{ fontWeight: 600 }}>출발 가이드</h3>
            <ActionCard
              icon={Play}
              title="지금 출발하세요"
              description="현재 시각에 출발하면 목표 시각에 가장 가깝게 도착합니다"
              variant="primary"
            />
          </div>

          {/* Mode Comparison */}
          <div>
            <h3 className="text-neutral-900 mb-3" style={{ fontWeight: 600 }}>도착 최적화 모드</h3>
            <div className="grid grid-cols-3 gap-2">
              <button className="p-3 border-2 border-neutral-200 rounded-xl bg-white hover:border-blue-300 transition-colors">
                <div className="text-sm mb-1" style={{ fontWeight: 600 }}>안전 우선</div>
                <div className="text-xs text-neutral-500">09:55 도착</div>
              </button>
              <button className="p-3 border-2 border-blue-600 bg-blue-50 rounded-xl">
                <div className="text-sm text-blue-600 mb-1" style={{ fontWeight: 600 }}>균형</div>
                <div className="text-xs text-blue-600">09:57 도착</div>
              </button>
              <button className="p-3 border-2 border-neutral-200 rounded-xl bg-white hover:border-blue-300 transition-colors">
                <div className="text-sm mb-1" style={{ fontWeight: 600 }}>정시 우선</div>
                <div className="text-xs text-neutral-500">10:00 도착</div>
              </button>
            </div>
          </div>

          {/* Route Details */}
          <div>
            <h3 className="text-neutral-900 mb-3" style={{ fontWeight: 600 }}>경로 상세</h3>
            <div className="space-y-3">
              {/* Step 1 */}
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-sm text-blue-600" style={{ fontWeight: 600 }}>1</span>
                  </div>
                  <div className="w-0.5 h-full bg-neutral-200 mt-2" />
                </div>
                <div className="flex-1 pb-4">
                  <div className="text-sm text-neutral-900 mb-1" style={{ fontWeight: 600 }}>도보 이동</div>
                  <div className="text-xs text-neutral-500">강남역 2번 출구 → 2호선 승강장</div>
                  <div className="text-xs text-neutral-400 mt-1">약 3분 소요</div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                    <span className="text-sm text-amber-600" style={{ fontWeight: 600 }}>2</span>
                  </div>
                  <div className="w-0.5 h-full bg-neutral-200 mt-2" />
                </div>
                <div className="flex-1 pb-4">
                  <div className="text-sm text-neutral-900 mb-1" style={{ fontWeight: 600 }}>신호 대기</div>
                  <div className="text-xs text-neutral-500">횡단보도 앞</div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="px-2 py-1 bg-amber-50 text-amber-700 rounded text-xs">평균 45초 대기</div>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                    <span className="text-sm text-green-600" style={{ fontWeight: 600 }}>3</span>
                  </div>
                  <div className="w-0.5 h-full bg-neutral-200 mt-2" />
                </div>
                <div className="flex-1 pb-4">
                  <div className="text-sm text-neutral-900 mb-1" style={{ fontWeight: 600 }}>2호선 탑승</div>
                  <div className="text-xs text-neutral-500">강남역 → 선릉역 (1개 역)</div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="px-2 py-1 bg-green-50 text-green-700 rounded text-xs">09:35 열차 탑승</div>
                    <div className="px-2 py-1 bg-neutral-100 text-neutral-600 rounded text-xs">약 4분</div>
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-sm text-blue-600" style={{ fontWeight: 600 }}>4</span>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-sm text-neutral-900 mb-1" style={{ fontWeight: 600 }}>하차 후 도보</div>
                  <div className="text-xs text-neutral-500">선릉역 3번 출구</div>
                  <div className="text-xs text-neutral-400 mt-1">약 2분 소요</div>
                </div>
              </div>
            </div>
          </div>

          {/* Alternative Routes */}
          <div>
            <h3 className="text-neutral-900 mb-3" style={{ fontWeight: 600 }}>다른 경로</h3>
            <div className="space-y-2">
              <button className="w-full p-4 bg-neutral-50 rounded-xl hover:bg-neutral-100 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-neutral-900" style={{ fontWeight: 600 }}>버스 + 도보</span>
                  <StatusBadge variant="late" size="sm">1분 늦음</StatusBadge>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>3412번 버스 이용</span>
                  <span>32분 소요</span>
                </div>
              </button>
              <button className="w-full p-4 bg-neutral-50 rounded-xl hover:bg-neutral-100 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-neutral-900" style={{ fontWeight: 600 }}>도보 전체</span>
                  <StatusBadge variant="late" size="sm">15분 늦음</StatusBadge>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>직선 거리 2.1km</span>
                  <span>43분 소요</span>
                </div>
              </button>
            </div>
          </div>

          {/* Start Navigation Button */}
          <button className="w-full bg-blue-600 text-white rounded-xl py-4 mt-2" style={{ fontWeight: 600 }}>
            안내 시작
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
