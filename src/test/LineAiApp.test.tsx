import {
	act,
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

const engine = vi.hoisted(() => ({
	deleteEngineImage: vi.fn(),
	deleteEngineKey: vi.fn(),
	downloadEngineAsset: vi.fn(),
	generateEngineImage: vi.fn(),
	getEngineAsset: vi.fn(),
	getEngineImage: vi.fn(),
	readEngineStatus: vi.fn(),
	saveEngineKey: vi.fn(),
	submitEngineFeedback: vi.fn(),
}));

vi.mock("@/lib/cloud-history", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/cloud-history")>()),
	...cloud,
}));

vi.mock("@/lib/ai", () => engine);

describe("Line AI masaüstü çalışma alanı", () => {
	beforeEach(() => {
		localStorage.clear();
		delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
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
		engine.readEngineStatus.mockResolvedValue({
			configured: true,
			endpoint: "https://lineaicloud.vercel.app/api/v1",
			message: "Engine hazır.",
			capabilities: {
				enabled: true,
				images: true,
				text: true,
				key: { state: "active", scopes: ["text", "images", "feedback"], expiresAt: "2026-12-01T00:00:00.000Z" },
				periods: { dailyResetsAt: "2026-09-13T00:00:00.000Z", monthlyResetsAt: "2026-10-01T00:00:00.000Z" },
				policyVersion: "1.0.0",
				project: { id: "project-1", name: "Demo Proje" },
				quota: { dailyUnits: 50, monthlyUnits: 500, usedDaily: 3, usedMonthly: 30, remainingDailyUnits: 47, remainingMonthlyUnits: 470, dailyCostMicros: 500000, monthlyCostMicros: 5000000, usedDailyCostMicros: 1200, usedMonthlyCostMicros: 8900, remainingDailyCostMicros: 498800, remainingMonthlyCostMicros: 4991100 },
				usage: { requestCountThisMonth: 17 },
			},
		});
		engine.saveEngineKey.mockResolvedValue(undefined);
		engine.deleteEngineKey.mockResolvedValue(undefined);
		engine.generateEngineImage.mockResolvedValue({
			id: "job-1",
			status: "completed",
			assetId: "asset-1",
			model: "line-ai-vision-v1",
			createdAt: "2026-09-12T00:00:00.000Z",
		});
		engine.getEngineImage.mockResolvedValue({ id: "job-1", status: "completed", assetId: "asset-1" });
		engine.getEngineAsset.mockResolvedValue("https://assets.example.test/image.webp");
		engine.downloadEngineAsset.mockResolvedValue({ path: "C:\\Downloads\\Line AI Images\\line-ai-job-1.png", bytes: 123 });
		engine.deleteEngineImage.mockResolvedValue(undefined);
		engine.submitEngineFeedback.mockResolvedValue({ saved: true, trainingOptIn: true });
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
		expect(screen.getAllByText("Line AI").length).toBeGreaterThan(0);
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

	it("üst çubukta canlı Engine sağlığını ve kalan günlük kotayı gösterir", async () => {
		Object.defineProperty(window, "__TAURI_INTERNALS__", {
			configurable: true,
			value: {},
		});
		render(<LineAiApp executePrompt={vi.fn()} />);

		const status = await screen.findByRole("status", {
			name: "Line AI Engine durumu",
		});
		expect(status).toHaveTextContent("Engine hazır");
		expect(status).toHaveTextContent("47 birim");
		expect(engine.readEngineStatus).toHaveBeenCalledTimes(1);
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

	it("Hakkında ekranında güncel sürümü ve eklenen çalışma alanı altyapısını açıklar", async () => {
		const user = userEvent.setup();
		render(<LineAiApp executePrompt={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Ayarları aç" }));
		const settings = screen.getByRole("dialog", { name: "Line AI ayarları" });
		await user.click(
			within(settings).getByRole("button", { name: "Hakkında" }),
		);

		expect(
			within(settings).getByRole("heading", { name: "Line AI v0.7.0" }),
		).toBeInTheDocument();
		expect(
			within(settings).getByRole("heading", {
				name: "Yenilikler · v0.7.0",
			}),
		).toBeInTheDocument();
		expect(within(settings).getByText("Ultra Premium çalışma alanı")).toBeInTheDocument();
		expect(
			within(settings).getByText("Canlı Engine sağlığı"),
		).toBeInTheDocument();
		expect(
			within(settings).getByText(/bağlanma çalışması sürüyor/i),
		).toBeInTheDocument();
	});

	it("mesajı yalnız Line AI Engine'e gönderir ve yanıtı gösterir", async () => {
		const user = userEvent.setup();
		const executePrompt = vi.fn().mockResolvedValue({
			message: "Gerçek Line AI Engine yanıtı",
			model: "line-ai-neural-v1",
			provider: "lineai",
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
				provider: "lineai",
				reasoning: "medium",
				truthMode: true,
			}),
			expect.any(Function),
		);
		const transcript = await screen.findByRole("log", {
			name: "Sohbet mesajları",
		});
		await waitFor(() =>
			expect(transcript).toHaveTextContent("Gerçek Line AI Engine yanıtı"),
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
							text: "Gerçek Line AI Engine yanıtı",
						}),
					]),
				}),
			),
		);
		expect(localStorage.getItem("line-ai.conversations.v1")).toBeNull();
	});

	it("eski yerel model tercihini Line AI ve açık doğruluk korumasına taşır", async () => {
		localStorage.setItem(
			"line-ai.preferences.v1",
			JSON.stringify({
				localEndpoint: "http://127.0.0.1:11434/v1",
				localEngine: "ollama",
				localModel: "llama3.2",
				provider: "local",
				truthMode: false,
			}),
		);
		const user = userEvent.setup();
		const executePrompt = vi.fn().mockResolvedValue({
			message: "Line AI yanıtı",
			model: "engine-test",
			provider: "lineai",
			sources: [],
		});
		render(<LineAiApp executePrompt={executePrompt} />);

		await user.type(
			screen.getByRole("textbox", { name: "Line AI'ya mesaj gönder" }),
			"Geçiş tercihini doğrula",
		);
		await user.click(screen.getByRole("button", { name: "Mesajı gönder" }));

		await waitFor(() =>
			expect(executePrompt).toHaveBeenCalledWith(
				expect.objectContaining({ provider: "lineai", truthMode: true }),
				expect.any(Function),
			),
		);
		await waitFor(() => {
			const stored = JSON.parse(
				localStorage.getItem("line-ai.preferences.v1") ?? "null",
			);
			expect(stored).toMatchObject({ provider: "lineai", truthMode: true });
			expect(stored).not.toHaveProperty("localEndpoint");
			expect(stored).not.toHaveProperty("localEngine");
			expect(stored).not.toHaveProperty("localModel");
		});
	});

	it("kullanıcı ve Line AI mesajlarında görünür gerçek işlem denetimleri sunar", async () => {
		const user = userEvent.setup();
		const executePrompt = vi.fn().mockResolvedValue({
			message: "Yeniden üretilen gerçek yanıt",
			model: "test-model",
			provider: "lineai",
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
			provider: "lineai";
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
			model: "line-ai-neural-v1",
			provider: "lineai",
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

	it("Engine'in gerçek unified diff çıktısını okunabilir değişiklik paneline dönüştürür", () => {
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
		expect(screen.getByText("Sohbet silindi").closest('[role="status"]')).toBeInTheDocument();

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
			message: "Line AI Engine yanıtı",
			model: "line-ai-neural-v1",
			provider: "lineai",
		});
		render(<LineAiApp executePrompt={executePrompt} />);

		await user.click(screen.getByRole("button", { name: "Ayarları aç" }));
		const settings = screen.getByRole("dialog", { name: "Line AI ayarları" });
		await user.click(
			within(settings).getByRole("button", { name: "Yapay zekâ" }),
		);
		expect(
			within(settings).queryByRole("button", { name: /^Gemini/ }),
		).not.toBeInTheDocument();
		expect(
			within(settings).queryByRole("button", { name: /^OpenAI/ }),
		).not.toBeInTheDocument();
		await user.click(within(settings).getByRole("button", { name: /^Derin/ }));
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
					provider: "lineai",
					reasoning: "high",
					truthMode: true,
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
			provider: "lineai",
			reasoning: "high",
			responseStyle: "balanced",
			theme: "dark",
			truthMode: true,
			uiFontSize: 14,
		});
	});

	it("Engine anahtarını yalnız native kayda gönderir ve giriş alanını temizler", async () => {
		const user = userEvent.setup();
		render(<LineAiApp executePrompt={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Ayarları aç" }));
		const settings = screen.getByRole("dialog", { name: "Line AI ayarları" });
		await user.click(within(settings).getByRole("button", { name: "Yapay zekâ" }));
		const key = within(settings).getByLabelText("Line AI Engine API anahtarı");
		await user.type(key, `lai_sk_live_${"A".repeat(43)}`);
		await user.click(within(settings).getByRole("button", { name: "Kaydet" }));

		await waitFor(() =>
			expect(engine.saveEngineKey).toHaveBeenCalledWith(
				`lai_sk_live_${"A".repeat(43)}`,
			),
		);
		expect(key).toHaveValue("");
		expect(localStorage.getItem("line-ai.preferences.v1")).not.toContain(
			"lai_sk_live_",
		);
	});

	it("Engine panelinde güvenli anahtar sağlığını, istek sayısını ve maliyet bütçesini gösterir", async () => {
		const user = userEvent.setup();
		render(<LineAiApp executePrompt={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Ayarları aç" }));
		const settings = screen.getByRole("dialog", { name: "Line AI ayarları" });
		await user.click(within(settings).getByRole("button", { name: "Yapay zekâ" }));

		await waitFor(() => expect(within(settings).getByText(/Aylık 17 istek/)).toBeVisible());
		expect(within(settings).getByText(/Anahtar aktif/)).toBeVisible();
		expect(within(settings).getByText(/4,99 maliyet kredisi/)).toBeVisible();
	});

	it("bulut hydration beklerken gelen asistan yanıtını silmez", async () => {
		localStorage.setItem(
			"line-ai.conversations.v1",
			JSON.stringify([
				{
					id: "conversation-hydration-race",
					title: "Hydration yarışı",
					turns: [
						{
							from: "user",
							id: "turn-hydration-start",
							text: "İlk mesaj",
							timestamp: "10:00",
						},
					],
					updatedAt: "2026-09-12T10:00:00.000Z",
				},
			]),
		);
		let finishStatus: ((value: Awaited<ReturnType<typeof cloud.readCloudStatus>>) => void) | undefined;
		cloud.readCloudStatus.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finishStatus = resolve;
				}),
		);
		const user = userEvent.setup();
		let finishPrompt!: (result: ExecutePromptResult) => void;
		const executePrompt = vi.fn().mockImplementation(
			() =>
				new Promise<ExecutePromptResult>((resolve) => {
					finishPrompt = resolve;
				}),
		);
		render(<LineAiApp executePrompt={executePrompt} />);

		await waitFor(() => expect(cloud.readCloudStatus).toHaveBeenCalled());
		const input = screen.getByRole("textbox", {
			name: "Line AI'ya mesaj gönder",
		});
		await user.type(input, "Hydration sürerken yanıtla");
		await user.click(screen.getByRole("button", { name: "Mesajı gönder" }));
		await waitFor(() => expect(executePrompt).toHaveBeenCalledTimes(1));
		expect(screen.getByRole("log", { name: "Sohbet mesajları" })).toHaveTextContent(
			"Hydration sürerken yanıtla",
		);
		await act(async () => {
			finishPrompt({
				message: "Geç gelen asistan yanıtı",
				model: "engine-test",
				provider: "lineai",
				requestId: "request-hydration-race",
				sources: [],
			});
		});
		expect(screen.getByRole("log", { name: "Sohbet mesajları" })).toHaveTextContent(
			"Geç gelen asistan yanıtı",
		);

		await act(async () => {
			finishStatus?.({
				connected: true,
				endpoint: "https://lineaicloud.vercel.app/api/v1",
				message: "Bulut bağlantısı hazır.",
				registered: true,
			});
		});
		await waitFor(() =>
			expect(
				screen.getByRole("log", { name: "Sohbet mesajları" }),
			).toHaveTextContent("Geç gelen asistan yanıtı"),
		);
	});

	it("Line AI yanıt notunu yalnız açık izinle native geri bildirim isteğine ekler", async () => {
		localStorage.setItem(
			"line-ai.preferences.v1",
			JSON.stringify({ provider: "lineai" }),
		);
		const user = userEvent.setup();
		const executePrompt = vi.fn().mockResolvedValue({
			message: "Engine yanıtı",
			model: "engine-text",
			provider: "lineai",
			requestId: "request-feedback-1",
			sources: [],
		});
		render(<LineAiApp executePrompt={executePrompt} />);

		const input = screen.getByRole("textbox", {
			name: "Line AI'ya mesaj gönder",
		});
		await user.type(input, "Bu yanıtı değerlendir");
		await user.click(screen.getByRole("button", { name: "Mesajı gönder" }));
		const feedback = await screen.findByRole("form", {
			name: "Line AI yanıt geri bildirimi",
		});
		await user.click(
			within(feedback).getByRole("button", { name: "İyi Line AI yanıtı" }),
		);
		expect(
			within(feedback).getByRole("textbox", { name: "Line AI geri bildirim notu" }),
		).toBeDisabled();
		await user.click(
			within(feedback).getByRole("checkbox", {
				name: "Notumu Line AI geliştirmesinde kullan",
			}),
		);
		await user.type(
			within(feedback).getByRole("textbox", { name: "Line AI geri bildirim notu" }),
			"Daha somut örnek ekleyin.",
		);
		await user.click(
			within(feedback).getByRole("button", { name: "Geri bildirimi gönder" }),
		);

		await waitFor(() =>
			expect(engine.submitEngineFeedback).toHaveBeenCalledWith({
				note: "Daha somut örnek ekleyin.",
				rating: "up",
				requestId: "request-feedback-1",
				trainingOptIn: true,
			}),
		);
  expect(localStorage.getItem("line-ai.conversations.v1") ?? "").not.toContain(
			"Daha somut örnek ekleyin.",
		);
	});

	it("Image Studio gerçek Engine işi, önizleme ve native indirmeyi kullanır", async () => {
		const user = userEvent.setup();
		render(<LineAiApp executePrompt={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Image Studio" }));
		const studio = screen.getByRole("dialog", { name: "Line AI Image Studio" });
		const prompt = within(studio).getByRole("textbox", { name: /^Görsel istemi/ });
		await user.type(prompt, "İstanbul üzerinde film afişi");
		await user.click(within(studio).getByRole("button", { name: "poster" }));
		await user.click(within(studio).getByRole("button", { name: "high" }));
		await user.click(within(studio).getByRole("button", { name: "Görsel üret" }));

		await waitFor(() =>
			expect(engine.generateEngineImage).toHaveBeenCalledWith({
				prompt: "İstanbul üzerinde film afişi",
				aspectRatio: "1:1",
				quality: "high",
				style: "poster",
			}),
		);
		await waitFor(() =>
			expect(within(studio).getByRole("img", { name: "İstanbul üzerinde film afişi" })).toHaveAttribute(
				"src",
				"https://assets.example.test/image.webp",
			),
		);
		await user.click(within(studio).getByRole("button", { name: "İndir" }));
		await waitFor(() => expect(engine.downloadEngineAsset).toHaveBeenCalledWith("asset-1", "line-ai-job-1.png"));
	});

	it("komut panelini yalnız artı yazıldığında açar ve seçimi gönderime uygular", async () => {
		const user = userEvent.setup();
		const executePrompt = vi.fn().mockResolvedValue({
			message: "Tamam",
			model: "line-ai-neural-v1",
			provider: "lineai",
		});
		render(<LineAiApp executePrompt={executePrompt} />);

		expect(
			screen.queryByRole("menu", { name: "Line AI komutları" }),
		).not.toBeInTheDocument();
		const input = screen.getByRole("textbox", {
			name: "Line AI'ya mesaj gönder",
		});
		await user.type(input, "+derin");
		const commandMenu = screen.getByRole("menu", { name: "Line AI komutları" });
		await user.click(
			within(commandMenu).getByRole("menuitem", { name: /Akıl yürütme: Derin/ }),
		);
		expect(input).toHaveValue("");

		await user.type(input, "Komut seçimi çalıştı mı?");
		await user.click(screen.getByRole("button", { name: "Mesajı gönder" }));
		await waitFor(() =>
			expect(executePrompt).toHaveBeenCalledWith(
				expect.objectContaining({
					provider: "lineai",
					prompt: "Komut seçimi çalıştı mı?",
					reasoning: "high",
				}),
				expect.any(Function),
			),
		);
	});
});
