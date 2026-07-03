export function DesignSystemGuide() {
  return (
    <div className="w-full min-h-screen bg-[#F8F9FB] p-6 overflow-y-auto">
      <div className="max-w-md mx-auto space-y-8 pb-20">
        {/* Header */}
        <div>
          <h1 className="text-3xl text-[#1E40AF] mb-2 font-bold">BBARU</h1>
          <h2 className="text-xl text-neutral-900 mb-1 font-semibold">Design System</h2>
          <p className="text-sm text-neutral-600">정시 도착 최적화 앱 디자인 가이드</p>
        </div>

        {/* Color Palette */}
        <section>
          <h3 className="text-lg text-neutral-900 mb-4 font-semibold">컬러 시스템</h3>

          <div className="space-y-4">
            <div>
              <div className="text-sm text-neutral-600 mb-2 font-semibold">Primary Colors</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="w-full h-16 bg-[#1E40AF] rounded-lg mb-2" />
                  <div className="text-xs text-neutral-900 font-semibold">Navy</div>
                  <div className="text-xs text-neutral-500">#1E40AF</div>
                </div>
                <div>
                  <div className="w-full h-16 bg-[#3B82F6] rounded-lg mb-2" />
                  <div className="text-xs text-neutral-900 font-semibold">Blue</div>
                  <div className="text-xs text-neutral-500">#3B82F6</div>
                </div>
                <div>
                  <div className="w-full h-16 bg-[#2563EB] rounded-lg mb-2" />
                  <div className="text-xs text-neutral-900 font-semibold">Blue Dark</div>
                  <div className="text-xs text-neutral-500">#2563EB</div>
                </div>
              </div>
            </div>

            <div>
              <div className="text-sm text-neutral-600 mb-2 font-semibold">Status Colors</div>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <div className="w-full h-16 bg-[#10B981] rounded-lg mb-2" />
                  <div className="text-xs text-neutral-900 font-semibold">Success</div>
                  <div className="text-xs text-neutral-500">#10B981</div>
                </div>
                <div>
                  <div className="w-full h-16 bg-[#F59E0B] rounded-lg mb-2" />
                  <div className="text-xs text-neutral-900 font-semibold">Warning</div>
                  <div className="text-xs text-neutral-500">#F59E0B</div>
                </div>
                <div>
                  <div className="w-full h-16 bg-[#EF4444] rounded-lg mb-2" />
                  <div className="text-xs text-neutral-900 font-semibold">Danger</div>
                  <div className="text-xs text-neutral-500">#EF4444</div>
                </div>
                <div>
                  <div className="w-full h-16 bg-[#8B5CF6] rounded-lg mb-2" />
                  <div className="text-xs text-neutral-900 font-semibold">Optimal</div>
                  <div className="text-xs text-neutral-500">#8B5CF6</div>
                </div>
              </div>
            </div>

            <div>
              <div className="text-sm text-neutral-600 mb-2 font-semibold">Neutral Grays</div>
              <div className="grid grid-cols-5 gap-2">
                <div>
                  <div className="w-full h-12 bg-[#F8F9FB] rounded-lg mb-1 border border-neutral-200" />
                  <div className="text-xs text-neutral-500">50</div>
                </div>
                <div>
                  <div className="w-full h-12 bg-[#F1F5F9] rounded-lg mb-1" />
                  <div className="text-xs text-neutral-500">100</div>
                </div>
                <div>
                  <div className="w-full h-12 bg-[#E2E8F0] rounded-lg mb-1" />
                  <div className="text-xs text-neutral-500">200</div>
                </div>
                <div>
                  <div className="w-full h-12 bg-[#CBD5E1] rounded-lg mb-1" />
                  <div className="text-xs text-neutral-500">300</div>
                </div>
                <div>
                  <div className="w-full h-12 bg-[#94A3B8] rounded-lg mb-1" />
                  <div className="text-xs text-neutral-500">400</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Typography */}
        <section>
          <h3 className="text-lg text-neutral-900 mb-4 font-semibold">타이포그래피</h3>

          <div className="space-y-4 bg-white rounded-2xl p-5 border border-neutral-200">
            <div>
              <div className="text-3xl text-neutral-900 mb-1 font-bold">10:00</div>
              <div className="text-xs text-neutral-500">Display · 700 weight · 36px</div>
            </div>
            <div className="h-px bg-neutral-200" />
            <div>
              <div className="text-2xl text-neutral-900 mb-1 font-bold">BBARU</div>
              <div className="text-xs text-neutral-500">Title Large · 700 weight · 24px</div>
            </div>
            <div className="h-px bg-neutral-200" />
            <div>
              <div className="text-xl text-neutral-900 mb-1 font-semibold">경로 검색</div>
              <div className="text-xs text-neutral-500">Title · 600 weight · 20px</div>
            </div>
            <div className="h-px bg-neutral-200" />
            <div>
              <div className="text-base text-neutral-900 mb-1 font-semibold">도착 예상 시각</div>
              <div className="text-xs text-neutral-500">Body Bold · 600 weight · 16px</div>
            </div>
            <div className="h-px bg-neutral-200" />
            <div>
              <div className="text-base text-neutral-900 mb-1">출발지를 입력하세요</div>
              <div className="text-xs text-neutral-500">Body · 400 weight · 16px</div>
            </div>
            <div className="h-px bg-neutral-200" />
            <div>
              <div className="text-sm text-neutral-900 mb-1 font-semibold">지금 출발하세요</div>
              <div className="text-xs text-neutral-500">Label · 600 weight · 14px</div>
            </div>
            <div className="h-px bg-neutral-200" />
            <div>
              <div className="text-xs text-neutral-600 mb-1">약 3분 소요</div>
              <div className="text-xs text-neutral-500">Caption · 400 weight · 12px</div>
            </div>
          </div>
        </section>

        {/* Spacing System */}
        <section>
          <h3 className="text-lg text-neutral-900 mb-4 font-semibold">간격 시스템</h3>

          <div className="space-y-3 bg-white rounded-2xl p-5 border border-neutral-200">
            <div className="flex items-center gap-3">
              <div className="w-1 h-6 bg-blue-600" />
              <span className="text-sm text-neutral-900">4px · 0.25rem</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-6 bg-blue-600" />
              <span className="text-sm text-neutral-900">8px · 0.5rem</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-6 bg-blue-600" />
              <span className="text-sm text-neutral-900">12px · 0.75rem</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-6 bg-blue-600" />
              <span className="text-sm text-neutral-900">16px · 1rem</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-5 h-6 bg-blue-600" />
              <span className="text-sm text-neutral-900">20px · 1.25rem</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-blue-600" />
              <span className="text-sm text-neutral-900">24px · 1.5rem</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-6 bg-blue-600" />
              <span className="text-sm text-neutral-900">32px · 2rem</span>
            </div>
          </div>
        </section>

        {/* Border Radius */}
        <section>
          <h3 className="text-lg text-neutral-900 mb-4 font-semibold">모서리 곡률</h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-neutral-200 p-4">
              <div className="w-full h-12 bg-blue-100 rounded-lg mb-2" />
              <div className="text-xs text-neutral-900 font-semibold">Medium</div>
              <div className="text-xs text-neutral-500">8px · 0.5rem</div>
            </div>
            <div className="bg-white border border-neutral-200 p-4">
              <div className="w-full h-12 bg-blue-100 rounded-xl mb-2" />
              <div className="text-xs text-neutral-900 font-semibold">Large</div>
              <div className="text-xs text-neutral-500">12px · 0.75rem</div>
            </div>
            <div className="bg-white border border-neutral-200 p-4">
              <div className="w-full h-12 bg-blue-100 rounded-2xl mb-2" />
              <div className="text-xs text-neutral-900 font-semibold">XLarge</div>
              <div className="text-xs text-neutral-500">16px · 1rem</div>
            </div>
            <div className="bg-white border border-neutral-200 p-4">
              <div className="w-full h-12 bg-blue-100 rounded-full mb-2" />
              <div className="text-xs text-neutral-900 font-semibold">Full</div>
              <div className="text-xs text-neutral-500">9999px</div>
            </div>
          </div>
        </section>

        {/* Component Examples */}
        <section>
          <h3 className="text-lg text-neutral-900 mb-4 font-semibold">컴포넌트</h3>

          <div className="space-y-4">
            {/* Buttons */}
            <div>
              <div className="text-sm text-neutral-600 mb-3 font-semibold">Buttons</div>
              <div className="space-y-2">
                <button className="w-full bg-blue-600 text-white rounded-xl py-3.5 font-semibold">
                  Primary Button
                </button>
                <button className="w-full bg-white text-neutral-900 border-2 border-neutral-200 rounded-xl py-3.5 font-semibold">
                  Secondary Button
                </button>
                <button className="w-full bg-neutral-100 text-neutral-900 rounded-xl py-3.5 font-semibold">
                  Tertiary Button
                </button>
              </div>
            </div>

            {/* Status Badges */}
            <div>
              <div className="text-sm text-neutral-600 mb-3 font-semibold">Status Badges</div>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-sm">
                  정시 도착
                </span>
                <span className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-sm">
                  3분 빠름
                </span>
                <span className="px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full text-sm">
                  2분 늦음
                </span>
                <span className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-sm">
                  대기 중
                </span>
              </div>
            </div>

            {/* Input Fields */}
            <div>
              <div className="text-sm text-neutral-600 mb-3 font-semibold">Input Fields</div>
              <div className="space-y-2">
                <div className="flex items-center gap-3 bg-white border border-neutral-200 rounded-xl px-4 py-3.5">
                  <div className="w-3 h-3 rounded-full bg-blue-600" />
                  <input
                    type="text"
                    aria-label="출발지 예시"
                    placeholder="출발지를 입력하세요"
                    className="flex-1 bg-transparent outline-none"
                  />
                </div>
                <div className="flex items-center gap-3 bg-[#F8F9FB] rounded-xl px-4 py-3.5">
                  <div className="w-3 h-3 rounded-full bg-red-600" />
                  <input
                    type="text"
                    aria-label="도착지 예시"
                    placeholder="도착지를 입력하세요"
                    className="flex-1 bg-transparent outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Cards */}
            <div>
              <div className="text-sm text-neutral-600 mb-3 font-semibold">Cards</div>
              <div className="space-y-2">
                <div className="bg-white rounded-2xl p-4 border border-neutral-200">
                  <div className="text-sm text-neutral-900 mb-1 font-semibold">White Card</div>
                  <div className="text-xs text-neutral-500">기본 정보 카드</div>
                </div>
                <div className="bg-blue-600 text-white rounded-2xl p-4">
                  <div className="text-sm mb-1 font-semibold">Primary Card</div>
                  <div className="text-xs opacity-90">강조 액션 카드</div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                  <div className="text-sm text-emerald-900 mb-1 font-semibold">Success Card</div>
                  <div className="text-xs text-emerald-700">성공 상태 카드</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Icons & Markers */}
        <section>
          <h3 className="text-lg text-neutral-900 mb-4 font-semibold">아이콘 & 마커</h3>

          <div className="grid grid-cols-4 gap-3">
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full" />
              </div>
              <span className="text-xs text-neutral-600">출발</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full" />
              </div>
              <span className="text-xs text-neutral-600">도착</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              </div>
              <span className="text-xs text-neutral-600">대기</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center border-4 border-white shadow-lg">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              </div>
              <span className="text-xs text-neutral-600">현위치</span>
            </div>
          </div>
        </section>

        {/* Design Principles */}
        <section>
          <h3 className="text-lg text-neutral-900 mb-4 font-semibold">디자인 원칙</h3>

          <div className="space-y-3">
            <div className="bg-white rounded-xl p-4 border border-neutral-200">
              <div className="text-sm text-neutral-900 mb-1 font-semibold">1. 명확한 정보 위계</div>
              <div className="text-xs text-neutral-600">
                가장 중요한 정보(도착 시각, 출발 시각)가 가장 크고 두드러지게 표시됩니다
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-neutral-200">
              <div className="text-sm text-neutral-900 mb-1 font-semibold">2. 행동 중심 디자인</div>
              <div className="text-xs text-neutral-600">
                "지금 출발", "잠시 대기"와 같은 명확한 행동 지시가 우선 표시됩니다
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-neutral-200">
              <div className="text-sm text-neutral-900 mb-1 font-semibold">3. 신뢰감 있는 톤</div>
              <div className="text-xs text-neutral-600">
                금융앱과 지도앱 수준의 깔끔하고 전문적인 UI로 신뢰를 구축합니다
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-neutral-200">
              <div className="text-sm text-neutral-900 mb-1 font-semibold">4. 실시간 피드백</div>
              <div className="text-xs text-neutral-600">
                현재 상태와 다음 행동이 실시간으로 업데이트되어 표시됩니다
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
