import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
	ExecutePromptResult,
	PromptExecutor,
} from "@/components/line-ai/chat-template/chat-data";
import themeStyles from "@/index.css?raw";
import LineAiApp from "@/LineAiApp";

const cloud = vi.hoisted(() => ({
	clearCloudHistory: vi.fn(),
	loadCloudHistory: vi.fn(),
	readCloudStatus: vi.fn(),
	removeCloudConversation: vi.fn(),
	saveCloudConversation: vi.fn(),
}));

vi.mock("@/lib/cloud-history", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/cloud-history")>()),
	...cloud,
}));

describe("Line AI masaüstü çalışma alanı", () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
		cloud.loadCloudHistory.mockResolvedValue({
			conversations: [],
			endpoint: "https://lineaicloud.vercel.app/api/v1",
		});
		cloud.readCloudStatus.mockResolvedValue({
			connected: true,
			endpoint: "https://lineaicloud.vercel.app/api/v1",
			message: "Bulut bağlantısı hazır.",
			registered: true,
		});
		cloud.saveCloudConversation.mockResolvedValue(undefined);
		cloud.removeCloudConversation.mockResolvedValue(undefined);
		cloud.clearCloudHistory.mockResolvedValue(undefined);
	});

	it("Line AI sohbet çalışma alanını sunar", () => {
		render(<LineAiApp executePrompt={vi.fn()} />);

		expect(screen.getByTestId("line-ai-chat-workspace")).toHaveAttribute(
			"data-registry",
			"line-ai/chat-workspace",
		);
		expect(
			screen.getByRole("complementary", { name: "Sohbet kenar çubuğu" }),
		).toBeInTheDocument();
		expect(screen.getByText("Line AI")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Yeni sohbet" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("textbox", { name: "Line AI'ya mesaj gönder" }),
		).toBeInTheDocument();
		expect(
			screen.queryByText(/simulated|smoothui demo|acme deploy/i),
		).not.toBeInTheDocument();
	});

	it("sohbet aramasını yeni sohbet eyleminden önce ve üst alanda sunar", () => {
		render(<LineAiApp executePrompt={vi.fn()} />);

		const search = screen.getByRole("searchbox", { name: "Sohbetlerde ara" });
		const newChat = screen.getByRole("button", { name: "Yeni sohbet" });
		expect(
			search.compareDocumentPosition(newChat) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Sohbetlerde ara" }),
		).toBeInTheDocument();
	});

	it("Ctrl+K komut merkezinde sohbetleri ve gerçek tercih eylemlerini arar", async () => {
		const user = userEvent.setup();
		render(<LineAiApp executePrompt={vi.fn()} />);

		fireEvent.keyDown(window, { ctrlKey: true, key: "k" });
		const palette = screen.getByRole("dialog", {
			name: "Hızlı arama ve komutlar",
		});
		const search = within(palette).getByRole("combobox", {
			name: "Sohbet veya işlem ara",
		});
		await user.type(search, "ayarlar");
		await user.click(
			within(palette).getByRole("option", { name: /Ayarları aç/ }),
		);

		expect(
			screen.getByRole("dialog", { name: "Line AI ayarları" }),
		).toBeInTheDocument();
		await waitFor(() =>
			expect(
				screen.queryByRole("dialog", { name: "Hızlı arama ve komutlar" }),
			).not.toBeInTheDocument(),
		);
	});

	it("mesajı seçilen ortam API sağlayıcısına gönderir ve yanıtı gösterir", async () => {
		const user = userEvent.setup();
		const executePrompt = vi.fn().mockResolvedValue({
			message: "Gerçek OpenAI API yanıtı",
			model: "gpt-5.6-terra",
			provider: "openai",
		});
		render(<LineAiApp executePrompt={executePrompt} />);

		const input = screen.getByRole("textbox", {
			name: "Line AI'ya mesaj gönder",
		});
		await user.type(input, "Bu klasörü açıkla");
		await user.click(screen.getByRole("button", { name: "Mesajı gönder" }));

		expect(executePrompt).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: "Bu klasörü açıkla",
				provider: "auto",
				reasoning: "medium",
				truthMode: true,
			}),
			expect.any(Function),
		);
		const transcript = await screen.findByRole("log", {
			name: "Sohbet mesajları",
		});
		await waitFor(() =>
			expect(transcript).toHaveTextContent("Gerçek OpenAI API yanıtı"),
		);
		expect(
			within(transcript).getByText("Bu klasörü açıkla"),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Bu klasörü açıkla" }),
		).toHaveAttribute("aria-current", "page");
		await waitFor(() =>
			expect(cloud.saveCloudConversation).toHaveBeenCalledWith(
				expect.objectContaining({
					title: "Bu klasörü açıkla",
					turns: expect.arrayContaining([
						expect.objectContaining({
							from: "user",
							text: "Bu klasörü açıkla",
						}),
						expect.objectContaining({
							from: "assistant",
							text: "Gerçek OpenAI API yanıtı",
						}),
					]),
				}),
			),
		);
		expect(localStorage.getItem("line-ai.conversations.v1")).toBeNull();
	});

	it("kullanıcı ve Line AI mesajlarında görünür gerçek işlem denetimleri sunar", async () => {
		const user = userEvent.setup();
		const executePrompt = vi.fn().mockResolvedValue({
			message: "Yeniden üretilen gerçek yanıt",
			model: "test-model",
			provider: "openai",
		});
		localStorage.setItem(
			"line-ai.conversations.v1",
			JSON.stringify([
				{
					id: "conversation-actions",
					title: "Mesaj denetimleri",
					turns: [
						{
							from: "user",
							id: "turn-user-actions",
							text: "Düzenlenecek istek",
							timestamp: "12:00",
						},
						{
							from: "assistant",
							id: "turn-assistant-actions",
							text: "İlk gerçek yanıt",
							timestamp: "12:01",
						},
					],
					updatedAt: new Date().toISOString(),
				},
			]),
		);
		render(<LineAiApp executePrompt={executePrompt} />);

		const userMessage = screen.getByLabelText("Kullanıcı mesajı işlemleri");
		const assistantMessage = screen.getByLabelText("Line AI mesajı işlemleri");
		expect(within(userMessage).getByRole("button", { name: "Kopyala" })).toBeVisible();
		expect(
			within(userMessage).getByRole("button", { name: "Mesajı düzenle" }),
		).toBeVisible();
		expect(
			within(assistantMessage).getByRole("button", { name: "Kopyala" }),
		).toBeVisible();
		expect(
			within(assistantMessage).getByRole("button", { name: "Yeniden dene" }),
		).toBeVisible();
		expect(
			within(assistantMessage).getByRole("button", { name: "İyi yanıt" }),
		).toBeVisible();
		expect(
			within(assistantMessage).getByRole("button", {
				name: "Geliştirilebilir yanıt",
			}),
		).toBeVisible();

		await user.click(
			within(userMessage).getByRole("button", { name: "Mesajı düzenle" }),
		);
		expect(
			screen.getByRole("textbox", { name: "Line AI'ya mesaj gönder" }),
		).toHaveValue("Düzenlenecek istek");

		await user.click(
			within(assistantMessage).getByRole("button", { name: "Yeniden dene" }),
		);
		await waitFor(() =>
			expect(executePrompt).toHaveBeenCalledWith(
				expect.objectContaining({ prompt: "Düzenlenecek istek" }),
				expect.any(Function),
			),
		);
	});

	it("thinking, web kaynağı ve gerçek metin deltalarını tek canlı akışta gösterir", async () => {
		const user = userEvent.setup();
		let finishPrompt!: (value: {
			message: string;
			model: string;
			provider: "openai";
			sources: Array<{ id: string; title: string; url: string }>;
		}) => void;
		const source = {
			id: "source-1",
			title: "Line AI kaynağı",
			url: "https://example.com/line-ai",
		};
		const executePrompt: PromptExecutor = vi.fn((_request, onEvent) => {
			onEvent?.({ kind: "status", label: "İsteği çözümlüyor" });
			onEvent?.({ kind: "search", label: "Web kaynaklarını arıyor" });
			onEvent?.({ kind: "source", source });
			onEvent?.({ kind: "text_delta", text: "Canlı yanıt başlıyor." });
			onEvent?.({
				kind: "text_delta",
				text: "\n```html\n<h1>Sohbette görünmeyecek kod</h1>",
			});
			return new Promise<ExecutePromptResult>((resolve) => {
				finishPrompt = resolve;
			});
		});
		render(<LineAiApp executePrompt={executePrompt} />);

		const input = screen.getByRole("textbox", {
			name: "Line AI'ya mesaj gönder",
		});
		await user.type(input, "Canlı akışı göster");
		await user.click(screen.getByRole("button", { name: "Mesajı gönder" }));

		const liveFlow = await screen.findByRole("status", {
			name: "Canlı yapay zekâ akışı",
		});
		const liveSteps = within(liveFlow).getByRole("list", {
			name: "Canlı işlem adımları",
		});
		expect(liveSteps).toHaveTextContent("İstek hazırlanıyor");
		expect(liveSteps).toHaveTextContent("İsteği çözümlüyor");
		expect(liveSteps).toHaveTextContent("Web kaynaklarını arıyor");
		expect(liveSteps).toHaveTextContent("Kaynakları inceliyor");
		expect(liveSteps).toHaveTextContent("index.html yazılıyor");
		expect(liveFlow).toHaveTextContent("index.html yazılıyor");
		expect(liveFlow).toHaveTextContent(/\d+ KB/);
		expect(liveFlow).toHaveTextContent("example.com");
		expect(
			screen.getByRole("log", { name: "Sohbet mesajları" }),
		).toHaveTextContent("Canlı yanıt başlıyor.");
		expect(
			screen.getByRole("log", { name: "Sohbet mesajları" }),
		).not.toHaveTextContent("Sohbette görünmeyecek kod");
		const liveWorkspace = screen.getByRole("complementary", {
			name: "Kod ve canlı önizleme çalışma alanı",
		});
		expect(liveWorkspace).toHaveTextContent("gerçek akış yazılıyor");
		expect(
			within(liveWorkspace).getByLabelText("Canlı yazılan kod"),
		).toHaveTextContent("Sohbette görünmeyecek kod");
		expect(
			within(liveWorkspace).getByRole("tab", { name: /Önizle/ }),
		).toBeDisabled();
		expect(
			screen.getByRole("complementary", {
				name: "Daraltılmış sohbet kenar çubuğu",
			}),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Kenar çubuğunu genişlet" }),
		).toBeInTheDocument();

		finishPrompt({
			message:
				'Canlı yanıt başlıyor. Tamamlandı.\n```html file=index.html\n<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><h1>Oyuncu merkezi</h1></body></html>\n```',
			model: "gpt-5.6-terra",
			provider: "openai",
			sources: [source],
		});
		await waitFor(() =>
			expect(
				screen.getByRole("log", { name: "Sohbet mesajları" }),
			).toHaveTextContent("Canlı yanıt başlıyor. Tamamlandı."),
		);
		await waitFor(() =>
			expect(
				within(
					screen.getByRole("complementary", {
						name: "Kod ve canlı önizleme çalışma alanı",
					}),
				).getByRole("tab", { name: /Önizle/ }),
			).toHaveAttribute("aria-selected", "true"),
		);
		expect(
			screen.getByTitle("index.html güvenli canlı önizlemesi"),
		).toBeInTheDocument();
		const completedWorkspace = screen.getByRole("complementary", {
			name: "Kod ve canlı önizleme çalışma alanı",
		});
		expect(
			within(completedWorkspace).getByRole("button", {
				name: "Etkin dosyayı indir",
			}),
		).toBeEnabled();
		expect(
			within(completedWorkspace).getByLabelText("Kod denetimi başarılı"),
		).toHaveTextContent("index.html bütünlük denetiminden geçti");
	});

	it("sağlayıcının gerçek unified diff çıktısını okunabilir değişiklik paneline dönüştürür", () => {
		localStorage.setItem(
			"line-ai.conversations.v1",
			JSON.stringify([
				{
					id: "conversation-diff",
					title: "Diff görünümü",
					turns: [
						{
							from: "assistant",
							id: "turn-diff",
							text: "İstenen düzenleme:\n\n```diff\n--- a/index.html\n+++ b/index.html\n-old title\n+new title\n```",
							timestamp: "12:10",
						},
					],
					updatedAt: new Date().toISOString(),
				},
			]),
		);

		render(<LineAiApp executePrompt={vi.fn()} />);

		const diff = screen.getByRole("region", {
			name: "Kod değişikliği: index.html",
		});
		expect(diff).toHaveTextContent("-old title");
		expect(diff).toHaveTextContent("+new title");
		expect(screen.queryByText(/```diff/)).not.toBeInTheDocument();
	});

	it("ilk kararlı artifact sürümünde her zaman görünür DIFF sekmesi boş durumu gösterir", async () => {
		const user = userEvent.setup();
		localStorage.setItem(
			"line-ai.conversations.v1",
			JSON.stringify([
				{
					id: "conversation-first-artifact",
					title: "İlk artifact",
					turns: [
						{
							artifact: {
								createdAt: "2026-08-31T10:00:00.000Z",
								files: [
									{
										content: "alpha\nbeta",
										language: "text",
										name: "notes.txt",
									},
								],
								id: "artifact-first",
								title: "notes.txt",
							},
							from: "assistant",
							id: "turn-first-artifact",
							text: "İlk kararlı sürüm",
							timestamp: "13:00",
						},
					],
					updatedAt: "2026-08-31T10:00:00.000Z",
				},
			]),
		);

		render(<LineAiApp executePrompt={vi.fn()} />);
		await user.click(screen.getByRole("button", { name: /KOD · ÖNİZLE/ }));

		const workspace = screen.getByRole("complementary", {
			name: "Kod ve canlı önizleme çalışma alanı",
		});
		const diffTab = within(workspace).getByRole("tab", { name: "DIFF" });
		expect(diffTab).toBeVisible();
		await user.click(diffTab);

		expect(
			within(workspace).getByRole("region", {
				name: "Yerel artifact değişiklikleri: notes.txt",
			}),
		).toHaveTextContent("Karşılaştırılacak önceki sürüm yok");
	});

	it("ikinci artifact sürümünü önceki kararlı sürümle yerel olarak satır numaralarıyla karşılaştırır", async () => {
		const user = userEvent.setup();
		localStorage.setItem(
			"line-ai.conversations.v1",
			JSON.stringify([
				{
					id: "conversation-versioned-artifact",
					title: "Sürümlü artifact",
					turns: [
						{
							artifact: {
								createdAt: "2026-08-31T10:00:00.000Z",
								files: [
									{
										content: "alpha\nbeta\ngamma",
										language: "text",
										name: "notes.txt",
									},
								],
								id: "artifact-version-1",
								title: "notes.txt",
							},
							from: "assistant",
							id: "turn-version-1",
							text: "İlk kararlı sürüm",
							timestamp: "13:00",
						},
						{
							from: "user",
							id: "turn-revision-request",
							text: "İkinci sürümü üret",
							timestamp: "13:01",
						},
						{
							artifact: {
								createdAt: "2026-08-31T10:02:00.000Z",
								files: [
									{
										content: "alpha\nbeta updated\ngamma\ndelta",
										language: "text",
										name: "notes.txt",
									},
								],
								id: "artifact-version-2",
								title: "notes.txt",
							},
							from: "assistant",
							id: "turn-version-2",
							text: "İkinci kararlı sürüm",
							timestamp: "13:02",
						},
					],
					updatedAt: "2026-08-31T10:02:00.000Z",
				},
			]),
		);

		render(<LineAiApp executePrompt={vi.fn()} />);
		const artifactButtons = screen.getAllByRole("button", {
			name: /KOD · ÖNİZLE/,
		});
		await user.click(artifactButtons[artifactButtons.length - 1]);

		const workspace = screen.getByRole("complementary", {
			name: "Kod ve canlı önizleme çalışma alanı",
		});
		await user.click(within(workspace).getByRole("tab", { name: "DIFF" }));
		const diff = within(workspace).getByRole("region", {
			name: "Yerel artifact değişiklikleri: notes.txt",
		});

		expect(
			within(diff).getByLabelText("Bağlam: eski 1, yeni 1: alpha"),
		).toBeVisible();
		expect(
			within(diff).getByLabelText("Silinen: eski 2, yeni yok: beta"),
		).toBeVisible();
		expect(
			within(diff).getByLabelText(
				"Eklenen: eski yok, yeni 2: beta updated",
			),
		).toBeVisible();
		expect(
			within(diff).getByLabelText("Bağlam: eski 3, yeni 3: gamma"),
		).toBeVisible();
		expect(
			within(diff).getByLabelText("Eklenen: eski yok, yeni 4: delta"),
		).toBeVisible();
	});

	it("kenar çubuğunu erişilebilir bir ikon rayına daraltır", async () => {
		const user = userEvent.setup();
		render(<LineAiApp executePrompt={vi.fn()} />);

		await user.click(
			screen.getByRole("button", { name: "Kenar çubuğunu daralt" }),
		);

		expect(
			screen.getByRole("complementary", {
				name: "Daraltılmış sohbet kenar çubuğu",
			}),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Kenar çubuğunu genişlet" }),
		).toBeInTheDocument();
	});

	it("geçmiş sohbeti son işlem saatiyle gösterir", () => {
		const updatedAt = new Date();
		updatedAt.setHours(14, 35, 0, 0);
		localStorage.setItem(
			"line-ai.conversations.v1",
			JSON.stringify([
				{
					id: "conversation-time",
					title: "Zaman damgalı sohbet",
					turns: [
						{
							from: "user",
							id: "turn-time",
							text: "Merhaba",
							timestamp: "14:35",
						},
					],
					updatedAt: updatedAt.toISOString(),
				},
			]),
		);

		render(<LineAiApp executePrompt={vi.fn()} />);

		expect(
			within(
				screen.getByRole("button", { name: "Zaman damgalı sohbet" }),
			).getByText("14:35"),
		).toBeInTheDocument();
	});

	it("sohbet sağ tık menüsüyle yeniden adlandırır ve onayla siler", async () => {
		const user = userEvent.setup();
		localStorage.setItem(
			"line-ai.conversations.v1",
			JSON.stringify([
				{
					id: "conversation-1",
					title: "Eski başlık",
					turns: [
						{ from: "user", id: "turn-1", text: "Merhaba", timestamp: "12:00" },
					],
					updatedAt: new Date().toISOString(),
				},
			]),
		);
		render(<LineAiApp executePrompt={vi.fn()} />);

		fireEvent.contextMenu(screen.getByRole("button", { name: "Eski başlık" }), {
			clientX: 80,
			clientY: 120,
		});
		expect(
			screen.getByRole("menu", { name: "Sohbet işlemleri" }),
		).toBeInTheDocument();
		await user.click(
			screen.getByRole("menuitem", { name: "Yeniden adlandır" }),
		);

		const renameDialog = screen.getByRole("dialog", {
			name: "Sohbeti yeniden adlandır",
		});
		const titleInput = within(renameDialog).getByLabelText("Sohbet başlığı");
		await user.clear(titleInput);
		await user.type(titleInput, "Yeni başlık");
		await user.click(
			within(renameDialog).getByRole("button", { name: "Kaydet" }),
		);
		expect(
			screen.getByRole("button", { name: "Yeni başlık" }),
		).toBeInTheDocument();

		fireEvent.contextMenu(screen.getByRole("button", { name: "Yeni başlık" }), {
			clientX: 80,
			clientY: 120,
		});
		await user.click(screen.getByRole("menuitem", { name: "Sohbeti sil" }));
		const deleteDialog = screen.getByRole("dialog", {
			name: "Sohbet silinsin mi?",
		});
		expect(themeStyles).toContain(
			"--color-destructive-foreground: var(--destructive-foreground);",
		);
		expect(within(deleteDialog).getByText("Silinecek sohbet")).toBeVisible();
		expect(
			within(deleteDialog).getByLabelText("Silinecek sohbet başlığı"),
		).toHaveTextContent("Yeni başlık");
		expect(deleteDialog).toHaveTextContent(
			"Bu sohbetin 1 mesajı Line AI Cloud geçmişinden kaldırılacak.",
		);
		expect(
			within(deleteDialog).getByRole("button", { name: "Vazgeç" }),
		).toHaveFocus();
		await user.keyboard("{Escape}");
		expect(
			screen.queryByRole("dialog", { name: "Sohbet silinsin mi?" }),
		).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Yeni başlık" })).toHaveFocus();

		fireEvent.contextMenu(screen.getByRole("button", { name: "Yeni başlık" }), {
			clientX: 80,
			clientY: 120,
		});
		await user.click(screen.getByRole("menuitem", { name: "Sohbeti sil" }));
		const reopenedDeleteDialog = screen.getByRole("dialog", {
			name: "Sohbet silinsin mi?",
		});
		await user.click(
			within(reopenedDeleteDialog).getByRole("button", { name: "Sohbeti sil" }),
		);

		expect(screen.getByText("Henüz sohbet yok")).toBeInTheDocument();
		await waitFor(() =>
			expect(cloud.removeCloudConversation).toHaveBeenCalledWith(
				"conversation-1",
			),
		);
		expect(localStorage.getItem("line-ai.conversations.v1")).toBeNull();
	});

	it("silinen sohbeti zaman sınırlı geri alma kaydıyla geri getirir", async () => {
		const user = userEvent.setup();
		localStorage.setItem(
			"line-ai.conversations.v1",
			JSON.stringify([
				{
					id: "conversation-undo",
					title: "Geri alınacak sohbet",
					turns: [
						{
							from: "user",
							id: "turn-undo",
							text: "Merhaba",
							timestamp: "12:00",
						},
					],
					updatedAt: new Date().toISOString(),
				},
			]),
		);
		render(<LineAiApp executePrompt={vi.fn()} />);

		fireEvent.contextMenu(
			screen.getByRole("button", { name: "Geri alınacak sohbet" }),
			{
				clientX: 80,
				clientY: 120,
			},
		);
		await user.click(screen.getByRole("menuitem", { name: "Sohbeti sil" }));
		await user.click(
			within(
				screen.getByRole("dialog", { name: "Sohbet silinsin mi?" }),
			).getByRole("button", { name: "Sohbeti sil" }),
		);
		expect(screen.getByRole("status")).toHaveTextContent("Sohbet silindi");

		await user.click(screen.getByRole("button", { name: "Geri al" }));
		expect(
			screen.getByRole("button", { name: "Geri alınacak sohbet" }),
		).toBeInTheDocument();
	});

	it("sohbeti sağ tık menüsünden sabitleyip ayrı grupta saklar", async () => {
		const user = userEvent.setup();
		localStorage.setItem(
			"line-ai.conversations.v1",
			JSON.stringify([
				{
					id: "conversation-pin",
					title: "Sabitlenecek sohbet",
					turns: [
						{
							from: "user",
							id: "turn-pin",
							text: "Merhaba",
							timestamp: new Date().toISOString(),
						},
					],
					updatedAt: new Date().toISOString(),
				},
			]),
		);
		render(<LineAiApp executePrompt={vi.fn()} />);

		fireEvent.contextMenu(
			screen.getByRole("button", { name: "Sabitlenecek sohbet" }),
			{
				clientX: 80,
				clientY: 120,
			},
		);
		await user.click(screen.getByRole("menuitem", { name: "Sohbeti sabitle" }));

		expect(screen.getByText("Sabitlenenler")).toBeInTheDocument();
		await waitFor(() =>
			expect(cloud.saveCloudConversation).toHaveBeenCalledWith(
				expect.objectContaining({ id: "conversation-pin", pinned: true }),
			),
		);
	});

	it("sidebar genişliğini klavye ile değiştirip cihazda saklar", async () => {
		render(<LineAiApp executePrompt={vi.fn()} />);
		const separator = screen.getByRole("separator", {
			name: "Kenar çubuğu genişliğini ayarla",
		});

		fireEvent.keyDown(separator, { key: "ArrowRight" });

		expect(separator).toHaveAttribute("aria-valuenow", "288");
		await waitFor(() =>
			expect(localStorage.getItem("line-ai.sidebar-width.v1")).toBe("288"),
		);
	});

	it("mesaj sağ tık menüsünden alıntı oluşturur", async () => {
		const user = userEvent.setup();
		localStorage.setItem(
			"line-ai.conversations.v1",
			JSON.stringify([
				{
					id: "conversation-2",
					title: "Alıntı denemesi",
					turns: [
						{
							from: "assistant",
							id: "turn-2",
							text: "Kanıtlanmış sonuç",
							timestamp: "12:01",
						},
					],
					updatedAt: new Date().toISOString(),
				},
			]),
		);
		render(<LineAiApp executePrompt={vi.fn()} />);

		fireEvent.contextMenu(screen.getByLabelText("Line AI mesajı işlemleri"), {
			clientX: 300,
			clientY: 220,
		});
		expect(
			screen.getByRole("menu", { name: "Mesaj işlemleri" }),
		).toBeInTheDocument();
		await user.click(screen.getByRole("menuitem", { name: "Mesajı alıntıla" }));

		expect(
			screen.getByRole("textbox", { name: "Line AI'ya mesaj gönder" }),
		).toHaveValue("> Kanıtlanmış sonuç\n\n");
	});

	it("ayarları gerçek sohbet tercihleriyle birlikte yönetir", async () => {
		const user = userEvent.setup();
		const executePrompt = vi.fn().mockResolvedValue({
			message: "Gemini yanıtı",
			model: "gemini-test",
			provider: "gemini",
		});
		render(<LineAiApp executePrompt={executePrompt} />);

		await user.click(screen.getByRole("button", { name: "Ayarları aç" }));
		const settings = screen.getByRole("dialog", { name: "Line AI ayarları" });
		await user.click(
			within(settings).getByRole("button", { name: "Yapay zekâ" }),
		);
		await user.click(within(settings).getByRole("button", { name: /^Gemini/ }));
		await user.click(within(settings).getByRole("button", { name: /^Derin/ }));
		await user.click(
			within(settings).getByRole("button", { name: /^Truth Mode/ }),
		);
		await user.click(
			within(settings)
				.getAllByRole("button", { name: "Ayarları kapat" })
				.at(-1)!,
		);

		const input = screen.getByRole("textbox", {
			name: "Line AI'ya mesaj gönder",
		});
		await user.type(input, "Tercihleri doğrula");
		await user.click(screen.getByRole("button", { name: "Mesajı gönder" }));

		await waitFor(() =>
			expect(executePrompt).toHaveBeenCalledWith(
				expect.objectContaining({
					provider: "gemini",
					reasoning: "high",
					truthMode: false,
				}),
				expect.any(Function),
			),
		);
		expect(
			JSON.parse(localStorage.getItem("line-ai.preferences.v1") ?? "null"),
		).toEqual({
			browserTools: true,
			chatFontSize: 15,
			codeFontSize: 13,
			customInstructions: "",
			motion: "system",
			provider: "gemini",
			reasoning: "high",
			responseStyle: "balanced",
			theme: "system",
			truthMode: false,
			uiFontSize: 14,
		});
	});

	it("komut panelini yalnız artı yazıldığında açar ve seçimi gönderime uygular", async () => {
		const user = userEvent.setup();
		const executePrompt = vi.fn().mockResolvedValue({
			message: "Tamam",
			model: "gemini-test",
			provider: "gemini",
		});
		render(<LineAiApp executePrompt={executePrompt} />);

		expect(
			screen.queryByRole("menu", { name: "Line AI komutları" }),
		).not.toBeInTheDocument();
		const input = screen.getByRole("textbox", {
			name: "Line AI'ya mesaj gönder",
		});
		await user.type(input, "+gemini");
		const commandMenu = screen.getByRole("menu", { name: "Line AI komutları" });
		await user.click(
			within(commandMenu).getByRole("menuitem", { name: /Sağlayıcı: Gemini/ }),
		);
		expect(input).toHaveValue("");

		await user.type(input, "Komut seçimi çalıştı mı?");
		await user.click(screen.getByRole("button", { name: "Mesajı gönder" }));
		await waitFor(() =>
			expect(executePrompt).toHaveBeenCalledWith(
				expect.objectContaining({
					provider: "gemini",
					prompt: "Komut seçimi çalıştı mı?",
				}),
				expect.any(Function),
			),
		);
	});
});
