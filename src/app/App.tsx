import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { MainScreen } from "./components/screens/MainScreen";
import { RouteResultScreen } from "./components/screens/RouteResultScreen";
import { EnRouteScreen } from "./components/screens/EnRouteScreen";
import { DesignSystemGuide } from "./components/screens/DesignSystemGuide";
import { RouteProvider, useRouteState } from "./context/RouteContext";

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
  return (
    <div className="size-full bg-[#F8F9FB]">
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
