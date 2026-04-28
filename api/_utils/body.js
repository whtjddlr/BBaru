export async function readJsonBody(request) {
  if (isPlainObject(request.body)) {
    return request.body;
  }

  let rawBody = "";

  if (typeof request.json === "function") {
    try {
      return await request.json();
    } catch {
      // Fall through to text/stream parsing for runtimes that expose both APIs.
    }
  }

  if (typeof request.text === "function") {
    rawBody = await request.text();
  } else if (typeof request.body === "string") {
    rawBody = request.body;
  } else if (Buffer.isBuffer(request.body)) {
    rawBody = request.body.toString("utf8");
  } else {
    rawBody = await readRequestStream(request);
  }

  const trimmedBody = rawBody.trim();

  if (!trimmedBody) {
    return {};
  }

  try {
    return JSON.parse(trimmedBody);
  } catch {
    const normalizedBody = trimmedBody
      .replace(/^'(.*)'$/s, "$1")
      .replace(/\\"/g, '"');
    return JSON.parse(normalizedBody);
  }
}

function readRequestStream(request) {
  return new Promise((resolve, reject) => {
    if (typeof request.on !== "function") {
      resolve("");
      return;
    }

    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function isPlainObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Buffer.isBuffer(value) &&
      typeof value.getReader !== "function" &&
      typeof value.pipe !== "function"
  );
}
