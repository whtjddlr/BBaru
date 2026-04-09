import { useState } from "react";
import { MainScreen } from "./components/screens/MainScreen";
import { RouteResultScreen } from "./components/screens/RouteResultScreen";
import { EnRouteScreen } from "./components/screens/EnRouteScreen";
import { DesignSystemGuide } from "./components/screens/DesignSystemGuide";

type Screen = "main" | "route-result" | "en-route" | "design-system";

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("main");

  return (
    <div className="size-full bg-[#F8F9FB] relative">
      {/* iPhone 15 Pro Frame */}
      <div className="w-full h-full max-w-[430px] mx-auto bg-white relative overflow-hidden" style={{ aspectRatio: '430/932' }}>
        {/* Screen Content */}
        {currentScreen === "main" && <MainScreen />}
        {currentScreen === "route-result" && <RouteResultScreen />}
        {currentScreen === "en-route" && <EnRouteScreen />}
        {currentScreen === "design-system" && <DesignSystemGuide />}
      </div>

      {/* Navigation Controls */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-neutral-200 p-2 flex gap-2">
          <button
            onClick={() => setCurrentScreen("main")}
            className={`px-4 py-2.5 rounded-xl transition-all ${
              currentScreen === "main"
                ? "bg-blue-600 text-white"
                : "text-neutral-700 hover:bg-neutral-100"
            }`}
            style={{ fontWeight: 600 }}
          >
            메인
          </button>
          <button
            onClick={() => setCurrentScreen("route-result")}
            className={`px-4 py-2.5 rounded-xl transition-all ${
              currentScreen === "route-result"
                ? "bg-blue-600 text-white"
                : "text-neutral-700 hover:bg-neutral-100"
            }`}
            style={{ fontWeight: 600 }}
          >
            경로 결과
          </button>
          <button
            onClick={() => setCurrentScreen("en-route")}
            className={`px-4 py-2.5 rounded-xl transition-all ${
              currentScreen === "en-route"
                ? "bg-blue-600 text-white"
                : "text-neutral-700 hover:bg-neutral-100"
            }`}
            style={{ fontWeight: 600 }}
          >
            이동 중
          </button>
          <button
            onClick={() => setCurrentScreen("design-system")}
            className={`px-4 py-2.5 rounded-xl transition-all ${
              currentScreen === "design-system"
                ? "bg-blue-600 text-white"
                : "text-neutral-700 hover:bg-neutral-100"
            }`}
            style={{ fontWeight: 600 }}
          >
            디자인 시스템
          </button>
        </div>
      </div>
    </div>
  );
}