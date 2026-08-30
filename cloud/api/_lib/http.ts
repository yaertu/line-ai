import type { VercelRequest, VercelResponse } from "@vercel/node";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const sendJson = (
  response: VercelResponse,
  status: number,
  body: Record<string, unknown>,
) => {
  response.setHeader("Cache-Control", "no-store");
  response.status(status).json(body);
};

export const sendError = (response: VercelResponse, error: unknown) => {
  if (error instanceof ApiError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message } });
    return;
  }

  console.error("Line AI Cloud request failed", error instanceof Error ? error.message : "unknown_error");
  sendJson(response, 500, {
    error: { code: "internal_error", message: "Bulut isteği tamamlanamadı." },
  });
};

export const allowMethods = (
  request: VercelRequest,
  response: VercelResponse,
  methods: readonly string[],
) => {
  if (request.method && methods.includes(request.method)) return true;
  response.setHeader("Allow", methods.join(", "));
  sendJson(response, 405, {
    error: { code: "method_not_allowed", message: "Bu yöntem desteklenmiyor." },
  });
  return false;
};

export const readObjectBody = (request: VercelRequest): Record<string, unknown> => {
  const body = typeof request.body === "string" ? JSON.parse(request.body) as unknown : request.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_body", "JSON nesnesi bekleniyor.");
  }
  return body as Record<string, unknown>;
};
