/* global console, process, setTimeout, document, window, localStorage, HTMLTextAreaElement */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const outputDirectory = path.join(projectRoot, "cloud", "media");
const frameDirectory = path.join(
	tmpdir(),
	`line-ai-real-coding-${Date.now()}`,
);
const cdpUrl = process.env.LINE_AI_CDP_URL ?? "http://127.0.0.1:9225";
const ffmpegPath =
	process.env.LINE_AI_FFMPEG ??
	"C:\\Users\\cayxm\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe";
const videoTarget = path.join(
	outputDirectory,
	"line-ai-gercek-kodlama.mp4",
);
const posterTarget = path.join(
	outputDirectory,
	"line-ai-gercek-kodlama-poster.png",
);
const evidenceTarget = path.join(
	outputDirectory,
	"line-ai-gercek-kodlama.evidence.json",
);
const prompt = [
	"Line AI masaüstü asistanı için özgün ve üretimde kullanılabilir bir vektör logo oluştur.",
	"Koyu ve açık zeminde okunabilen, yalın bir konuşma çizgisi ile AI düğümünü birleştiren özgün marka işareti kullan.",
	"Erişilebilir title ve desc içersin; harici görsel, font veya ağ kaynağı kullanma.",
	"Sonucu line-ai-logo.svg adlı gerçek ve indirilebilir SVG artifact olarak ver; kaynak kodu sohbet metnine yazma.",
].join(" ");
const revisionPrompt = [
	"Önceki line-ai-logo.svg dosyasını koruyarak ikinci kararlı sürümü üret.",
	"Marka işaretini değiştirmeden açık zemindeki kontrastı güçlendir, köşe geometrisini daha dengeli yap ve küçük boyutta okunabilir bir LINE AI kelime işareti ekle.",
	"Erişilebilir title ve desc ile harici kaynaksız yapıyı koru.",
	"Tam güncel dosyayı yine line-ai-logo.svg adlı gerçek SVG artifact olarak ver; kaynak kodu sohbet metnine yazma.",
].join(" ");
const captureConversationMarkers = [
	"Line AI masaüstü asistanı için özgün",
	"Oyuncular için karanlık neon temalı",
	"Oyuncular için yüksek kontrastlı",
	"Yalnızca Merhaba yaz",
];

const sleep = (milliseconds) =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

const waitForCompletedPreview = async (page, previousSrcDoc = "") => {
	await page.waitForFunction(
		({ previous }) => {
			const composer = document.querySelector(
				'[aria-label="Line AI\'ya mesaj gönder"]',
			);
			const preview = document.querySelector(
				'iframe[title="line-ai-logo.svg güvenli canlı önizlemesi"]',
			);
			const srcDoc = preview?.getAttribute("srcdoc") ?? "";
			return (
				composer instanceof HTMLTextAreaElement &&
				!composer.disabled &&
				srcDoc.length >= 800 &&
				srcDoc !== previous
			);
		},
		{ previous: previousSrcDoc },
		{ timeout: 360_000 },
	);
};

const sha256 = async (filePath) =>
	createHash("sha256").update(await readFile(filePath)).digest("hex");

await mkdir(outputDirectory, { recursive: true });
await mkdir(frameDirectory, { recursive: true });

let browser;
let recording = false;
let capturePromise;
let frameCount = 0;
let recordingStartedAt;

