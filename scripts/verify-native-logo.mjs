/* global console, process, setInterval, clearInterval, window, localStorage, document, HTMLTextAreaElement */

import { chromium } from "playwright";

const cdpUrl = process.env.LINE_AI_CDP_URL ?? "http://127.0.0.1:9225";
const firstPrompt = [
	"Line AI masaüstü asistanı için özgün ve üretimde kullanılabilir bir vektör logo oluştur.",
	"Koyu ve açık zeminde okunabilen, yalın bir konuşma çizgisi ile AI düğümünü birleştiren özgün marka işareti kullan.",
	"Erişilebilir title ve desc içersin; harici görsel, font veya ağ kaynağı kullanma.",
	"Sonucu line-ai-logo.svg adlı gerçek ve indirilebilir SVG artifact olarak ver; kaynak kodu sohbet metnine yazma.",
].join(" ");
const secondPrompt = [
	"Önceki line-ai-logo.svg dosyasını koruyarak ikinci kararlı sürümü üret.",
	"Marka işaretini değiştirmeden açık zemindeki kontrastı güçlendir, köşe geometrisini daha dengeli yap ve küçük boyutta okunabilir bir LINE AI kelime işareti ekle.",
	"Erişilebilir title ve desc ile harici kaynaksız yapıyı koru.",
	"Tam güncel dosyayı yine line-ai-logo.svg adlı gerçek SVG artifact olarak ver; kaynak kodu sohbet metnine yazma.",
].join(" ");

let browser;
const statuses = new Set();

const waitForTurn = async (page, previousArtifactCount) => {
	const composer = page.getByRole("textbox", { name: "Line AI'ya mesaj gönder" });
	await page
		.getByRole("button", { name: /KOD · ÖNİZLE · DIFF/ })
		.nth(previousArtifactCount)
		.waitFor({ state: "visible", timeout: 360_000 });
	await page.waitForFunction(
		() => {
			const input = document.querySelector("textarea");
			return input instanceof HTMLTextAreaElement && !input.disabled;
		},
		undefined,
		{ timeout: 360_000 },
	);
	await composer.waitFor({ state: "visible" });
};

const verifySvgPreview = async (workspace) => {
	const previewTab = workspace.getByRole("tab", { name: "Önizle" });
	await previewTab.click();
	const frame = workspace.locator('iframe[title$="güvenli canlı önizlemesi"]');
	await frame.waitFor({ state: "visible", timeout: 20_000 });
	const image = frame.contentFrame().getByRole("img", {
		name: "Üretilen SVG logo önizlemesi",
	});
	await image.waitFor({ state: "visible", timeout: 20_000 });
	const source = await image.getAttribute("src");
	if (!source?.startsWith("data:image/svg+xml;charset=utf-8,")) {
		throw new Error("SVG önizlemesi güvenli data image olarak yüklenmedi.");
	}
	return { frameTitle: await frame.getAttribute("title"), sourceLength: source.length };
};

