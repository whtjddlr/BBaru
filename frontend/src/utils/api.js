const rawApiBaseUrl = import.meta.env.VITE_SAFEETA_API_BASE_URL?.trim() || "";

export const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");

export function apiUrl(path) {
  if (!apiBaseUrl) {
    return path;
  }
  return `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
