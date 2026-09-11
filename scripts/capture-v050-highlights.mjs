/* global console, document, fetch, process */

import { access, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const outputDirectory = path.join(projectRoot, "cloud", "media");
const recordingDirectory = path.join(tmpdir(), `line-ai-v050-${Date.now()}`);
const applicationUrl = process.env.LINE_AI_CAPTURE_URL ?? "http://127.0.0.1:1430";
const ffmpegPath = process.env.LINE_AI_FFMPEG ?? "ffmpeg";
const videoTarget = path.join(outputDirectory, "line-ai-v050-yenilikler.mp4");
const posterTarget = path.join(outputDirectory, "line-ai-v050-yenilikler-poster.png");
const evidenceTarget = path.join(outputDirectory, "line-ai-v050-yenilikler.evidence.json");

const chromeCandidates = [
	"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];
const executablePath = chromeCandidates.find(existsSync);

if (!executablePath) {
	throw new Error("Google Chrome bulunamadı; v0.5.0 kaynak arayüz kaydı üretilemedi.");
}

const response = await fetch(applicationUrl);
if (!response.ok) {
	throw new Error(`Line AI geliştirme sunucusu hazır değil: HTTP ${response.status}`);
}

await mkdir(outputDirectory, { recursive: true });
await mkdir(recordingDirectory, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true });
let capturedVideo;

try {
	const context = await browser.newContext({
		colorScheme: "dark",
		deviceScaleFactor: 1,
		recordVideo: {
			dir: recordingDirectory,
			size: { height: 900, width: 1440 },
		},
		reducedMotion: "no-preference",
		viewport: { height: 900, width: 1440 },
	});
	const page = await context.newPage();
	capturedVideo = page.video();

	await page.goto(`${applicationUrl}/?theme=dark`, { waitUntil: "networkidle" });
	await page.evaluate(async () => {
		await document.fonts.ready;
	});
	await page.getByTestId("line-ai-chat-workspace").waitFor();
	await page.waitForTimeout(800);
	await page.getByRole("button", { name: "Ayarları aç" }).click();
	await page.getByRole("dialog", { name: "Line AI ayarları" }).waitFor();
	await page.waitForTimeout(700);
	await page.getByRole("button", { exact: true, name: "Hakkında" }).click();
	await page.getByRole("heading", { name: "Yenilikler · v0.5.0" }).waitFor();
	await page.waitForTimeout(3_400);
	await page.screenshot({
		animations: "allow",
		fullPage: false,
		path: posterTarget,
	});
	await page.waitForTimeout(900);
	await context.close();

	if (!capturedVideo) {
		throw new Error("v0.5.0 kaynak arayüz kaydı başlatılamadı.");
	}

	const recordedPath = await capturedVideo.path();
	await access(recordedPath, constants.R_OK);
	const webmTarget = path.join(outputDirectory, "line-ai-v050-yenilikler.webm");
	await copyFile(recordedPath, webmTarget);
	await execFileAsync(
		ffmpegPath,
		[
			"-y",
			"-i",
			webmTarget,
			"-vf",
			"fps=30,scale=1440:900:flags=lanczos,format=yuv420p",
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
	await rm(webmTarget, { force: true });

	const videoHash = createHash("sha256")
		.update(await readFile(videoTarget))
		.digest("hex");
	const evidence = {
		schemaVersion: 1,
		generatedAt: new Date().toISOString(),
		source: {
			kind: "vite-source-ui-playwright",
			url: applicationUrl,
			viewport: "1440x900",
			surface: "Ayarlar > Hakkında > Yenilikler · v0.5.0",
		},
		claims: {
			shown: [
				"Trace/Evidence/Verification çekirdek özeti",
				"yerel oturum ve SHA-256 proof bundle özeti",
				"terminal, Git ve checkpoint runtime özeti",
				"yerel loopback model bağlantısı özeti",
			],
			notShownAsProductUi: [
				"Mission Control",
				"replay",
				"Jury",
				"yerel model çalıştırma yüzeyi",
			],
		},
		video: {
			fileName: path.basename(videoTarget),
			sha256: videoHash,
		},
	};
	await writeFile(evidenceTarget, `${JSON.stringify(evidence, null, 2)}\n`);
	console.log(JSON.stringify({ evidence: evidenceTarget, poster: posterTarget, video: videoTarget, ...evidence }, null, 2));
} finally {
	await browser.close().catch(() => undefined);
	await rm(recordingDirectory, { force: true, recursive: true });
}
