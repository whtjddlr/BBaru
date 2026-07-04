const API_BASE_URL = trimTrailingSlashes(import.meta.env.VITE_API_BASE_URL?.trim() ?? "");

export function createApiUrl(pathname: string, params?: Record<string, string>): string {
  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const searchParams = new URLSearchParams(params);
  const queryString = searchParams.toString();

  return `${API_BASE_URL}${normalizedPathname}${queryString ? `?${queryString}` : ""}`;
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}
