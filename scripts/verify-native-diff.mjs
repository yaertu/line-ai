/* global console, process, window */

import { chromium } from "playwright";

const cdpUrl = process.env.LINE_AI_CDP_URL ?? "http://127.0.0.1:9225";
let browser;

try {
	browser = await chromium.connectOverCDP(cdpUrl);
	const page = browser
		.contexts()
		.flatMap((context) => context.pages())
		.find((candidate) => candidate.url().startsWith("http://127.0.0.1:1430"));
	if (!page) throw new Error("Tauri WebView2 sayfası CDP bağlantısında bulunamadı.");

	await page.waitForLoadState("domcontentloaded");
	await page.getByTestId("line-ai-chat-workspace").waitFor({
		state: "visible",
		timeout: 20_000,
	});
	if (!(await page.evaluate(() => "__TAURI_INTERNALS__" in window))) {
		throw new Error("Tauri native köprüsü bulunamadı.");
	}

	const artifactButtons = page.getByRole("button", {
		name: /KOD · ÖNİZLE · DIFF/,
	});
	await page.waitForTimeout(2_000);
	if ((await artifactButtons.count()) < 2) {
		const expandSidebar = page.getByRole("button", {
			name: "Kenar çubuğunu genişlet",
		});
		if (await expandSidebar.isVisible().catch(() => false)) {
			await expandSidebar.click();
		}
		const captureConversation = page.getByRole("button", {
			name: /Oyuncular için karanlık neon temalı/,
		});
		await captureConversation
			.last()
			.waitFor({ state: "visible", timeout: 20_000 });
		await captureConversation.last().click();
		await artifactButtons
			.nth(1)
			.waitFor({ state: "visible", timeout: 20_000 });
	}
	const artifactCount = await artifactButtons.count();
	if (artifactCount < 2) {
		throw new Error(
			`Fiziksel sürüm karşılaştırması için iki artifact bekleniyordu; ${artifactCount} bulundu.`,
		);
	}

	await artifactButtons.first().click();
	const workspace = page.getByLabel("Kod ve canlı önizleme çalışma alanı");
	await workspace.waitFor({ state: "visible", timeout: 20_000 });
	const tabs = {
		code: workspace.getByRole("tab", { name: "Kod" }),
		diff: workspace.getByRole("tab", { name: "DIFF" }),
		preview: workspace.getByRole("tab", { name: "Önizle" }),
	};
	await Promise.all([
		tabs.code.waitFor({ state: "visible" }),
		tabs.diff.waitFor({ state: "visible" }),
		tabs.preview.waitFor({ state: "visible" }),
	]);
	await tabs.diff.click();
	await workspace
		.getByText("Karşılaştırılacak önceki sürüm yok", { exact: true })
		.waitFor({ state: "visible" });

	await artifactButtons.nth(artifactCount - 1).click();
	await tabs.code.click();
	await workspace.getByLabel("Tamamlanan kod").waitFor({ state: "visible" });
	const download = workspace.getByRole("button", {
		name: "Etkin dosyayı indir",
	});
	if (await download.isDisabled()) throw new Error("Download denetimi devre dışı kaldı.");
	await workspace
		.getByLabel("Kod denetimi başarılı")
		.waitFor({ state: "visible" });

	await tabs.preview.click();
	await workspace
		.getByTitle("index.html güvenli canlı önizlemesi")
		.waitFor({ state: "visible" });
	await tabs.diff.click();
	const diff = workspace.getByRole("region", {
		name: "Yerel artifact değişiklikleri: index.html",
	});
	await diff.waitFor({ state: "visible" });
	const counts = {
		added: await diff.locator('[data-diff-kind="added"]').count(),
		context: await diff.locator('[data-diff-kind="context"]').count(),
		removed: await diff.locator('[data-diff-kind="removed"]').count(),
	};
	if (counts.added === 0 || counts.context === 0 || counts.removed === 0) {
		throw new Error(`Eksik yerel diff satır türü: ${JSON.stringify(counts)}`);
	}
	const numberedRows = await diff.locator("[data-diff-kind]").evaluateAll((rows) => ({
		newNumbered: rows.filter((row) => row.getAttribute("data-new-line")).length,
		oldNumbered: rows.filter((row) => row.getAttribute("data-old-line")).length,
	}));
	if (numberedRows.oldNumbered === 0 || numberedRows.newNumbered === 0) {
		throw new Error("Eski/yeni satır numaraları fiziksel DOM'da doğrulanamadı.");
	}

	const collapsedSidebar = page.getByRole("complementary", {
		name: "Daraltılmış sohbet kenar çubuğu",
	});
	const autoCollapseObserved = await collapsedSidebar
		.isVisible()
		.catch(() => false);
	if (!autoCollapseObserved) {
		await page.getByRole("button", { name: "Kenar çubuğunu daralt" }).click();
		await collapsedSidebar.waitFor({ state: "visible" });
	}
	await page.getByRole("button", { name: "Kenar çubuğunu genişlet" }).click();
	await page
		.getByRole("complementary", { name: "Sohbet kenar çubuğu" })
		.waitFor({ state: "visible" });
	await page.getByRole("button", { name: "Kenar çubuğunu daralt" }).click();
	await collapsedSidebar.waitFor({ state: "visible" });

	const messageControls = {
		assistant: await page.getByLabel("Line AI mesajı işlemleri").count(),
		user: await page.getByLabel("Kullanıcı mesajı işlemleri").count(),
	};
	for (const name of ["Kopyala", "Yeniden dene", "İyi yanıt", "Geliştirilebilir yanıt"]) {
		if ((await page.getByRole("button", { name }).count()) === 0) {
			throw new Error(`Mesaj regresyon denetimi bulunamadı: ${name}`);
		}
	}
	if ((await page.getByRole("button", { name: "Mesajı düzenle" }).count()) === 0) {
		throw new Error("Mesajı düzenle denetimi bulunamadı.");
	}

	console.log(
		JSON.stringify(
			{
				artifactCount,
				diff: { ...counts, ...numberedRows },
				messageControls,
				nativeBridgeReady: true,
				previewVerified: true,
				sidebarAutoCollapseObserved: autoCollapseObserved,
				sidebarCollapseReopenControlVerified: true,
				source: "native-tauri-webview2-cdp",
				tabs: ["KOD", "ÖNİZLE", "DIFF"],
			},
			undefined,
			2,
		),
	);
} finally {
	if (browser) await browser.close().catch(() => undefined);
}
