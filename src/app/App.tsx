import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Bell, X } from "lucide-react";
import { MainScreen } from "./components/screens/MainScreen";
import { RouteResultScreen } from "./components/screens/RouteResultScreen";
import { EnRouteScreen } from "./components/screens/EnRouteScreen";
import { DesignSystemGuide } from "./components/screens/DesignSystemGuide";
import { RouteProvider, useRouteState } from "./context/RouteContext";
import {
  fireDepartureNotification,
  getDepartureAlarmContent,
  shouldFire,
  type DepartureAlarmFire,
} from "./lib/departureAlarm";

export default function App() {
  return (
    <BrowserRouter>
      <RouteProvider>
        <AppShell />
      </RouteProvider>
    </BrowserRouter>
  );
}

function AppShell() {
  const { departureAlarm, markDepartureAlarmFired } = useRouteState();
  const [inAppAlarm, setInAppAlarm] = useState<DepartureAlarmFire | null>(null);
  const safeAreaClass = isNativeRuntime()
    ? "pb-4 pt-8"
    : "pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]";

  const checkDepartureAlarm = useCallback(() => {
    const fire = shouldFire(departureAlarm, new Date());

    if (!fire) {
      return;
    }

    const notificationShown = fireDepartureNotification(fire);

    markDepartureAlarmFired(fire.type);

    if (!notificationShown) {
      setInAppAlarm(fire);
    }
  }, [departureAlarm, markDepartureAlarmFired]);

  useEffect(() => {
    checkDepartureAlarm();

    const timer = window.setInterval(checkDepartureAlarm, 15000);

    return () => {
      window.clearInterval(timer);
    };
  }, [checkDepartureAlarm]);

  return (
    <div className={`size-full bg-[#F8F9FB] ${safeAreaClass}`}>
      <div className="mx-auto h-full max-w-[430px] bg-white relative overflow-hidden">
        <Routes>
          <Route path="/" element={<MainScreen />} />
          <Route
            path="/route"
            element={
              <RequireSearch>
                <RouteResultScreen />
              </RequireSearch>
            }
          />
          <Route
            path="/en-route"
            element={
              <RequireSearch>
                <EnRouteScreen />
              </RequireSearch>
            }
          />
          <Route path="/design-system" element={<DesignSystemGuide />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        {inAppAlarm && (
          <DepartureAlarmAlert fire={inAppAlarm} onClose={() => setInAppAlarm(null)} />
        )}
      </div>
    </div>
  );
}

function isNativeRuntime(): boolean {
  const capacitor = (window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;

  return (
    window.location.protocol === "capacitor:" ||
    Boolean(capacitor?.isNativePlatform?.())
  );
}

function DepartureAlarmAlert({ fire, onClose }: { fire: DepartureAlarmFire; onClose: () => void }) {
  const content = getDepartureAlarmContent(fire);

  return (
    <div className="pointer-events-none absolute left-4 right-4 top-4 z-50">
      <div
        role="alert"
        aria-live="assertive"
        className="pointer-events-auto rounded-2xl border border-blue-200 bg-white p-4 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Bell className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-sm font-semibold text-neutral-900">{content.title}</div>
            <div className="text-sm text-neutral-600">{content.body}</div>
          </div>
          <button
            type="button"
            aria-label="출발 알림 닫기"
            onClick={onClose}
            className="-mr-1 -mt-1 rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

function RequireSearch({ children }: { children: JSX.Element }) {
  const { hasActiveSearch } = useRouteState();

  if (!hasActiveSearch) {
    return <Navigate to="/" replace />;
  }

  return children;
}
