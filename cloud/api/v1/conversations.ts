import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDatabase, requireInstallation } from "../_lib/database.js";
import {
  allowMethods,
  ApiError,
  readObjectBody,
  sendError,
  sendJson,
} from "../_lib/http.js";

const MAX_CONVERSATION_BYTES = 512 * 1024;
const CONVERSATION_ID = /^[A-Za-z0-9_-]{1,128}$/;

type ConversationPayload = {
  id: string;
  pinned?: boolean;
  title: string;
  turns: unknown[];
  updatedAt: string;
};

const parseConversation = (value: unknown): ConversationPayload => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_conversation", "Sohbet nesnesi geçersiz.");
  }
  const conversation = value as Partial<ConversationPayload>;
  const updatedAt = typeof conversation.updatedAt === "string" ? Date.parse(conversation.updatedAt) : Number.NaN;
  if (
    typeof conversation.id !== "string"
    || !CONVERSATION_ID.test(conversation.id)
    || typeof conversation.title !== "string"
    || conversation.title.length < 1
    || conversation.title.length > 80
    || !Array.isArray(conversation.turns)
    || conversation.turns.length > 500
    || !Number.isFinite(updatedAt)
    || updatedAt > Date.now() + 5 * 60 * 1000
  ) {
    throw new ApiError(400, "invalid_conversation", "Sohbet alanları doğrulanamadı.");
  }
  const bytes = Buffer.byteLength(JSON.stringify(conversation), "utf8");
  if (bytes > MAX_CONVERSATION_BYTES) {
    throw new ApiError(413, "conversation_too_large", "Bir sohbet en fazla 512 KiB olabilir.");
  }
  return conversation as ConversationPayload;
};

const queryString = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["GET", "PUT", "DELETE"])) return;
  try {
    const installation = await requireInstallation(request);
    const database = getDatabase();

    if (request.method === "GET") {
      const { data, error } = await database
        .from("line_ai_conversations")
        .select("payload")
        .eq("installation_id", installation.id)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      sendJson(response, 200, { conversations: data.map((row) => row.payload) });
      return;
    }

    if (request.method === "DELETE") {
      const id = queryString(request.query.id);
      const clearAll = queryString(request.query.all) === "true";
      if (!clearAll && (!id || !CONVERSATION_ID.test(id))) {
        throw new ApiError(400, "missing_conversation", "Silinecek sohbet belirtilmedi.");
      }
      let query = database.from("line_ai_conversations").delete().eq("installation_id", installation.id);
      if (!clearAll && id) query = query.eq("conversation_id", id);
      const { error } = await query;
      if (error) throw error;
      response.status(204).end();
      return;
    }

    const body = readObjectBody(request);
    const conversation = parseConversation(body.conversation);
    const { data, error } = await database.rpc("upsert_line_ai_conversation", {
      p_conversation_id: conversation.id,
      p_installation_id: installation.id,
      p_payload: conversation,
      p_pinned: conversation.pinned === true,
      p_title: conversation.title,
      p_updated_at: conversation.updatedAt,
    });
    if (error) {
      if (error.message.includes("storage_quota_exceeded")) {
        throw new ApiError(413, "storage_quota_exceeded", "Kurulumun 3 MiB sohbet kotası doldu.");
      }
      throw error;
    }
    sendJson(response, 200, { version: data });
  } catch (error) {
    sendError(response, error);
  }
}
