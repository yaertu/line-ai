/* global console, process, document, window */

import { chromium } from "playwright";

const cdpUrl = process.env.LINE_AI_CDP_URL ?? "http://127.0.0.1:9225";
const prompt = [
	"Oyuncular için yüksek kaliteli, karanlık neon temalı ve tamamen çalışan tek dosyalık bir e-spor topluluk landing sayfası oluştur.",
	"Responsive hero, yaklaşan turnuva kartları, canlı oyuncu istatistikleri, takım bölümü, erişilebilir klavye odağı ve prefers-reduced-motion desteği içersin.",
	"Harici ağ kaynağı kullanma; CSS ve JavaScript aynı HTML dosyasında olsun.",
	"Kısa bir girişten sonra çıktıyı tam olarak html dilinde, file=index.html adlı fenced kod bloğunda ver.",
].join(" ");

const browser = await chromium.connectOverCDP(cdpUrl);
try {
	const page = browser.contexts().flatMap((context) => context.pages())[0];
	page.on("console", (message) => console.log(`[browser:${message.type()}] ${message.text()}`));
	page.on("pageerror", (error) => console.log(`[browser:error] ${error.message}`));
	await page.waitForLoadState("domcontentloaded");
	const dialog = page.getByRole("dialog", { name: "Line AI ayarları" });
	if (await dialog.isVisible().catch(() => false)) {
		await dialog.getByRole("button", { name: "Ayarları kapat" }).click();
	}
	await page.getByRole("button", { name: "Yeni sohbet" }).first().click();
	const composer = page.getByRole("textbox", {
		name: "Line AI'ya mesaj gönder",
	});
	await composer.fill(prompt);
	await page.getByRole("button", { name: "Mesajı gönder" }).click();
	console.log(
		JSON.stringify(
			await page.evaluate(() => ({
				composerValue: document.querySelector('textarea[aria-label="Line AI\'ya mesaj gönder"]')?.value ?? null,
				tauri: "__TAURI_INTERNALS__" in window,
				text: (document.body.innerText ?? "").split("\n").filter(Boolean).slice(-12),
			})),
		),
	);

	const startedAt = Date.now();
	for (;;) {
		await page.waitForTimeout(2_000);
		const state = await page.evaluate(() => ({
			live: (document.querySelector('[aria-label="Canlı yazılan kod"]')?.textContent ?? "").length,
			preview: (document.querySelector('iframe[title="index.html güvenli canlı önizlemesi"]')?.getAttribute("srcdoc") ?? "").length,
			workspace: Boolean(document.querySelector('[aria-label="Kod ve canlı önizleme çalışma alanı"]')),
			writing: (document.body.innerText ?? "").includes("Yanıtı yazıyor"),
			bodyTail: (document.body.innerText ?? "").split("\n").filter(Boolean).slice(-6),
		}));
		console.log(JSON.stringify({ elapsedSeconds: Math.round((Date.now() - startedAt) / 1_000), ...state }));
		if (state.preview >= 1_200) break;
		if (Date.now() - startedAt > 120_000) {
			throw new Error("Native akış 120 saniyede doğrulanamadı.");
		}
	}
} finally {
	await browser.close().catch(() => undefined);
}
