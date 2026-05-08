const DEFAULT_ALLOWED_ORIGINS = [
  "https://bbaru.vercel.app",
  "http://localhost",
  "https://localhost",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "capacitor://localhost",
  "ionic://localhost",
];

export function handleCors(request, response, methods = ["GET", "POST", "OPTIONS"]) {
  const origin = request.headers.origin || "";
  const allowOrigin = getAllowOrigin(origin);

  response.setHeader("Access-Control-Allow-Origin", allowOrigin);
  response.setHeader("Access-Control-Allow-Methods", methods.join(", "));
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Access-Control-Max-Age", "86400");

  if (origin) {
    response.setHeader("Vary", "Origin");
  }

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return true;
  }

  return false;
}

function getAllowOrigin(origin) {
  const allowedOrigins = getAllowedOrigins();

  if (!origin) {
    return allowedOrigins.includes("*") ? "*" : DEFAULT_ALLOWED_ORIGINS[0];
  }

  if (
    allowedOrigins.includes("*") ||
    allowedOrigins.includes(origin) ||
    origin.startsWith("capacitor://") ||
    origin.startsWith("ionic://")
  ) {
    return origin;
  }

  return DEFAULT_ALLOWED_ORIGINS[0];
}

function getAllowedOrigins() {
  const configuredOrigins = process.env.CORS_ALLOWED_ORIGINS;

  if (!configuredOrigins) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  return configuredOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
