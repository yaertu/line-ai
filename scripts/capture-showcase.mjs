/* global console, document, fetch, process */

import { access, copyFile, mkdir, rm } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const outputDirectory = path.join(projectRoot, "cloud", "media");
const recordingDirectory = path.join(
	tmpdir(),
	`line-ai-showcase-${Date.now()}`,
);
const applicationUrl = process.env.LINE_AI_CAPTURE_URL ?? "http://127.0.0.1:1430";

const chromeCandidates = [
	"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];
const executablePath = chromeCandidates.find(existsSync);

if (!executablePath) {
	throw new Error("Google Chrome bulunamadı; gerçek Line AI kaydı üretilemedi.");
}

const response = await fetch(applicationUrl);
if (!response.ok) {
	throw new Error(
		`Line AI geliştirme sunucusu hazır değil: HTTP ${response.status}`,
	);
}

await mkdir(outputDirectory, { recursive: true });
await mkdir(recordingDirectory, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true });
const outputs = [];

async function captureClip({ name, posterAt, run }) {
	const clipDirectory = path.join(recordingDirectory, name);
	await mkdir(clipDirectory, { recursive: true });
	const context = await browser.newContext({
		colorScheme: "dark",
		deviceScaleFactor: 1,
		recordVideo: {
			dir: clipDirectory,
			size: { height: 900, width: 1440 },
		},
		reducedMotion: "no-preference",
		viewport: { height: 900, width: 1440 },
	});
	const page = await context.newPage();
	const capturedVideo = page.video();
	const pause = (milliseconds) => page.waitForTimeout(milliseconds);
	const posterTarget = path.join(outputDirectory, `${name}-poster.png`);
	const videoTarget = path.join(outputDirectory, `${name}.webm`);

	try {
		await page.goto(`${applicationUrl}/?theme=dark`, {
			waitUntil: "networkidle",
		});
		await page.evaluate(async () => {
			await document.fonts.ready;
		});
		await page.getByTestId("line-ai-chat-workspace").waitFor();
		await pause(1_250);
		await run({ page, pause });
		if (posterAt) await posterAt({ page, pause });
		await page.screenshot({
			animations: "allow",
			fullPage: false,
			path: posterTarget,
		});
		await pause(1_000);
	} finally {
		await context.close();
	}

	if (!capturedVideo) {
		throw new Error(`${name}: Playwright video kaydı başlatılamadı.`);
	}

	const recordedPath = await capturedVideo.path();
	await access(recordedPath, constants.R_OK);
	await copyFile(recordedPath, videoTarget);
	outputs.push({ name, poster: posterTarget, video: videoTarget });
}

try {
	await captureClip({
		name: "line-ai-gercek-akis",
		run: async ({ page, pause }) => {
			await page.getByRole("button", { name: "Sohbetlerde ara" }).first().click();
			const conversationSearch = page.getByRole("searchbox", {
				name: "Sohbetlerde ara",
			});
			await conversationSearch.fill("tasarım sistemi");
			await pause(1_100);
			await conversationSearch.fill("");
			await pause(500);
			await page.getByRole("button", { name: "Yeni sohbet" }).first().click();
			await pause(850);
			const prompt = page.getByRole("textbox", {
				name: "Line AI'ya mesaj gönder",
			});
			await prompt.fill("Modern bir ürün sayfası için erişilebilir arayüz planı hazırla");
			await pause(1_300);
			await prompt.fill("+");
			await pause(1_250);
			await page.keyboard.press("Escape");
			await prompt.fill("");
			await pause(650);
		},
	});

	await captureClip({
		name: "line-ai-ayarlar-akisi",
		run: async ({ page, pause }) => {
			await page.getByRole("button", { name: "Ayarları aç" }).click();
			await page.getByRole("dialog", { name: "Line AI ayarları" }).waitFor();
			await pause(850);
			await page.getByRole("button", { exact: true, name: "Görünüm" }).click();
			await pause(900);
			const lightTheme = page.getByRole("button", { name: /^Açık/ });
			if (await lightTheme.count()) {
				await lightTheme.first().click();
				await pause(900);
			}
			const darkTheme = page.getByRole("button", { name: /^Koyu/ });
			if (await darkTheme.count()) {
				await darkTheme.first().click();
				await pause(900);
			}
			await page.getByRole("button", { exact: true, name: "Yapay zekâ" }).click();
			await pause(1_000);
		},
		posterAt: async ({ page, pause }) => {
			await page.getByRole("button", { exact: true, name: "Görünüm" }).click();
			await pause(750);
		},
	});

	await captureClip({
		name: "line-ai-baglanti-akisi",
		run: async ({ page, pause }) => {
			await page.getByRole("button", { name: "Ayarları aç" }).click();
			await page.getByRole("dialog", { name: "Line AI ayarları" }).waitFor();
			await page.getByRole("button", { exact: true, name: "Tarayıcı" }).click();
			await pause(1_400);
			await page.getByRole("button", { exact: true, name: "Bulut verileri" }).click();
			await pause(1_300);
			await page.getByRole("button", { exact: true, name: "Arşivlenen sohbetler" }).click();
			await pause(1_050);
		},
		posterAt: async ({ page, pause }) => {
			await page.getByRole("button", { exact: true, name: "Tarayıcı" }).click();
			await pause(750);
		},
	});
} finally {
	await browser.close();
	await rm(recordingDirectory, { force: true, recursive: true });
}

console.log(
	JSON.stringify(
		{
			clips: outputs,
			source: applicationUrl,
		},
		null,
		2,
	),
);
