import { useState } from "react";
import { MainScreen } from "./components/screens/MainScreen";
import { RouteResultScreen } from "./components/screens/RouteResultScreen";
import { EnRouteScreen } from "./components/screens/EnRouteScreen";
import {
  buildRoutePlan,
  createDefaultRouteIntent,
  type RouteIntent,
} from "./domain/eta";

type Screen = "main" | "route-result" | "en-route";

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("main");
  const [routePlan, setRoutePlan] = useState(() =>
    buildRoutePlan(createDefaultRouteIntent())
  );

  const handleRouteSearch = (intent: RouteIntent) => {
    setRoutePlan(buildRoutePlan(intent));
    setCurrentScreen("route-result");
  };

  return (
    <div className="size-full bg-[#F8F9FB] relative">
      {/* iPhone 15 Pro Frame */}
      <div className="w-full h-full max-w-[430px] mx-auto bg-white relative overflow-hidden" style={{ aspectRatio: '430/932' }}>
        {/* Screen Content */}
        {currentScreen === "main" && <MainScreen onRouteSearch={handleRouteSearch} />}
        {currentScreen === "route-result" && (
          <RouteResultScreen
            routePlan={routePlan}
            onBack={() => setCurrentScreen("main")}
            onStartNavigation={() => setCurrentScreen("en-route")}
          />
        )}
        {currentScreen === "en-route" && (
          <EnRouteScreen
            routePlan={routePlan}
            onBack={() => setCurrentScreen("route-result")}
            onEndRoute={() => setCurrentScreen("main")}
          />
        )}
      </div>
    </div>
  );
}
