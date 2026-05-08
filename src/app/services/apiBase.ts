import { Capacitor } from "@capacitor/core";

const DEFAULT_NATIVE_API_BASE_URL = "https://bbaru.vercel.app";

export function createApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const baseUrl = getApiBaseUrl();

  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}

export function getApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_BBARU_API_BASE_URL?.trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  return Capacitor.isNativePlatform() ? DEFAULT_NATIVE_API_BASE_URL : "";
}
