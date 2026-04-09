import { ArrowLeft, Clock, Navigation, AlertCircle, Zap, Timer, TrendingUp } from "lucide-react";
import { MapView } from "../MapView";
import { BottomSheet } from "../BottomSheet";
import { StatusBadge } from "../StatusBadge";
import { ActionCard } from "../ActionCard";
import { TimeDisplay } from "../TimeDisplay";

export function EnRouteScreen() {
  return (
    <div className="w-full h-screen bg-[#F8F9FB] relative overflow-hidden">
      {/* Status Bar */}
      <div className="absolute top-0 left-0 right-0 h-11 bg-blue-600 z-30 flex items-center justify-between px-5">
        <span className="text-sm text-white" style={{ fontWeight: 600 }}>9:41</span>
        <div className="flex items-center gap-1">
          <div className="w-4 h-3 border border-white rounded-sm flex items-end px-0.5">
            <div className="w-full h-2 bg-white rounded-[1px]" />
          </div>
        </div>
      </div>

      {/* Navigation Header */}
      <div className="absolute top-11 left-0 right-0 bg-blue-600 z-30">
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <button className="p-2 -ml-2 hover:bg-blue-500 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <button className="px-4 py-2 bg-white/20 backdrop-blur-sm rounded-lg text-white text-sm" style={{ fontWeight: 600 }}>
              경로 종료
            </button>
          </div>
          <div className="flex items-center gap-3">
            <Navigation className="w-6 h-6 text-white" />
            <div className="flex-1">
              <div className="text-white text-sm mb-1">선릉역까지</div>
              <div className="text-2xl text-white tabular-nums" style={{ fontWeight: 700 }}>09:57 도착 예정</div>
            </div>
            <StatusBadge variant="early">3분 빠름</StatusBadge>
          </div>
        </div>
      </div>

      {/* Map with Current Position */}
      <div className="absolute inset-0 top-[165px]">
        <MapView
          origin={{ lat: 1, lng: 1, name: "강남역 2번 출구" }}
          destination={{ lat: 2, lng: 2, name: "선릉역" }}
          currentPosition={{ lat: 1.5, lng: 1.5 }}
          showRoute
        />
      </div>

      {/* Real-time Action Alert */}
      <div className="absolute top-[185px] left-5 right-5 z-20">
        <ActionCard
          icon={Zap}
          title="지금 속도 유지하세요"
          description="현재 페이스대로 가면 목표 시각에 정확히 도착합니다"
          variant="success"
        >
          <div className="mt-3 pt-3 border-t border-white/20">
            <div className="flex items-center justify-between text-sm">
              <span className="opacity-90">다음 재계산 지점</span>
              <span style={{ fontWeight: 600 }}>횡단보도 (120m)</span>
            </div>
          </div>
        </ActionCard>
      </div>

      {/* Progress Indicator */}
      <div className="absolute top-[330px] left-5 right-5 z-20">
        <div className="bg-white rounded-2xl p-4 shadow-lg border border-neutral-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-neutral-600">이동 진행도</span>
            <span className="text-sm text-blue-600" style={{ fontWeight: 600 }}>35% 완료</span>
          </div>
          <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full" style={{ width: '35%' }} />
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-neutral-500">
            <span>강남역</span>
            <span>선릉역</span>
          </div>
        </div>
      </div>

      {/* Bottom Sheet with En-route Details */}
      <BottomSheet defaultExpanded={false}>
        <div className="space-y-4">
          {/* Current Status */}
          <div>
            <h3 className="text-neutral-900 mb-3" style={{ fontWeight: 600 }}>현재 상태</h3>
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
              <div className="flex items-start gap-3 mb-3">
                <Timer className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm text-blue-900 mb-1" style={{ fontWeight: 600 }}>이동 중</div>
                  <div className="text-xs text-blue-700">강남역 2번 출구 → 2호선 승강장</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-blue-600 mb-1">현재 구간</div>
                  <div className="text-base text-blue-900" style={{ fontWeight: 600 }}>도보 이동</div>
                </div>
                <div>
                  <div className="text-xs text-blue-600 mb-1">남은 거리</div>
                  <div className="text-base text-blue-900" style={{ fontWeight: 600 }}>180m</div>
                </div>
              </div>
            </div>
          </div>

          {/* Time Comparison */}
          <div>
            <h3 className="text-neutral-900 mb-3" style={{ fontWeight: 600 }}>도착 시각 비교</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white border border-neutral-200 rounded-xl p-3 text-center">
                <div className="text-xs text-neutral-500 mb-1">목표</div>
                <div className="text-xl text-neutral-900 tabular-nums" style={{ fontWeight: 700 }}>10:00</div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                <div className="text-xs text-emerald-600 mb-1">예상</div>
                <div className="text-xl text-emerald-900 tabular-nums" style={{ fontWeight: 700 }}>09:57</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                <div className="text-xs text-blue-600 mb-1">편차</div>
                <div className="text-xl text-blue-900 tabular-nums" style={{ fontWeight: 700 }}>-3분</div>
              </div>
            </div>
          </div>

          {/* Upcoming Events - Visual Progress */}
          <div>
            <h3 className="text-neutral-900 mb-4" style={{ fontWeight: 600 }}>다가오는 구간</h3>

            {/* Visual Mini Timeline */}
            <div className="bg-white rounded-2xl p-4 border border-neutral-200 shadow-sm">
              <div className="space-y-0">
                {/* Current Position Indicator */}
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-neutral-100">
                  <div className="w-3 h-3 rounded-full bg-blue-600 border-4 border-blue-200 animate-pulse" />
                  <div className="flex-1">
                    <div className="text-xs text-blue-600 mb-1" style={{ fontWeight: 600 }}>현재 위치</div>
                    <div className="text-sm text-neutral-900" style={{ fontWeight: 600 }}>강남역 2번 출구 앞</div>
                  </div>
                  <div className="text-xs text-neutral-500 bg-neutral-50 px-3 py-1.5 rounded-full">35% 완료</div>
                </div>

                {/* Next: Traffic Light */}
                <div className="flex items-center gap-3 py-3 border-l-4 border-amber-400 -ml-1 pl-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-neutral-900" style={{ fontWeight: 600 }}>횡단보도 신호 대기</span>
                      <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded" style={{ fontWeight: 600 }}>120m</span>
                    </div>
                    <div className="text-xs text-amber-700 mb-2">약 45초 대기 예상</div>
                    <div className="flex items-center gap-2 text-xs text-neutral-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      <span>재계산 지점</span>
                    </div>
                  </div>
                </div>

                {/* Then: Subway */}
                <div className="flex items-center gap-3 py-3 border-l-4 border-neutral-200 -ml-1 pl-4">
                  <div className="w-10 h-10 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center">
                    <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center text-white text-xs" style={{ fontWeight: 700 }}>2</div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-neutral-900" style={{ fontWeight: 600 }}>2호선 탑승</span>
                      <span className="text-xs text-neutral-500">3분 후</span>
                    </div>
                    <div className="text-xs text-neutral-500">09:35 열차 · 강남 → 선릉</div>
                  </div>
                </div>

                {/* Final: Walk to Destination */}
                <div className="flex items-center gap-3 py-3 border-l-4 border-neutral-200 -ml-1 pl-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-neutral-900 mb-1" style={{ fontWeight: 600 }}>하차 후 도보</div>
                    <div className="text-xs text-neutral-500">선릉역 3번 출구 · 약 2분</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Time to Next Event */}
            <div className="mt-3 bg-amber-50 rounded-xl p-3 border border-amber-200 flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-600" />
              <div className="flex-1">
                <div className="text-sm text-amber-900" style={{ fontWeight: 600 }}>다음 이벤트까지</div>
                <div className="text-xs text-amber-700">횡단보도 앞 약 90초 후 도착</div>
              </div>
            </div>
          </div>

          {/* Speed Adjustment Options */}
          <div>
            <h3 className="text-neutral-900 mb-3" style={{ fontWeight: 600 }}>속도 조절 옵션</h3>
            <div className="space-y-2">
              <button className="w-full p-4 bg-neutral-50 rounded-xl hover:bg-neutral-100 transition-colors border border-neutral-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-neutral-900" style={{ fontWeight: 600 }}>조금 더 빠르게 이동</span>
                  <TrendingUp className="w-4 h-4 text-neutral-500" />
                </div>
                <div className="text-xs text-neutral-600 text-left">
                  09:55 도착 · 목표보다 5분 빠름
                </div>
              </button>
              <button className="w-full p-4 bg-blue-600 rounded-xl border-2 border-blue-600">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-white" style={{ fontWeight: 600 }}>현재 속도 유지 (권장)</span>
                  <div className="w-2 h-2 bg-white rounded-full" />
                </div>
                <div className="text-xs text-white/90 text-left">
                  09:57 도착 · 목표보다 3분 빠름
                </div>
              </button>
              <button className="w-full p-4 bg-neutral-50 rounded-xl hover:bg-neutral-100 transition-colors border border-neutral-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-neutral-900" style={{ fontWeight: 600 }}>여유롭게 이동</span>
                  <Timer className="w-4 h-4 text-neutral-500" />
                </div>
                <div className="text-xs text-neutral-600 text-left">
                  10:02 도착 · 목표보다 2분 늦음
                </div>
              </button>
            </div>
          </div>

          {/* Next Recalculation Point */}
          <div className="bg-neutral-100 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
              <span className="text-sm text-neutral-700" style={{ fontWeight: 600 }}>다음 재계산 지점</span>
            </div>
            <div className="text-xs text-neutral-600">
              횡단보도 도착 시 실시간 신호 정보를 반영하여 ETA를 재계산합니다
            </div>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