try {
	browser = await chromium.connectOverCDP(cdpUrl);
	const contexts = browser.contexts();
	const page = contexts.flatMap((context) => context.pages())[0];
	if (!page) {
		throw new Error("Tauri WebView2 sayfası CDP bağlantısında bulunamadı.");
	}
	await page.waitForLoadState("domcontentloaded");
	const nativeBridgeReady = await page.evaluate(
		() => "__TAURI_INTERNALS__" in window,
	);
	if (!nativeBridgeReady) {
		throw new Error("Tauri native köprüsü yüklenen sayfada bulunamadı.");
	}
	await page.evaluate(() => {
		const storageKey = "line-ai.preferences.v1";
		const current = (() => {
			try {
				return JSON.parse(localStorage.getItem(storageKey) ?? "{}") ?? {};
			} catch {
				return {};
			}
		})();
		localStorage.setItem(
			storageKey,
			JSON.stringify({
				...current,
				provider: "auto",
				reasoning: "low",
				truthMode: true,
			}),
		);
	});
	await page.reload({ waitUntil: "networkidle" });

	await page.getByTestId("line-ai-chat-workspace").waitFor({
		state: "visible",
		timeout: 20_000,
	});
	await page.evaluate(async () => {
		await document.fonts.ready;
	});

	const cleanup = await page.evaluate(async ({ markers }) => {
		const invoke = window.__TAURI_INTERNALS__?.invoke;
		if (typeof invoke !== "function") {
			throw new Error("Tauri invoke köprüsü temizlik için hazır değil.");
		}
		const isCaptureConversation = (conversation) => {
			const title =
				typeof conversation?.title === "string" ? conversation.title : "";
			const userPrompts = Array.isArray(conversation?.turns)
				? conversation.turns
						.filter((turn) => turn?.from === "user")
						.map((turn) => (typeof turn.text === "string" ? turn.text : ""))
				: [];
			return markers.some(
				(marker) =>
					title.startsWith(marker) ||
					userPrompts.some((userPrompt) => userPrompt.startsWith(marker)),
			);
		};

		const payload = await invoke("load_cloud_conversations");
		const cloudConversations = Array.isArray(payload?.conversations)
			? payload.conversations
			: [];
		const cloudMatches = cloudConversations.filter(isCaptureConversation);
		for (const conversation of cloudMatches) {
			await invoke("delete_cloud_conversation", { id: conversation.id });
		}

		const legacyKey = "line-ai.conversations.v1";
		const legacyConversations = (() => {
			try {
				const parsed = JSON.parse(localStorage.getItem(legacyKey) ?? "[]");
				return Array.isArray(parsed) ? parsed : [];
			} catch {
				return [];
			}
		})();
		const retainedLegacy = legacyConversations.filter(
			(conversation) => !isCaptureConversation(conversation),
		);
		if (retainedLegacy.length === 0) localStorage.removeItem(legacyKey);
		else localStorage.setItem(legacyKey, JSON.stringify(retainedLegacy));

		return {
			cloudExamined: cloudConversations.length,
			cloudRemoved: cloudMatches.length,
			cloudRetained: cloudConversations.length - cloudMatches.length,
			legacyExamined: legacyConversations.length,
			legacyRemoved: legacyConversations.length - retainedLegacy.length,
			legacyRetained: retainedLegacy.length,
		};
	}, { markers: captureConversationMarkers });
	console.log(`Kayıt denemesi sohbetleri temizlendi: ${JSON.stringify(cleanup)}`);
	await page.reload({ waitUntil: "networkidle" });
	await page.getByTestId("line-ai-chat-workspace").waitFor({
		state: "visible",
		timeout: 20_000,
	});

	const openSettings = page.getByRole("dialog", { name: "Line AI ayarları" });
	if (await openSettings.isVisible().catch(() => false)) {
		await openSettings
			.getByRole("button", { name: "Ayarları kapat" })
			.click();
	}

	await page.getByRole("button", { name: "Yeni sohbet" }).first().click();
	await page.waitForTimeout(650);

	recording = true;
	recordingStartedAt = Date.now();
	capturePromise = (async () => {
		while (recording) {
			const framePath = path.join(
				frameDirectory,
				`frame-${String(frameCount).padStart(6, "0")}.jpg`,
			);
			await page.screenshot({
				animations: "allow",
				path: framePath,
				quality: 84,
				type: "jpeg",
			});
			frameCount += 1;
			await sleep(250);
		}
	})();

	const composer = page.getByRole("textbox", {
		name: "Line AI'ya mesaj gönder",
	});
	await composer.fill(prompt);
	await page.waitForTimeout(900);
	await page.getByRole("button", { name: "Mesajı gönder" }).click();

	const workspace = page.getByLabel(
		"Kod ve canlı önizleme çalışma alanı",
	);
	await workspace.waitFor({ state: "visible", timeout: 180_000 });
	const codeTab = workspace.getByRole("tab", { name: "Kod" });
	const previewTab = workspace.getByRole("tab", { name: "Önizle" });
	const diffTab = workspace.getByRole("tab", { name: "DIFF" });
	await Promise.all([
		codeTab.waitFor({ state: "visible" }),
		previewTab.waitFor({ state: "visible" }),
		diffTab.waitFor({ state: "visible" }),
	]);
	const collapsedSidebar = page.getByRole("complementary", {
		name: "Daraltılmış sohbet kenar çubuğu",
	});
	await collapsedSidebar.waitFor({ state: "visible", timeout: 20_000 });
	await page.getByRole("button", { name: "Kenar çubuğunu genişlet" }).click();
	await page
		.getByRole("complementary", { name: "Sohbet kenar çubuğu" })
		.waitFor({ state: "visible" });
	await page.getByRole("button", { name: "Kenar çubuğunu daralt" }).click();
	await collapsedSidebar.waitFor({ state: "visible" });

	const liveCode = workspace.getByLabel("Canlı yazılan kod");
	await liveCode.waitFor({ state: "visible", timeout: 30_000 });
	await page.waitForFunction(
		() => {
			const node = document.querySelector('[aria-label="Canlı yazılan kod"]');
			return (node?.textContent?.length ?? 0) >= 240;
		},
		undefined,
		{ timeout: 120_000 },
	);
	await waitForCompletedPreview(page);
	const previewFrame = workspace.getByTitle(
		"line-ai-logo.svg güvenli canlı önizlemesi",
	);
	if (!(await previewFrame.isVisible().catch(() => false))) {
		await previewTab.click({ timeout: 240_000 });
	}
	await previewFrame.waitFor({ state: "visible", timeout: 240_000 });
	await page.waitForTimeout(2_400);

	const srcDoc = (await previewFrame.getAttribute("srcdoc")) ?? "";
	if (srcDoc.length < 800) {
		throw new Error(
			`Gerçek sağlayıcı tamamlandı ancak önizleme içeriği yetersiz (${srcDoc.length} karakter).`,
		);
	}
	const initialImageSource = await previewFrame
		.contentFrame()
		.getByRole("img", { name: "Üretilen SVG logo önizlemesi" })
		.getAttribute("src");
	if (!initialImageSource?.startsWith("data:image/svg+xml;charset=utf-8,")) {
		throw new Error(
			"Önizleme açıldı ancak gerçek SVG data image doğrulanamadı.",
		);
	}
	const initialSvg = decodeURIComponent(initialImageSource.split(",", 2)[1] ?? "");
	if (!/<svg[\s>]/i.test(initialSvg) || !/<\/svg>/i.test(initialSvg)) {
		throw new Error("İlk logo önizlemesinde bütün SVG belgesi bulunamadı.");
	}
	const download = workspace.getByRole("button", {
		name: "Etkin dosyayı indir",
	});
	if (await download.isDisabled()) {
		throw new Error("İlk kararlı artifact sonrasında download etkinleşmedi.");
	}
	await workspace
		.getByLabel("Kod denetimi başarılı")
		.waitFor({ state: "visible" });
	await diffTab.click();
	await workspace
		.getByText("Karşılaştırılacak önceki sürüm yok", { exact: true })
		.waitFor({ state: "visible" });
	await page.waitForTimeout(1_200);
	await previewTab.click();

	await composer.fill(revisionPrompt);
	await page.waitForTimeout(850);
	await page.getByRole("button", { name: "Mesajı gönder" }).click();

	await liveCode.waitFor({ state: "visible", timeout: 180_000 });
	await page.waitForFunction(
		() => {
			const node = document.querySelector('[aria-label="Canlı yazılan kod"]');
			return (node?.textContent?.length ?? 0) >= 240;
		},
		undefined,
		{ timeout: 120_000 },
	);
	await waitForCompletedPreview(page, srcDoc);
	if (!(await previewFrame.isVisible().catch(() => false))) {
		await previewTab.click({ timeout: 240_000 });
	}
	await previewFrame.waitFor({ state: "visible", timeout: 240_000 });
	await page.waitForTimeout(2_400);

	const revisedSrcDoc = (await previewFrame.getAttribute("srcdoc")) ?? "";
	if (revisedSrcDoc === srcDoc) {
		throw new Error(
			"İkinci revizyon önceki SVG ile aynı kaldı; gerçek sürüm farkı oluşmadı.",
		);
	}
	const revisedImageSource = await previewFrame
		.contentFrame()
		.getByRole("img", { name: "Üretilen SVG logo önizlemesi" })
		.getAttribute("src");
	const revisedSvg = decodeURIComponent(revisedImageSource?.split(",", 2)[1] ?? "");
	if (!/line ai/i.test(revisedSvg) || !/<title[\s>]/i.test(revisedSvg) || !/<desc[\s>]/i.test(revisedSvg)) {
		throw new Error(
			"İkinci istekte önceki logo hafızası, LINE AI kelime işareti veya erişilebilir metadata doğrulanamadı.",
		);
	}
	await diffTab.click();
	const diffRegion = workspace.getByRole("region", {
		name: "Yerel artifact değişiklikleri: line-ai-logo.svg",
	});
	await diffRegion.waitFor({ state: "visible" });
	const diffCounts = {
		added: await diffRegion.locator('[data-diff-kind="added"]').count(),
		context: await diffRegion.locator('[data-diff-kind="context"]').count(),
		removed: await diffRegion.locator('[data-diff-kind="removed"]').count(),
	};
	if (
		diffCounts.added === 0 ||
		diffCounts.context === 0 ||
		diffCounts.removed === 0
	) {
		throw new Error(
			`İkinci kararlı artifact yerel DIFF satırları eksik: ${JSON.stringify(diffCounts)}`,
		);
	}
	const diffNumbering = await diffRegion
		.locator("[data-diff-kind]")
		.evaluateAll((rows) => ({
			newNumbered: rows.filter((row) => row.getAttribute("data-new-line"))
				.length,
			oldNumbered: rows.filter((row) => row.getAttribute("data-old-line"))
				.length,
		}));
	if (diffNumbering.oldNumbered === 0 || diffNumbering.newNumbered === 0) {
		throw new Error("Yerel DIFF eski/yeni satır numaraları eksik.");
	}
	for (const name of [
		"Kopyala",
		"Yeniden dene",
		"İyi yanıt",
		"Geliştirilebilir yanıt",
		"Mesajı düzenle",
	]) {
		if ((await page.getByRole("button", { name }).count()) === 0) {
			throw new Error(`Mesaj regresyon denetimi bulunamadı: ${name}`);
		}
	}
	const conversationEvidence = await page.evaluate(async () => {
		const invoke = window.__TAURI_INTERNALS__?.invoke;
		const payload = await invoke("load_cloud_conversations");
		const conversation = (payload?.conversations ?? [])
			.filter((candidate) =>
				candidate.turns?.some((turn) => turn.text?.startsWith("Line AI masaüstü asistanı için özgün")),
			)
			.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))[0];
		const assistantTurns =
			conversation?.turns?.filter((turn) => turn.from === "assistant") ?? [];
		const artifacts = assistantTurns.filter((turn) => turn.artifact);
		return {
			artifactTurns: artifacts.length,
			artifactFileNames: artifacts.flatMap(
				(turn) => turn.artifact?.files?.map((file) => file.name) ?? [],
			),
			chatLeaksSvgSource: assistantTurns.some((turn) =>
				/<svg|```svg|xmlns=/i.test(turn.text),
			),
		};
	});
	if (
		conversationEvidence.artifactTurns !== 2 ||
		conversationEvidence.chatLeaksSvgSource ||
		conversationEvidence.artifactFileNames.length !== 2 ||
		conversationEvidence.artifactFileNames.some(
			(fileName) => fileName !== "line-ai-logo.svg",
		)
	) {
		throw new Error(`SVG sohbet/artifact ayrımı başarısız: ${JSON.stringify(conversationEvidence)}`);
	}
	await page.waitForTimeout(2_000);

	await page.screenshot({
		animations: "allow",
		path: posterTarget,
	});
	await page.waitForTimeout(1_500);

	recording = false;
	await capturePromise;
	capturePromise = undefined;

	const recordedDurationSeconds = Math.max(
		1,
		(Date.now() - recordingStartedAt) / 1_000,
	);
	const inputFrameRate = Math.max(1, frameCount / recordedDurationSeconds);
	const fadeOutStart = Math.max(0, recordedDurationSeconds - 0.45);
	const filter = [
		"fps=30",
		"scale=1440:900:flags=lanczos",
		"fade=t=in:st=0:d=0.35",
		`fade=t=out:st=${fadeOutStart.toFixed(3)}:d=0.45`,
		"format=yuv420p",
	].join(",");

	await execFileAsync(
		ffmpegPath,
		[
			"-y",
			"-framerate",
			inputFrameRate.toFixed(6),
			"-i",
			path.join(frameDirectory, "frame-%06d.jpg"),
			"-vf",
			filter,
			"-c:v",
			"libx264",
			"-preset",
			"medium",
			"-crf",
			"20",
			"-movflags",
			"+faststart",
			videoTarget,
		],
		{ maxBuffer: 8 * 1024 * 1024 },
	);

	const evidence = {
		artifact: {
			artifactType: "svg-logo",
			chatSourceHiddenVerified: !conversationEvidence.chatLeaksSvgSource,
			conversation: conversationEvidence,
			diff: {
				...diffCounts,
				...diffNumbering,
				firstVersionEmptyStateVerified: true,
				secondVersionComparedLocally: true,
			},
			fileName: "line-ai-logo.svg",
			initialPreviewCharacters: srcDoc.length,
			previewVerified: true,
			revisedPreviewCharacters: revisedSrcDoc.length,
			secondTurnMemoryVerified: true,
		},
		capture: {
			cleanup,
			durationSeconds: Number(recordedDurationSeconds.toFixed(3)),
			frameCount,
			messageControlsVerified: true,
			sidebarAutoCollapseReopenVerified: true,
			source: "native-tauri-webview2-cdp",
		},
		generatedAt: new Date().toISOString(),
		promptSha256: createHash("sha256").update(prompt).digest("hex"),
		revisionPromptSha256: createHash("sha256")
			.update(revisionPrompt)
			.digest("hex"),
		video: {
			fileName: path.basename(videoTarget),
			sha256: await sha256(videoTarget),
		},
	};
	await writeFile(evidenceTarget, `${JSON.stringify(evidence, null, 2)}\n`);

	console.log(
		JSON.stringify(
			{
				evidence: evidenceTarget,
				poster: posterTarget,
				video: videoTarget,
				...evidence,
			},
			null,
			2,
		),
	);
} finally {
	recording = false;
	if (capturePromise) await capturePromise.catch(() => undefined);
	if (browser) await browser.close().catch(() => undefined);
	await rm(frameDirectory, { force: true, recursive: true });
}
