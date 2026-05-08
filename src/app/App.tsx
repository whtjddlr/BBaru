import { useEffect, useState } from "react";
import { MainScreen } from "./components/screens/MainScreen";
import { RouteResultScreen } from "./components/screens/RouteResultScreen";
import { EnRouteScreen } from "./components/screens/EnRouteScreen";
import { ProfileScreen } from "./components/screens/ProfileScreen";
import {
  buildRoutePlan,
  createDefaultRouteIntent,
  type RouteIntent,
  type TransitRouteEstimate,
} from "./domain/eta";
import { fetchOdsayTransitEstimates } from "./services/odsayTransit";

type Screen = "main" | "route-result" | "en-route" | "profile";

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("main");
  const [routeIntent, setRouteIntent] = useState<RouteIntent>(() =>
    createDefaultRouteIntent()
  );
  const [routePlan, setRoutePlan] = useState(() => buildRoutePlan(routeIntent));
  const [routeOptions, setRouteOptions] = useState<TransitRouteEstimate[]>([]);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | undefined>();
  const [routeRetryCount, setRouteRetryCount] = useState(0);

  useEffect(() => {
    if (!import.meta.env.DEV || window.location.hostname !== "127.0.0.1") {
      return;
    }

    window.location.replace(
      `http://localhost:${window.location.port}${window.location.pathname}${window.location.search}${window.location.hash}`
    );
  }, []);

  useEffect(() => {
    if (currentScreen === "main" || currentScreen === "profile") {
      setIsRouteLoading(false);
      return;
    }

    if (routeOptions.length > 0) {
      if (!routePlan.transitEstimate) {
        setRoutePlan(buildRoutePlan(routeIntent, routeOptions[0]));
      }

      setIsRouteLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsRouteLoading(true);
    setRouteError(undefined);

    fetchOdsayTransitEstimates(routeIntent, controller.signal)
      .then((estimates) => {
        if (!controller.signal.aborted && estimates.length > 0) {
          setRouteOptions(estimates);
          setRoutePlan(buildRoutePlan(routeIntent, estimates[0]));
          setRouteError(undefined);
          return;
        }

        if (!controller.signal.aborted) {
          setRouteError("실제 대중교통 경로를 불러오지 못했어요.");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRouteError("ODsay 경로 연결을 확인해야 해요.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsRouteLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    currentScreen,
    routeIntent,
    routeOptions,
    routePlan.transitEstimate,
    routeRetryCount,
  ]);

  const handleRouteSearch = (intent: RouteIntent) => {
    setRouteIntent(intent);
    setRoutePlan(buildRoutePlan(intent));
    setRouteOptions([]);
    setRouteError(undefined);
    setIsRouteLoading(true);
    setCurrentScreen("route-result");
  };

  const handleSelectRouteOption = (estimate: TransitRouteEstimate) => {
    setRoutePlan(buildRoutePlan(routeIntent, estimate));
  };

  const handleRetryRoute = () => {
    setRouteOptions([]);
    setRouteError(undefined);
    setIsRouteLoading(true);
    setRouteRetryCount((count) => count + 1);
  };

  return (
    <div className="size-full bg-[#F8F9FB] relative">
      {/* iPhone 15 Pro Frame */}
      <div className="w-full h-full max-w-[430px] mx-auto bg-white relative overflow-hidden" style={{ aspectRatio: '430/932' }}>
        {/* Screen Content */}
        {currentScreen === "main" && (
          <MainScreen
            onRouteSearch={handleRouteSearch}
            onOpenProfile={() => setCurrentScreen("profile")}
          />
        )}
        {currentScreen === "route-result" && (
          <RouteResultScreen
            routePlan={routePlan}
            routeOptions={routeOptions}
            isRouteLoading={isRouteLoading}
            routeError={routeError}
            onSelectRouteOption={handleSelectRouteOption}
            onRetryRoute={handleRetryRoute}
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
        {currentScreen === "profile" && (
          <ProfileScreen onBack={() => setCurrentScreen("main")} />
        )}
      </div>
    </div>
  );
}
