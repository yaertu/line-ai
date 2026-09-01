/* global console, window */

import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9225");
try {
	const page = browser.contexts().flatMap((context) => context.pages())[0];
	if (!(await page.evaluate(() => "__TAURI_INTERNALS__" in window))) {
		throw new Error("Tauri native köprüsü bulunamadı.");
	}
	const captureConversationTitle = await page.evaluate(async () => {
		const payload = await window.__TAURI_INTERNALS__?.invoke?.(
			"load_cloud_conversations",
		);
		const conversation = (payload?.conversations ?? [])
			.filter(
				(candidate) =>
					candidate.turns.filter((turn) =>
						turn.artifact?.files?.some(
							(file) => file.name === "line-ai-logo.svg",
						),
					).length >= 2,
			)
			.sort((left, right) =>
				String(right.updatedAt).localeCompare(String(left.updatedAt)),
			)[0];
		return conversation?.title;
	});
	if (!captureConversationTitle) {
		throw new Error("İki kararlı SVG artifact içeren sohbet bulunamadı.");
	}
	await page
		.getByRole("button", { name: captureConversationTitle, exact: true })
		.click();
	const artifactButtons = page.getByRole("button", { name: /KOD · ÖNİZLE · DIFF/ });
	await artifactButtons.first().waitFor({ state: "visible" });
	if ((await artifactButtons.count()) < 2) {
		throw new Error("İki kararlı SVG artifact sürümü bulunamadı.");
	}
	const workspace = page.getByLabel("Kod ve canlı önizleme çalışma alanı");
	await artifactButtons.first().click();
	await workspace.getByRole("tab", { name: "DIFF" }).click();
	await workspace
		.getByText("Karşılaştırılacak önceki sürüm yok", { exact: true })
		.waitFor({ state: "visible" });

	await artifactButtons.last().click();
	await workspace.getByLabel("Kod denetimi başarılı").waitFor({ state: "visible" });
	const download = workspace.getByRole("button", { name: "Etkin dosyayı indir" });
	if (await download.isDisabled()) throw new Error("SVG download denetimi devre dışı.");
	await workspace.getByRole("tab", { name: "Önizle" }).click();
	const frame = workspace.locator('iframe[title="line-ai-logo.svg güvenli canlı önizlemesi"]');
	await frame.waitFor({ state: "visible" });
	const image = frame.contentFrame().getByRole("img", {
		name: "Üretilen SVG logo önizlemesi",
	});
	await image.waitFor({ state: "visible" });
	const source = await image.getAttribute("src");
	if (!source?.startsWith("data:image/svg+xml;charset=utf-8,")) {
		throw new Error("SVG güvenli img önizlemesinde değil.");
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
	const numbered = await diff.locator("[data-diff-kind]").evaluateAll((rows) => ({
		newLines: rows.filter((row) => row.hasAttribute("data-new-line")).length,
		oldLines: rows.filter((row) => row.hasAttribute("data-old-line")).length,
	}));
	if (
		counts.added === 0 ||
		counts.context === 0 ||
		counts.removed === 0 ||
		numbered.newLines === 0 ||
		numbered.oldLines === 0
	) {
		throw new Error(`SVG DIFF eksik: ${JSON.stringify({ ...counts, ...numbered })}`);
	}

	const conversationEvidence = await page.evaluate(async () => {
		const payload = await window.__TAURI_INTERNALS__?.invoke?.("load_cloud_conversations");
		const candidates = (payload?.conversations ?? []).filter(
			(conversation) =>
				conversation.turns.filter((turn) => turn.artifact?.files?.some((file) => file.name === "line-ai-logo.svg")).length >= 2,
		);
		const conversation = candidates.sort((left, right) =>
			String(right.updatedAt).localeCompare(String(left.updatedAt)),
		)[0];
		const assistantTurns =
			conversation?.turns.filter((turn) => turn.from === "assistant") ?? [];
		const artifactTurns = assistantTurns.filter((turn) => turn.artifact);
		return {
			artifactTurns: artifactTurns.length,
			chatLeaksSvgSource: assistantTurns.some((turn) =>
				/<svg|```svg|xmlns=/i.test(turn.text),
			),
		};
	});
	if (conversationEvidence.artifactTurns < 2 || conversationEvidence.chatLeaksSvgSource) {
		throw new Error(`Sohbet/artifact ayrımı başarısız: ${JSON.stringify(conversationEvidence)}`);
	}

	const controls = {
		assistantMessages: await page.getByLabel("Line AI mesajı işlemleri").count(),
		userMessages: await page.getByLabel("Kullanıcı mesajı işlemleri").count(),
	};
	for (const name of ["Kopyala", "Yeniden dene", "İyi yanıt", "Geliştirilebilir yanıt"]) {
		if ((await page.getByRole("button", { name }).count()) === 0) {
			throw new Error(`Mesaj denetimi bulunamadı: ${name}`);
		}
	}
	if ((await page.getByRole("button", { name: "Mesajı düzenle" }).count()) === 0) {
		throw new Error("Mesaj düzenleme denetimi bulunamadı.");
	}

	console.log(
		JSON.stringify(
			{
				artifactCount: await artifactButtons.count(),
				conversationEvidence,
				controls,
				diff: { ...counts, ...numbered },
				nativeBridgeReady: true,
				previewDataImageBytes: source.length,
				source: "native-tauri-webview2-cdp",
			},
			undefined,
			2,
		),
	);
} finally {
	await browser.close();
}
