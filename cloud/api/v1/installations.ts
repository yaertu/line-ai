import { randomBytes } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getDatabase,
  requestFingerprint,
  requireInstallation,
  sha256,
} from "../_lib/database.js";
import { allowMethods, ApiError, sendError, sendJson } from "../_lib/http.js";

const createToken = () => `lai_live_${randomBytes(32).toString("base64url")}`;

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["POST", "DELETE"])) return;

  try {
    const database = getDatabase();
    if (request.method === "DELETE") {
      const installation = await requireInstallation(request);
      const { error } = await database.from("line_ai_installations").delete().eq("id", installation.id);
      if (error) throw error;
      response.status(204).end();
      return;
    }

    const token = createToken();
    const fingerprint = requestFingerprint(request);
    const { data, error } = await database.rpc("register_line_ai_installation", {
      p_ip_hash: fingerprint.ipHash,
      p_secret_hash: sha256(token),
      p_user_agent_hash: fingerprint.userAgentHash,
    });
    if (error) {
      if (error.message.includes("registration_rate_limited")) {
        throw new ApiError(429, "registration_rate_limited", "Bu bağlantıdan çok fazla kurulum isteği geldi.");
      }
      throw error;
    }

    sendJson(response, 201, {
      apiVersion: "v1",
      installationId: data,
      secret: token,
    });
  } catch (error) {
    sendError(response, error);
  }
}
