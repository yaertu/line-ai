import { invoke } from "@tauri-apps/api/core";
import type {
	ChatConversation,
	ChatTurn,
} from "@/components/line-ai/chat-template/chat-data";

const MAX_CONVERSATIONS = 100;
const MAX_TURNS = 500;
const MAX_TITLE_LENGTH = 80;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export type CloudConnectionState =
	| "connecting"
	| "connected"
	| "offline"
	| "unsynced";

export type CloudStatus = {
	connected: boolean;
	endpoint: string;
	message: string;
	registered: boolean;
};

export type CloudHistory = {
	conversations: ChatConversation[];
	endpoint: string;
};

const validIsoDate = (value: unknown): value is string =>
	typeof value === "string" && !Number.isNaN(Date.parse(value));

const isStoredTurn = (value: unknown): value is ChatTurn => {
	if (!value || typeof value !== "object") return false;
	const turn = value as Partial<ChatTurn>;
	return (
		(turn.from === "user" || turn.from === "assistant") &&
		ID_PATTERN.test(turn.id ?? "") &&
		typeof turn.text === "string" &&
		typeof turn.timestamp === "string" &&
		turn.timestamp.trim().length > 0
	);
};

const normalizeConversation = (value: unknown): ChatConversation | null => {
	if (!value || typeof value !== "object") return null;
	const conversation = value as Partial<ChatConversation>;
	if (
		!ID_PATTERN.test(conversation.id ?? "") ||
		typeof conversation.title !== "string" ||
		conversation.title.trim().length === 0 ||
		!Array.isArray(conversation.turns) ||
		!conversation.turns.every(isStoredTurn) ||
		!validIsoDate(conversation.updatedAt)
	) {
		return null;
	}

	return {
		archived: conversation.archived === true,
		id: conversation.id as string,
		pinned: conversation.pinned === true,
		title: conversation.title.trim().slice(0, MAX_TITLE_LENGTH),
		turns: conversation.turns.slice(-MAX_TURNS),
		updatedAt: conversation.updatedAt,
	};
};

const sortConversations = (items: ChatConversation[]) =>
	items.sort(
		(left, right) =>
			Number(right.pinned === true) - Number(left.pinned === true) ||
			Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
	);

export const normalizeConversationHistory = (
	value: unknown,
): ChatConversation[] => {
	if (!Array.isArray(value)) return [];
	return sortConversations(
		value
			.map(normalizeConversation)
			.filter((item): item is ChatConversation => item !== null)
			.slice(0, MAX_CONVERSATIONS),
	);
};

export const mergeConversationHistories = (
	cloud: ChatConversation[],
	legacy: ChatConversation[],
): ChatConversation[] => {
	const merged = new Map<string, ChatConversation>();
	for (const conversation of normalizeConversationHistory([
		...cloud,
		...legacy,
	])) {
		const current = merged.get(conversation.id);
		if (
			!current ||
			Date.parse(conversation.updatedAt) > Date.parse(current.updatedAt)
		) {
			merged.set(conversation.id, conversation);
		}
	}
	return sortConversations([...merged.values()]).slice(0, MAX_CONVERSATIONS);
};

export const readCloudStatus = () => invoke<CloudStatus>("get_cloud_status");

export const loadCloudHistory = async (): Promise<CloudHistory> => {
	const payload = await invoke<{ conversations: unknown; endpoint: unknown }>(
		"load_cloud_conversations",
	);
	return {
		conversations: normalizeConversationHistory(payload.conversations),
		endpoint: typeof payload.endpoint === "string" ? payload.endpoint : "",
	};
};

export const saveCloudConversation = async (
	conversation: ChatConversation,
): Promise<void> => {
	const normalized = normalizeConversation(conversation);
	if (!normalized) {
		throw new Error("Buluta kaydedilecek sohbet geçersiz.");
	}
	await invoke("upsert_cloud_conversation", { conversation: normalized });
};

export const removeCloudConversation = async (id: string): Promise<void> => {
	if (!ID_PATTERN.test(id)) {
		throw new Error("Silinecek bulut sohbetinin kimliği geçersiz.");
	}
	await invoke("delete_cloud_conversation", { id });
};

export const clearCloudHistory = () =>
	invoke<void>("clear_cloud_conversations");

export const deleteCloudInstallation = () =>
	invoke<void>("delete_cloud_installation");
