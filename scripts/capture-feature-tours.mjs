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
const recordingDirectory = path.join(tmpdir(), `line-ai-feature-tours-${Date.now()}`);
const applicationUrl = process.env.LINE_AI_CAPTURE_URL ?? "http://127.0.0.1:1430";
const ffmpegPath = process.env.LINE_AI_FFMPEG ?? "ffmpeg";

// Playwright starts a recording as soon as its page is created.  The source UI
// is fully loaded and positioned before this offset, so the public clip never
// starts on a browser or React loading frame.
const leadSecondsToRemove = 5.5;
const publishedDurationSeconds = 5;
const publishedFrameRate = 30;
const publishedFrameCount = publishedDurationSeconds * publishedFrameRate;
const chromeCandidates = [
	"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];
const executablePath = chromeCandidates.find(existsSync);

if (!executablePath) {
	throw new Error("Google Chrome bulunamadı; feature turu kaynak arayüzden üretilemedi.");
}

const response = await fetch(applicationUrl);
if (!response.ok) {
	throw new Error(`Line AI geliştirme sunucusu hazır değil: HTTP ${response.status}`);
}

const sha256 = async (filePath) =>
	createHash("sha256").update(await readFile(filePath)).digest("hex");

const tours = [
	{
		id: "line-ai-baslangic-turu",
		surface: "Yeni sohbet ana ekranı",
		shown: [
			"boş yeni sohbet çalışma alanı",
			"sohbet kenar çubuğu ve yeni sohbet denetimi",
			"Line AI mesaj oluşturucusu",
		],
		notShown: [
			"önceki sohbet içeriği veya kullanıcı mesajları",
			"Ayarlar iletişim kutusu",
			"Tarayıcı entegrasyon yüzeyi",
		],
		prepare: async (page) => {
			await page.getByRole("button", { name: "Yeni sohbet" }).first().click();
			await page.getByRole("textbox", { name: "Line AI'ya mesaj gönder" }).waitFor();
		},
	},
	{
		id: "line-ai-gorunum-turu",
		surface: "Ayarlar > Görünüm",
		shown: [
			"Line AI ayarları iletişim kutusu",
			"Görünüm sekmesi",
			"tema, hareket ve yazı boyutu tercihleri",
		],
		notShown: [
			"Tarayıcı bağlantısı başlatma veya durdurma denetimleri",
			"Line AI Engine anahtarları veya gizli değerler",
			"sohbet mesajı içeriği",
		],
		prepare: async (page) => {
			await page.getByRole("button", { name: "Ayarları aç" }).click();
			await page.getByRole("dialog", { name: "Line AI ayarları" }).waitFor();
			await page.getByRole("button", { exact: true, name: "Görünüm" }).click();
			await page.getByText("Görünüm", { exact: true }).last().waitFor();
		},
	},
	{
		id: "line-ai-tarayici-turu",
		surface: "Ayarlar > Tarayıcı",
		shown: [
			"Line AI ayarları iletişim kutusu",
			"Tarayıcı sekmesi",
			"izole Chrome oturumu durum ve bağlantı denetimleri",
		],
		notShown: [
			"açık web sayfası içeriği veya tarayıcı sekme verisi",
			"Line AI Engine anahtarları veya gizli değerler",
			"sohbet mesajı içeriği",
		],
		prepare: async (page) => {
			await page.getByRole("button", { name: "Ayarları aç" }).click();
			await page.getByRole("dialog", { name: "Line AI ayarları" }).waitFor();
			await page.getByRole("button", { exact: true, name: "Tarayıcı" }).click();
			await page.getByText("Tarayıcı", { exact: true }).last().waitFor();
		},
	},
	{
		id: "line-ai-bulut-veri-turu",
		captureMethod: "frame-sequence",
		surface: "Ayarlar > Bulut verileri",
		shown: [
			"Line AI Cloud durum kartı",
			"kurulum kimliğine bağlı sohbet senkronizasyonu açıklaması",
			"sohbet ve mesaj sayaçları",
		],
		notShown: [
			"Cloud erişim secret değeri",
			"tek tek sohbet veya mesaj içerikleri",
			"kalıcı temizleme onay akışı",
		],
		prepare: async (page) => {
			await page.getByRole("button", { name: "Ayarları aç" }).click();
			await page.getByRole("dialog", { name: "Line AI ayarları" }).waitFor();
			await page.getByRole("button", { exact: true, name: "Bulut verileri" }).click();
			await page.getByText("Line AI Cloud", { exact: true }).waitFor();
		},
	},
	{
		id: "line-ai-dosya-baglami-turu",
		surface: "Yeni sohbet > dosya bağlamı ekleme",
		fixture: {
			content: "# Feature turu notu\n\nBu yerel, kısa metin dosyası gerçek ekleme arayüzünü doğrulamak için kullanılır.\n",
			name: "feature-turu-notu.md",
		},
		shown: [
			"boş yeni sohbet çalışma alanı",
			"gerçek dosya seçici üzerinden eklenmiş metin eki",
			"gönderilmemiş taslakta ek kaldırma denetimi",
		],
		notShown: [
			"dosyanın Line AI Engine'e gönderilmesi veya model yanıtı",
			"üretilmiş kod Artifact'i; bunun için etkin bir Engine bağlantısı gerekir",
			"kullanıcının yerel dosyaları veya sohbet geçmişi",
		],
		prepare: async (page, fixturePath) => {
			if (!fixturePath) throw new Error("Dosya bağlamı turu için fixture oluşturulamadı.");
			await page.getByRole("button", { name: "Yeni sohbet" }).first().click();
			await page.getByRole("textbox", { name: "Line AI'ya mesaj gönder" }).waitFor();
			await page.locator('input[type="file"]').setInputFiles(fixturePath);
			await page.getByText("feature-turu-notu.md", { exact: true }).waitFor();
		},
	},
];

async function captureTour(browser, tour) {
	const clipDirectory = path.join(recordingDirectory, tour.id);
	const temporaryVideo = path.join(clipDirectory, `${tour.id}.webm`);
	const videoTarget = path.join(outputDirectory, `${tour.id}.mp4`);
	const posterTarget = path.join(outputDirectory, `${tour.id}-poster.png`);
	const evidenceTarget = path.join(outputDirectory, `${tour.id}.evidence.json`);
	const usesFrameSequence = tour.captureMethod === "frame-sequence";
	const removedLeadSeconds = usesFrameSequence
		? 0
		: (tour.leadSeconds ?? leadSecondsToRemove);
	const frameDirectory = path.join(clipDirectory, "frames");
	await mkdir(clipDirectory, { recursive: true });
	const fixturePath = tour.fixture
		? path.join(clipDirectory, tour.fixture.name)
		: undefined;
	if (fixturePath) await writeFile(fixturePath, tour.fixture.content, "utf8");

	const context = await browser.newContext({
		colorScheme: "dark",
		deviceScaleFactor: 1,
		recordVideo: { dir: clipDirectory, size: { height: 900, width: 1440 } },
		reducedMotion: "no-preference",
		viewport: { height: 900, width: 1440 },
	});
	const page = await context.newPage();
	const capturedVideo = page.video();

	try {
		await page.goto(`${applicationUrl}/?theme=dark`, { waitUntil: "networkidle" });
		await page.evaluate(async () => {
			await document.fonts.ready;
		});
		await page.getByTestId("line-ai-chat-workspace").waitFor();
		await page.waitForTimeout(900);
		await tour.prepare(page, fixturePath);
		await page.waitForTimeout(3_100);
		await page.screenshot({ animations: "allow", fullPage: false, path: posterTarget });
		if (usesFrameSequence) {
			await mkdir(frameDirectory, { recursive: true });
			for (let frame = 1; frame <= publishedFrameCount; frame += 1) {
				await page.screenshot({
					animations: "allow",
					fullPage: false,
					path: path.join(frameDirectory, `frame-${String(frame).padStart(6, "0")}.png`),
				});
				if (frame < publishedFrameCount) {
					await page.waitForTimeout(1_000 / publishedFrameRate);
				}
			}
		} else {
			// Keep enough settled source footage after the retained offset for every
			// tour to publish the requested five seconds, including the faster home
			// screen path.
			await page.waitForTimeout(3_500);
		}
	} finally {
		await context.close();
	}

	if (!usesFrameSequence && !capturedVideo) {
		throw new Error(`${tour.id}: Playwright video kaydı başlatılamadı.`);
	}
	if (!usesFrameSequence) {
		const recordedPath = await capturedVideo.path();
		await access(recordedPath, constants.R_OK);
		await copyFile(recordedPath, temporaryVideo);
	}
	const videoInputArguments = usesFrameSequence
		? ["-framerate", String(publishedFrameRate), "-i", path.join(frameDirectory, "frame-%06d.png")]
		: ["-ss", String(removedLeadSeconds), "-i", temporaryVideo];

	await execFileAsync(
		ffmpegPath,
		[
			"-y",
			...videoInputArguments,
			"-vf",
			`fps=${publishedFrameRate},scale=1440:900:flags=lanczos,fade=t=out:st=${(publishedDurationSeconds - 0.35).toFixed(2)}:d=0.35,format=yuv420p`,
			"-frames:v",
			String(publishedFrameCount),
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

	const [posterHash, videoHash] = await Promise.all([
		sha256(posterTarget),
		sha256(videoTarget),
	]);
	const evidence = {
		schemaVersion: 1,
		generatedAt: new Date().toISOString(),
		source: {
			kind: "vite-source-ui-playwright",
			url: applicationUrl,
			viewport: "1440x900",
			surface: tour.surface,
		},
		capture: {
			method: usesFrameSequence ? "source-ui-frame-sequence" : "playwright-recording-trim",
			publishedDurationSeconds,
			removedLeadSeconds,
			startupFramesPublished: false,
			verification: "React workspace and requested surface were awaited before the retained segment and poster capture.",
		},
		claims: {
			shown: tour.shown,
			notShown: tour.notShown,
		},
		poster: {
			fileName: path.basename(posterTarget),
			sha256: posterHash,
		},
		video: {
			fileName: path.basename(videoTarget),
			sha256: videoHash,
		},
	};
	await writeFile(evidenceTarget, `${JSON.stringify(evidence, null, 2)}\n`);
	return { evidence: evidenceTarget, poster: posterTarget, video: videoTarget, ...evidence };
}

await mkdir(outputDirectory, { recursive: true });
await mkdir(recordingDirectory, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });

try {
	const requestedIds = (process.env.LINE_AI_CAPTURE_TOURS ?? "")
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean);
	const selectedTours = requestedIds.length
		? tours.filter((tour) => requestedIds.includes(tour.id))
		: tours;
	if (requestedIds.length && selectedTours.length !== requestedIds.length) {
		throw new Error(`Bilinmeyen tur kimliği: ${requestedIds.join(", ")}`);
	}
	const outputs = [];
	for (const tour of selectedTours) outputs.push(await captureTour(browser, tour));
	console.log(JSON.stringify({ tours: outputs }, null, 2));
} finally {
	await browser.close().catch(() => undefined);
	await rm(recordingDirectory, { force: true, recursive: true });
}