try {
	browser = await chromium.connectOverCDP(cdpUrl);
	const page = browser
		.contexts()
		.flatMap((context) => context.pages())
		.find((candidate) => candidate.url().startsWith("http://127.0.0.1:1430"));
	if (!page) throw new Error("Tauri WebView2 sayfası CDP bağlantısında bulunamadı.");

	await page.waitForLoadState("domcontentloaded");
	if (!(await page.evaluate(() => "__TAURI_INTERNALS__" in window))) {
		throw new Error("Tauri native köprüsü bulunamadı.");
	}
	await page.evaluate(() => {
		const storageKey = "line-ai.preferences.v1";
		const current = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
		localStorage.setItem(
			storageKey,
			JSON.stringify({ ...current, provider: "auto", reasoning: "low", truthMode: true }),
		);
	});
	await page.reload({ waitUntil: "networkidle" });
	await page.getByTestId("line-ai-chat-workspace").waitFor({ state: "visible" });
	await page.getByRole("button", { name: "Yeni sohbet" }).first().click();

	const statusTimer = setInterval(async () => {
		const value = await page
			.getByRole("status", { name: "Canlı yapay zekâ akışı" })
			.textContent()
			.catch(() => "");
		if (value?.trim()) statuses.add(value.trim());
	}, 100);

	const composer = page.getByRole("textbox", { name: "Line AI'ya mesaj gönder" });
	await composer.fill(firstPrompt);
	await page.getByRole("button", { name: "Mesajı gönder" }).click();
	await waitForTurn(page, 0);

	const workspace = page.getByLabel("Kod ve canlı önizleme çalışma alanı");
	await workspace.waitFor({ state: "visible", timeout: 20_000 });
	const firstPreview = await verifySvgPreview(workspace);
	const firstAssistant = page.getByLabel("Line AI mesajı işlemleri").last();
	const firstText = await firstAssistant.innerText();
	if (/<svg|```svg|xmlns=/i.test(firstText)) {
		throw new Error("SVG kaynak kodu sohbet metnine sızdı.");
	}
	const download = workspace.getByRole("button", { name: "Etkin dosyayı indir" });
	if (await download.isDisabled()) throw new Error("SVG indirme denetimi devre dışı.");
	await workspace.getByRole("tab", { name: "DIFF" }).click();
	await workspace
		.getByText("Karşılaştırılacak önceki sürüm yok", { exact: true })
		.waitFor({ state: "visible" });

	await composer.fill(secondPrompt);
	await page.getByRole("button", { name: "Mesajı gönder" }).click();
	await waitForTurn(page, 1);
	clearInterval(statusTimer);

	const artifactButtons = page.getByRole("button", { name: /KOD · ÖNİZLE · DIFF/ });
	const artifactCount = await artifactButtons.count();
	if (artifactCount < 2) throw new Error("İkinci kararlı SVG artifact sürümü oluşmadı.");
	await artifactButtons.last().click();
	const secondPreview = await verifySvgPreview(workspace);
	const secondAssistant = page.getByLabel("Line AI mesajı işlemleri").last();
	const secondText = await secondAssistant.innerText();
	if (/<svg|```svg|xmlns=/i.test(secondText)) {
		throw new Error("İkinci SVG kaynak kodu sohbet metnine sızdı.");
	}

	await workspace.getByRole("tab", { name: "DIFF" }).click();
	const diff = workspace.getByRole("region", {
		name: "Yerel artifact değişiklikleri: line-ai-logo.svg",
	});
	await diff.waitFor({ state: "visible" });
	const counts = {
		added: await diff.locator('[data-diff-kind="added"]').count(),
		context: await diff.locator('[data-diff-kind="context"]').count(),
		removed: await diff.locator('[data-diff-kind="removed"]').count(),
	};
	if (counts.added === 0 || counts.context === 0 || counts.removed === 0) {
		throw new Error(`İkinci SVG sürümünün yerel DIFF türleri eksik: ${JSON.stringify(counts)}`);
	}
	const numbered = await diff.locator("[data-diff-kind]").evaluateAll((rows) => ({
		newLines: rows.filter((row) => row.hasAttribute("data-new-line")).length,
		oldLines: rows.filter((row) => row.hasAttribute("data-old-line")).length,
	}));
	if (numbered.newLines === 0 || numbered.oldLines === 0) {
		throw new Error("SVG DIFF eski/yeni satır numaralarını göstermiyor.");
	}

	const statusList = [...statuses];
	if (!statusList.some((status) => /Gemini bağlantısı deneniyor/.test(status))) {
		throw new Error(`Provider deneme durumu gözlenmedi: ${JSON.stringify(statusList)}`);
	}
	if (!statusList.some((status) => /line-ai-logo\.svg yazılıyor · \d+(?:[.,]\d+)? KB/.test(status))) {
		throw new Error(`Dosya ve boyut yazma durumu gözlenmedi: ${JSON.stringify(statusList)}`);
	}

	console.log(
		JSON.stringify(
			{
				artifactCount,
				diff: { ...counts, ...numbered },
				firstPreview,
				nativeBridgeReady: true,
				providerStatuses: statusList,
				secondPreview,
				source: "native-tauri-webview2-cdp",
				svgSourceHiddenFromChat: true,
			},
			undefined,
			2,
		),
	);
} finally {
	if (browser) await browser.close().catch(() => undefined);
}
