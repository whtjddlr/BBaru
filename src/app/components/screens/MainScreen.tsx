import { Search, Clock, MapPin, TrendingUp, Navigation2 } from "lucide-react";

export function MainScreen() {
  return (
    <div className="w-full h-screen bg-[#F8F9FB] relative overflow-hidden">
      {/* Status Bar */}
      <div className="absolute top-0 left-0 right-0 h-11 bg-white z-30 flex items-center justify-between px-5 border-b border-neutral-100">
        <span className="text-sm text-neutral-900" style={{ fontWeight: 600 }}>9:41</span>
        <div className="flex items-center gap-1">
          <div className="w-4 h-3 border border-neutral-900 rounded-sm flex items-end px-0.5">
            <div className="w-full h-2 bg-neutral-900 rounded-[1px]" />
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="absolute top-11 left-0 right-0 bg-white z-20 border-b border-neutral-200">
        <div className="px-5 py-6">
          <h1 className="text-3xl text-[#1E40AF] mb-1" style={{ fontWeight: 700 }}>SafeETA</h1>
          <p className="text-sm text-neutral-600">정시 도착 최적화</p>
        </div>
      </div>

      {/* Search Section */}
      <div className="absolute top-[130px] left-0 right-0 px-5 z-20">
        <div className="space-y-3">
          {/* Origin Input */}
          <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-4 shadow-sm border border-neutral-200">
            <div className="w-3 h-3 rounded-full bg-blue-600" />
            <input
              type="text"
              placeholder="출발지를 입력하세요"
              className="flex-1 bg-transparent outline-none text-neutral-900"
            />
            <MapPin className="w-5 h-5 text-neutral-400" />
          </div>

          {/* Destination Input */}
          <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-4 shadow-sm border border-neutral-200">
            <div className="w-3 h-3 rounded-full bg-red-600" />
            <input
              type="text"
              placeholder="도착지를 입력하세요"
              className="flex-1 bg-transparent outline-none text-neutral-900"
            />
            <Search className="w-5 h-5 text-neutral-400" />
          </div>

          {/* Target Arrival Time */}
          <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-4 shadow-sm border border-neutral-200">
            <Clock className="w-5 h-5 text-blue-600" />
            <span className="text-sm text-neutral-600 mr-2">목표 도착 시각</span>
            <input
              type="time"
              defaultValue="10:00"
              className="flex-1 bg-transparent outline-none text-neutral-900 text-lg tabular-nums"
              style={{ fontWeight: 600 }}
            />
          </div>

          {/* Search Button */}
          <button className="w-full bg-blue-600 text-white rounded-xl py-4 shadow-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
            <Navigation2 className="w-5 h-5" />
            <span style={{ fontWeight: 600 }}>경로 검색</span>
          </button>
        </div>
      </div>

      {/* Recent Routes */}
      <div className="absolute top-[430px] left-0 right-0 bottom-0 px-5 overflow-y-auto pb-8">
        <div className="mb-4">
          <h2 className="text-lg text-neutral-900 mb-3" style={{ fontWeight: 600 }}>최근 경로</h2>
          <div className="space-y-3">
            {/* Recent Route 1 */}
            <button className="w-full bg-white rounded-2xl p-4 shadow-sm border border-neutral-200 hover:border-blue-300 hover:shadow-md transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-blue-600" />
                    <span className="text-sm text-neutral-900" style={{ fontWeight: 600 }}>
                      강남역 2번 출구
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-600" />
                    <span className="text-sm text-neutral-900" style={{ fontWeight: 600 }}>
                      선릉역
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-neutral-500 mb-1">목표 도착</div>
                  <div className="text-lg text-neutral-900 tabular-nums" style={{ fontWeight: 700 }}>
                    10:00
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
                <span className="text-xs text-neutral-500">약 15분 소요</span>
                <span className="text-xs text-blue-600" style={{ fontWeight: 600 }}>
                  다시 사용
                </span>
              </div>
            </button>

            {/* Recent Route 2 */}
            <button className="w-full bg-white rounded-2xl p-4 shadow-sm border border-neutral-200 hover:border-blue-300 hover:shadow-md transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-blue-600" />
                    <span className="text-sm text-neutral-900" style={{ fontWeight: 600 }}>
                      홍대입구역
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-600" />
                    <span className="text-sm text-neutral-900" style={{ fontWeight: 600 }}>
                      합정역
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-neutral-500 mb-1">목표 도착</div>
                  <div className="text-lg text-neutral-900 tabular-nums" style={{ fontWeight: 700 }}>
                    14:30
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
                <span className="text-xs text-neutral-500">약 8분 소요</span>
                <span className="text-xs text-blue-600" style={{ fontWeight: 600 }}>
                  다시 사용
                </span>
              </div>
            </button>

            {/* Recent Route 3 */}
            <button className="w-full bg-white rounded-2xl p-4 shadow-sm border border-neutral-200 hover:border-blue-300 hover:shadow-md transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-blue-600" />
                    <span className="text-sm text-neutral-900" style={{ fontWeight: 600 }}>
                      서울역
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-600" />
                    <span className="text-sm text-neutral-900" style={{ fontWeight: 600 }}>
                      광화문
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-neutral-500 mb-1">목표 도착</div>
                  <div className="text-lg text-neutral-900 tabular-nums" style={{ fontWeight: 700 }}>
                    09:00
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
                <span className="text-xs text-neutral-500">약 22분 소요</span>
                <span className="text-xs text-blue-600" style={{ fontWeight: 600 }}>
                  다시 사용
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Quick Tips */}
        <div className="mt-6">
          <h3 className="text-base text-neutral-900 mb-3" style={{ fontWeight: 600 }}>SafeETA 활용 팁</h3>
          <div className="space-y-2">
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
              <div className="flex items-start gap-3">
                <TrendingUp className="w-4 h-4 text-blue-600 mt-0.5" />
                <div>
                  <div className="text-sm text-blue-900 mb-1" style={{ fontWeight: 600 }}>
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
                  <div className="text-sm text-emerald-900 mb-1" style={{ fontWeight: 600 }}>
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
