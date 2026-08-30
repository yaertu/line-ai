import { createHash, timingSafeEqual } from "node:crypto";
import type { VercelRequest } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { ApiError } from "./http.js";

const INSTALLATION_HEADER = "x-lineai-installation";
const TOKEN_PATTERN = /^lai_live_[A-Za-z0-9_-]{43}$/;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const hashPrivateValue = (value: string) => {
  const pepper = process.env.LINE_AI_IP_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new ApiError(503, "cloud_not_configured", "Bulut güvenlik yapılandırması tamamlanmadı.");
  }
  return sha256(`${pepper}:${value}`);
};

export const getDatabase = () => {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) {
    throw new ApiError(503, "database_unavailable", "Bulut veritabanı bağlantısı hazır değil.");
  }
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
};

const getSingleHeader = (request: VercelRequest, name: string) => {
  const raw = request.headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
};

export const requestFingerprint = (request: VercelRequest) => {
  const forwarded = getSingleHeader(request, "x-vercel-forwarded-for")
    ?? getSingleHeader(request, "x-forwarded-for")
    ?? getSingleHeader(request, "x-real-ip")
    ?? "unknown";
  const ip = forwarded.split(",", 1)[0]?.trim() || "unknown";
  const userAgent = getSingleHeader(request, "user-agent") ?? "unknown";
  return {
    ipHash: hashPrivateValue(`ip:${ip}`),
    userAgentHash: hashPrivateValue(`ua:${userAgent.slice(0, 512)}`),
  };
};

export type InstallationIdentity = { id: string; tokenHash: string };

export const requireInstallation = async (request: VercelRequest): Promise<InstallationIdentity> => {
  const installationId = getSingleHeader(request, INSTALLATION_HEADER) ?? "";
  const authorization = getSingleHeader(request, "authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (!ID_PATTERN.test(installationId) || !TOKEN_PATTERN.test(token)) {
    throw new ApiError(401, "invalid_credentials", "Line AI kurulum kimliği geçersiz.");
  }

  const tokenHash = sha256(token);
  const database = getDatabase();
  const { data, error } = await database
    .from("line_ai_installations")
    .select("id,secret_hash,status")
    .eq("id", installationId)
    .maybeSingle();

  if (error) throw error;
  const storedHash = typeof data?.secret_hash === "string" ? data.secret_hash : "";
  const equalLength = storedHash.length === tokenHash.length;
  const matches = equalLength && timingSafeEqual(Buffer.from(storedHash), Buffer.from(tokenHash));
  if (!data || data.status !== "active" || !matches) {
    throw new ApiError(401, "invalid_credentials", "Line AI kurulum kimliği doğrulanamadı.");
  }

  await database
    .from("line_ai_installations")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", installationId);

  return { id: installationId, tokenHash };
};
