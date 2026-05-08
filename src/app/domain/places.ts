export interface NamedPlacePoint {
  lat: number;
  lng: number;
  name: string;
  accuracyMeters?: number;
}

export interface ResolvedPlacePoint extends NamedPlacePoint {
  isApproximate?: boolean;
}

export const DEFAULT_CENTER = { lat: 37.4979, lng: 127.0276 };

export const KNOWN_PLACE_COORDINATES: Array<{
  keyword: string;
  lat: number;
  lng: number;
}> = [
  { keyword: "역삼역 멀티 캠퍼스", lat: 37.501328668708, lng: 127.03953821497 },
  { keyword: "역삼 멀티캠퍼스", lat: 37.501328668708, lng: 127.03953821497 },
  { keyword: "멀티캠퍼스", lat: 37.501328668708, lng: 127.03953821497 },
  { keyword: "남성역", lat: 37.484444, lng: 126.971111 },
  { keyword: "역삼역", lat: 37.500622, lng: 127.036456 },
  { keyword: "강남역", lat: 37.4979, lng: 127.0276 },
  { keyword: "선릉역", lat: 37.5045, lng: 127.0489 },
  { keyword: "홍대입구역", lat: 37.5572, lng: 126.9254 },
  { keyword: "합정역", lat: 37.5495, lng: 126.9139 },
  { keyword: "서울역", lat: 37.5547, lng: 126.9706 },
  { keyword: "광화문", lat: 37.5716, lng: 126.9769 },
];

export function searchKnownPlaces(query: string, limit = 6): ResolvedPlacePoint[] {
  const normalizedQuery = normalizePlaceName(query);

  if (!normalizedQuery) {
    return [];
  }

  return KNOWN_PLACE_COORDINATES.filter(({ keyword }) =>
    normalizePlaceName(keyword).includes(normalizedQuery)
  )
    .slice(0, limit)
    .map((place) => ({
      lat: place.lat,
      lng: place.lng,
      name: place.keyword,
      isApproximate: true,
    }));
}

export function resolveDisplayPlacePoint(
  point?: NamedPlacePoint
): ResolvedPlacePoint | undefined {
  if (!point) {
    return undefined;
  }

  const knownPoint = resolveKnownPlacePoint(point.name, point);

  if (knownPoint) {
    return knownPoint;
  }

  return {
    ...point,
    ...DEFAULT_CENTER,
    isApproximate: true,
  };
}

export function resolveKnownPlacePoint(
  name: string,
  point?: Partial<NamedPlacePoint>
): ResolvedPlacePoint | undefined {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  const resolvedName = point?.name || name;

  if (isKoreaCoordinate({ lat, lng, name: resolvedName })) {
    return {
      lat,
      lng,
      name: resolvedName,
      accuracyMeters: point?.accuracyMeters,
    };
  }

  const knownPlace = KNOWN_PLACE_COORDINATES.find(({ keyword }) =>
    resolvedName.includes(keyword)
  );

  if (!knownPlace) {
    return undefined;
  }

  return {
    lat: knownPlace.lat,
    lng: knownPlace.lng,
    name: resolvedName,
    accuracyMeters: point?.accuracyMeters,
    isApproximate: true,
  };
}

export function isKoreaCoordinate(point: Pick<NamedPlacePoint, "lat" | "lng">) {
  return point.lat >= 33 && point.lat <= 39 && point.lng >= 124 && point.lng <= 132;
}

function normalizePlaceName(value: string) {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}
