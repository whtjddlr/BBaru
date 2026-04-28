const SOLAR_API_URL = getSolarApiUrl();
const SOLAR_MODEL = process.env.UPSTAGE_SOLAR_MODEL || process.env.UPSTAGE_MODEL || "solar-pro3";

const SYSTEM_PROMPT = `
You convert Korean mobility requests into JSON for BBARU, an ETA planning app.
Return JSON only. Do not include markdown.

Schema:
{
  "origin": "string",
  "destination": "string",
  "targetArrivalTime": "HH:mm in 24-hour time",
  "strategy": "safe" | "balanced" | "ontime",
  "context": "short Korean summary",
  "preferences": {
    "walkingPace": "slow" | "normal" | "fast",
    "transferBufferMinutes": number,
    "signalBufferMinutes": number
  }
}

Rules:
- Use "balanced" unless the user clearly asks for extra margin, safety, or exact arrival.
- Use "normal" walking pace unless the user says they are slow, fast, hurried, or relaxed.
- If a field is unknown, infer a reasonable value from the request.
`.trim();

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.UPSTAGE_API_KEY;

  if (!apiKey) {
    return response.status(503).json({
      code: "SOLAR_NOT_CONFIGURED",
      error: "UPSTAGE_API_KEY is not configured",
    });
  }

  let body;

  try {
    body =
      typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body;
  } catch {
    return response.status(400).json({ error: "invalid JSON body" });
  }

  const text = String(body?.text || "").trim();

  if (!text) {
    return response.status(400).json({ error: "text is required" });
  }

  try {
    const solarResponse = await fetch(SOLAR_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: SOLAR_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
        temperature: 0.1,
      }),
    });

    if (!solarResponse.ok) {
      const errorText = await solarResponse.text();
      return response.status(502).json({
        code: "SOLAR_UPSTREAM_ERROR",
        error: errorText || "Solar request failed",
      });
    }

    const payload = await solarResponse.json();
    const content = payload?.choices?.[0]?.message?.content;

    if (!content) {
      return response.status(502).json({
        code: "SOLAR_EMPTY_RESPONSE",
        error: "Solar returned an empty response",
      });
    }

    const intent = JSON.parse(extractJson(content));
    return response.status(200).json({ intent });
  } catch (error) {
    return response.status(500).json({
      code: "SOLAR_PARSE_ERROR",
      error: error instanceof Error ? error.message : "Solar response could not be parsed",
    });
  }
}

function extractJson(content) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);

  if (fenced) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function getSolarApiUrl() {
  const configuredUrl = process.env.UPSTAGE_API_BASE_URL;

  if (!configuredUrl) {
    return "https://api.upstage.ai/v1/chat/completions";
  }

  return configuredUrl.endsWith("/chat/completions")
    ? configuredUrl
    : `${configuredUrl.replace(/\/$/, "")}/chat/completions`;
}
