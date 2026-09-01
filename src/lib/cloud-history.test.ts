import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatConversation } from "@/components/line-ai/chat-template/chat-data";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import {
	loadCloudHistory,
	mergeConversationHistories,
	normalizeConversationHistory,
	saveCloudConversation,
} from "./cloud-history";

const conversation = (
	id: string,
	updatedAt: string,
	text: string,
	pinned = false,
): ChatConversation => ({
	id,
	pinned,
	title: `Sohbet ${id}`,
	turns: [
		{
			from: "user",
			id: `turn-${id}`,
			text,
			timestamp: updatedAt,
		},
	],
	updatedAt,
});

describe("Line AI Cloud sohbet geçmişi", () => {
	beforeEach(() => {
		invoke.mockReset();
	});

	it("bozuk bulut kayıtlarını dışarıda bırakır ve sınırları uygular", () => {
		const valid = conversation(
			"valid-id",
			"2026-08-30T09:00:00.000Z",
			"Merhaba",
		);
		const input = [
			valid,
			{ ...valid, id: "../outside" },
			{ ...valid, id: "missing-turns", turns: "not-an-array" },
			{ ...valid, id: "bad-date", updatedAt: "dün" },
		];

		expect(normalizeConversationHistory(input)).toEqual([
			{ ...valid, archived: false, pinned: false },
		]);
	});

	it("aynı sohbetin en güncel kopyasını seçip sabitlenenleri önce sıralar", () => {
		const cloud = [
			conversation("same", "2026-08-30T10:00:00.000Z", "bulut eski"),
			conversation("cloud", "2026-08-30T12:00:00.000Z", "bulut", true),
		];
		const legacy = [
			conversation("same", "2026-08-30T11:00:00.000Z", "cihaz yeni"),
			conversation("legacy", "2026-08-30T13:00:00.000Z", "cihaz"),
		];

		expect(mergeConversationHistories(cloud, legacy).map(({ id, turns }) => ({
			id,
			text: turns[0]?.text,
		}))).toEqual([
			{ id: "cloud", text: "bulut" },
			{ id: "legacy", text: "cihaz" },
			{ id: "same", text: "cihaz yeni" },
		]);
	});

	it("Tauri komut sözleşmesinde yalnız doğrulanmış sohbetleri kullanır", async () => {
		const valid = conversation(
			"cloud-id",
			"2026-08-30T14:00:00.000Z",
			"Bulut yanıtı",
		);
		invoke.mockResolvedValueOnce({
			conversations: [valid, { title: "kimliksiz" }],
			endpoint: "https://lineaicloud.vercel.app/api/v1",
		});

		await expect(loadCloudHistory()).resolves.toEqual({
			conversations: [{ ...valid, archived: false, pinned: false }],
			endpoint: "https://lineaicloud.vercel.app/api/v1",
		});

		invoke.mockResolvedValueOnce(undefined);
		await saveCloudConversation(valid);
		expect(invoke).toHaveBeenLastCalledWith("upsert_cloud_conversation", {
			conversation: { ...valid, archived: false, pinned: false },
		});
	});
});
