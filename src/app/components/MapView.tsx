import { MapPin, Navigation } from "lucide-react";

interface RouteSegment {
  type: "walk" | "wait_signal" | "wait_boarding" | "ride" | "transfer";
  duration: number;
  distance?: number;
}

interface MapViewProps {
  origin?: { lat: number; lng: number; name: string };
  destination?: { lat: number; lng: number; name: string };
  currentPosition?: { lat: number; lng: number };
  route?: RouteSegment[];
  showRoute?: boolean;
}

export function MapView({
  origin,
  destination,
  currentPosition,
  showRoute = false
}: MapViewProps) {
  return (
    <div className="relative w-full h-full bg-[#E8EDF3] overflow-hidden">
      {/* Map Background Pattern */}
      <div className="absolute inset-0">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#D1D9E3" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Route Path */}
      {showRoute && origin && destination && (
        <>
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
            <defs>
              <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#2563EB" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#1E40AF" stopOpacity="1" />
              </linearGradient>
            </defs>
            <path
              d={`M ${origin.lat * 100 + 80} ${origin.lng * 80 + 120}
                  Q ${(origin.lat + destination.lat) * 50 + 150} ${(origin.lng + destination.lng) * 40 + 80}
                  ${destination.lat * 100 + 280} ${destination.lng * 80 + 340}`}
              fill="none"
              stroke="url(#routeGradient)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Dashed overlay for emphasis */}
            <path
              d={`M ${origin.lat * 100 + 80} ${origin.lng * 80 + 120}
                  Q ${(origin.lat + destination.lat) * 50 + 150} ${(origin.lng + destination.lng) * 40 + 80}
                  ${destination.lat * 100 + 280} ${destination.lng * 80 + 340}`}
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="8 12"
              opacity="0.4"
            />
          </svg>

          {/* Segment Indicators */}
          <div className="absolute" style={{ left: '35%', top: '25%', zIndex: 2 }}>
            <div className="bg-white rounded-full p-2 shadow-lg border-2 border-blue-500">
              <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            </div>
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span className="text-xs bg-white px-2 py-0.5 rounded-full shadow-sm border border-neutral-200">
                신호 대기
              </span>
            </div>
          </div>

          <div className="absolute" style={{ left: '58%', top: '48%', zIndex: 2 }}>
            <div className="bg-white rounded-full p-2 shadow-lg border-2 border-blue-500">
              <div className="w-2 h-2 bg-blue-600 rounded-full" />
            </div>
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span className="text-xs bg-white px-2 py-0.5 rounded-full shadow-sm border border-neutral-200">
                2호선 탑승
              </span>
            </div>
          </div>
        </>
      )}

      {/* Origin Marker */}
      {origin && (
        <div className="absolute" style={{ left: '22%', top: '18%', zIndex: 3 }}>
          <div className="relative">
            <div className="w-10 h-10 bg-[#2563EB] rounded-full flex items-center justify-center shadow-lg border-4 border-white">
              <MapPin className="w-5 h-5 text-white" fill="white" />
            </div>
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <div className="bg-white px-3 py-1.5 rounded-lg shadow-md border border-neutral-200">
                <span className="text-sm text-neutral-900">{origin.name}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Destination Marker */}
      {destination && (
        <div className="absolute" style={{ left: '72%', top: '52%', zIndex: 3 }}>
          <div className="relative">
            <div className="w-10 h-10 bg-[#EF4444] rounded-full flex items-center justify-center shadow-lg border-4 border-white">
              <MapPin className="w-5 h-5 text-white" fill="white" />
            </div>
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <div className="bg-white px-3 py-1.5 rounded-lg shadow-md border border-neutral-200">
                <span className="text-sm text-neutral-900">{destination.name}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Current Position Indicator */}
      {currentPosition && (
        <div className="absolute" style={{ left: '42%', top: '35%', zIndex: 4 }}>
          <div className="relative">
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center shadow-xl border-4 border-white animate-pulse">
              <Navigation className="w-6 h-6 text-white" fill="white" />
            </div>
            <div className="absolute inset-0 w-12 h-12 bg-blue-400 rounded-full animate-ping opacity-75" />
          </div>
        </div>
      )}

      {/* Street Labels */}
      <div className="absolute left-8 top-32 text-xs text-neutral-500">강남대로</div>
      <div className="absolute right-12 bottom-32 text-xs text-neutral-500">테헤란로</div>
    </div>
  );
}
