import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDatabase } from "../_lib/database.js";
import { allowMethods, sendError, sendJson } from "../_lib/http.js";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["GET"])) return;
  try {
    const database = getDatabase();
    const { error } = await database.from("line_ai_installations").select("id").limit(1);
    if (error) throw error;
    sendJson(response, 200, {
      api: "lineai-cloud",
      database: "ready",
      status: "ok",
      version: "v1",
    });
  } catch (error) {
    sendError(response, error);
  }
}
