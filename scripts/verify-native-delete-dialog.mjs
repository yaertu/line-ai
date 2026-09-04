/* global console, document, getComputedStyle, process, window */

import { chromium } from "playwright";

const cdpUrl = process.env.LINE_AI_CDP_URL ?? "http://127.0.0.1:9225";
const lightScreenshot =
	process.env.LINE_AI_DELETE_LIGHT_SCREENSHOT ??
	"C:\\Users\\cayxm\\AppData\\Local\\Temp\\line-ai-delete-dialog-light.png";
const darkScreenshot =
	process.env.LINE_AI_DELETE_DARK_SCREENSHOT ??
	"C:\\Users\\cayxm\\AppData\\Local\\Temp\\line-ai-delete-dialog-dark.png";

const parseRgb = (value) => {
	const oklch = value.match(
		/oklch\(([\d.]+)(%?)\s+([\d.]+)\s+(-?[\d.]+)/,
	);
	if (oklch) {
		const lightness = Number(oklch[1]) / (oklch[2] === "%" ? 100 : 1);
		const chroma = Number(oklch[3]);
		const hue = (Number(oklch[4]) * Math.PI) / 180;
		const a = chroma * Math.cos(hue);
		const b = chroma * Math.sin(hue);
		const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
		const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
		const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
		const l = lRoot ** 3;
		const m = mRoot ** 3;
		const s = sRoot ** 3;
		const linear = [
			4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
			-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
			-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
		].map((channel) => Math.min(1, Math.max(0, channel)));
		return linear.map((channel) =>
			255 *
			(channel <= 0.0031308
				? 12.92 * channel
				: 1.055 * channel ** (1 / 2.4) - 0.055),
		);
	}
	const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
	if (!channels || channels.length !== 3) {
		throw new Error(`RGB rengi çözümlenemedi: ${value}`);
	}
	return channels;
};

const luminance = (rgb) =>
	rgb
		.map((channel) => channel / 255)
		.map((channel) =>
			channel <= 0.04045
				? channel / 12.92
				: ((channel + 0.055) / 1.055) ** 2.4,
		)
		.reduce(
			(total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index],
			0,
		);

const contrastRatio = (foreground, background) => {
	const foregroundLuminance = luminance(parseRgb(foreground));
	const backgroundLuminance = luminance(parseRgb(background));
	const lighter = Math.max(foregroundLuminance, backgroundLuminance);
	const darker = Math.min(foregroundLuminance, backgroundLuminance);
	return (lighter + 0.05) / (darker + 0.05);
};

let browser;

try {
	browser = await chromium.connectOverCDP(cdpUrl);
	const page = browser
		.contexts()
		.flatMap((context) => context.pages())
		.find((candidate) => candidate.url().startsWith("http://127.0.0.1:1430"));
	if (!page) throw new Error("Tauri WebView2 sayfası CDP bağlantısında bulunamadı.");

	await page.getByTestId("line-ai-chat-workspace").waitFor({
		state: "visible",
		timeout: 20_000,
	});
	if (!(await page.evaluate(() => "__TAURI_INTERNALS__" in window))) {
		throw new Error("Tauri native köprüsü bulunamadı.");
	}
	const existingDialog = page.getByRole("dialog", {
		name: "Sohbet silinsin mi?",
	});
	if (await existingDialog.isVisible().catch(() => false)) {
		await page.keyboard.press("Escape");
		await existingDialog.waitFor({ state: "hidden" });
	}

	const expandSidebar = page.getByRole("button", {
		name: "Kenar çubuğunu genişlet",
	});
	if (await expandSidebar.isVisible().catch(() => false)) {
		await expandSidebar.click();
	}
	const conversationList = page.getByRole("navigation", {
		name: "Sohbet geçmişi",
	});
	const conversationButtons = conversationList.getByRole("button");
	if ((await conversationButtons.count()) === 0) {
		const verificationPrompt =
			"Silme onayı erişilebilirlik doğrulaması için bu gerçek sohbet kaydını oluştur.";
		const expectedTitle = `${verificationPrompt.slice(0, 48).trimEnd()}…`;
		await page.getByRole("button", { name: "Yeni sohbet" }).first().click();
		await page
			.getByLabel("Line AI'ya mesaj gönder")
			.fill(verificationPrompt);
		await page.getByRole("button", { name: "Mesajı gönder" }).click();
		await page
			.getByRole("button", { exact: true, name: expectedTitle })
			.waitFor({ state: "visible", timeout: 20_000 });
	}
	const conversationTitle = await conversationButtons
		.first()
		.getAttribute("aria-label");
	if (!conversationTitle) {
		throw new Error("Native doğrulama için gerçek sohbet başlığı bulunamadı.");
	}
	const conversationButton = page
		.getByRole("button", { exact: true, name: conversationTitle })
		.first();
	await conversationButton.waitFor({ state: "visible", timeout: 20_000 });
	const initiallyDark = await page.evaluate(() =>
		document.documentElement.classList.contains("dark"),
	);

	const openDeleteDialog = async () => {
		await conversationButton.click({ button: "right" });
		await page.getByRole("menuitem", { name: "Sohbeti sil" }).click();
		const dialog = page.getByRole("dialog", { name: "Sohbet silinsin mi?" });
		await dialog.waitFor({ state: "visible" });
		return dialog;
	};

	const inspectTheme = async (dark, screenshotPath) => {
		await page.evaluate((enabled) => {
			document.documentElement.classList.toggle("dark", enabled);
			document.documentElement.style.colorScheme = enabled ? "dark" : "light";
		}, dark);
		const dialog = await openDeleteDialog();
		const title = dialog.getByLabel("Silinecek sohbet başlığı");
		if ((await title.textContent())?.trim() !== conversationTitle) {
			throw new Error("Dialog tam gerçek sohbet başlığını göstermedi.");
		}
		const messageText = await dialog
			.getByText(/Bu sohbetin \d+ mesajı Line AI Cloud geçmişinden kaldırılacak\./)
			.textContent();
		const messageCount = Number(messageText?.match(/Bu sohbetin (\d+) mesajı/)?.[1]);
		if (!Number.isInteger(messageCount) || messageCount < 1) {
			throw new Error(`Dialog gerçek mesaj sayısını göstermedi: ${messageText}`);
		}

		const cancelButton = dialog.getByRole("button", { name: "Vazgeç" });
		if (!(await cancelButton.evaluate((element) => document.activeElement === element))) {
			throw new Error("Dialog güvenli Vazgeç odağıyla açılmadı.");
		}
		const deleteButton = dialog.getByRole("button", { name: "Sohbeti sil" });
		const appearance = await deleteButton.evaluate((element) => {
			const styles = getComputedStyle(element);
			const bounds = element.getBoundingClientRect();
			return {
				background: styles.backgroundColor,
				color: styles.color,
				height: bounds.height,
				opacity: styles.opacity,
				width: bounds.width,
			};
		});
		const contrast = contrastRatio(appearance.color, appearance.background);
		if (
			appearance.width <= 0 ||
			appearance.height <= 0 ||
			appearance.opacity === "0" ||
			contrast < 4.5
		) {
			throw new Error(
				`Sil butonu görünürlük/kontrast doğrulamasını geçmedi: ${JSON.stringify({ appearance, contrast })}`,
			);
		}
		await dialog.screenshot({ path: screenshotPath });
		return {
			...appearance,
			contrast: Number(contrast.toFixed(2)),
			messageCount,
		};
	};

	const light = await inspectTheme(false, lightScreenshot);
	await page.keyboard.press("Escape");
	await page
		.getByRole("dialog", { name: "Sohbet silinsin mi?" })
		.waitFor({ state: "hidden" });
	if (
		!(await conversationButton.evaluate(
			(element) => document.activeElement === element,
		))
	) {
		throw new Error("Esc sonrasında odak sohbet satırına dönmedi.");
	}

	const dark = await inspectTheme(true, darkScreenshot);
	await page.getByRole("button", { name: "Vazgeç" }).click();
	await page.evaluate((enabled) => {
		document.documentElement.classList.toggle("dark", enabled);
		document.documentElement.style.colorScheme = enabled ? "dark" : "light";
	}, initiallyDark);

	console.log(
		JSON.stringify(
			{
				conversation: { title: conversationTitle },
				dark,
				light,
				nativeBridge: true,
				screenshots: { dark: darkScreenshot, light: lightScreenshot },
			},
			null,
			2,
		),
	);
} finally {
	await browser?.close();
}
