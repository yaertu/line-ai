import { invoke } from "@tauri-apps/api/core";
import { isTauriDesktop } from "@/lib/desktop-files";

export type BrowserStatus = {
	connected: boolean;
	isolatedProfile: boolean;
	port?: number;
	tabCount: number;
};

export type BrowserToolAction =
	| "back"
	| "click"
	| "open_url"
	| "read_page"
	| "reload"
	| "type";

export type BrowserToolRequest = {
	action: BrowserToolAction;
	selector?: string;
	text?: string;
	url?: string;
};

export type BrowserToolResult = {
	action: BrowserToolAction;
	message: string;
	pageText?: string;
	title?: string;
	url?: string;
};

export type BrowserIntent =
	| { kind: "invalid"; direct: true; message: string }
	| { kind: "none" }
	| { kind: "status" | "start" | "stop"; direct: true }
	| { kind: "tool"; direct: boolean; request: BrowserToolRequest };

const requireDesktop = () => {
	if (!isTauriDesktop()) {
		throw new Error(
			"Chrome entegrasyonu yalnız Line AI masaüstü uygulamasında kullanılabilir.",
		);
	}
};

export const readBrowserStatus = async () => {
	requireDesktop();
	return invoke<BrowserStatus>("get_browser_status");
};

export const startBrowserSession = async () => {
	requireDesktop();
	return invoke<BrowserStatus>("start_browser_session");
};

export const stopBrowserSession = async () => {
	requireDesktop();
	await invoke("stop_browser_session");
};

export const executeBrowserTool = async (request: BrowserToolRequest) => {
	requireDesktop();
	return invoke<BrowserToolResult>("execute_browser_tool", { request });
};

const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR");

const parseExplicitCommand = (prompt: string): BrowserIntent | null => {
	const match = prompt.trim().match(/^\/(?:browser|tarayıcı)(?:\s+(.+))?$/iu);
	if (!match) return null;
	const command = match[1]?.trim() ?? "durum";
	const normalized = normalize(command);
	if (["durum", "status"].includes(normalized))
		return { direct: true, kind: "status" };
	if (["başlat", "baslat", "start"].includes(normalized))
		return { direct: true, kind: "start" };
	if (["durdur", "kapat", "stop"].includes(normalized))
		return { direct: true, kind: "stop" };
	if (["oku", "sayfayı oku", "sayfayi oku", "read"].includes(normalized)) {
		return { direct: true, kind: "tool", request: { action: "read_page" } };
	}
	if (["yenile", "reload"].includes(normalized)) {
		return { direct: true, kind: "tool", request: { action: "reload" } };
	}
	if (["geri", "back"].includes(normalized)) {
		return { direct: true, kind: "tool", request: { action: "back" } };
	}
	const open = command.match(/^(?:aç|ac|open)\s+(https?:\/\/\S+)$/iu);
	if (open?.[1]) {
		return {
			direct: true,
			kind: "tool",
			request: { action: "open_url", url: open[1] },
		};
	}
	const click = command.match(/^(?:tıkla|tikla|click)\s+(.+)$/iu);
	if (click?.[1]) {
		return {
			direct: true,
			kind: "tool",
			request: { action: "click", selector: click[1].trim() },
		};
	}
	const type = command.match(/^(?:yaz|type)\s+(.+?)\s+::\s+([\s\S]+)$/iu);
	if (type?.[1] && type[2]) {
		return {
			direct: true,
			kind: "tool",
			request: { action: "type", selector: type[1].trim(), text: type[2] },
		};
	}
	return {
		direct: true,
		kind: "invalid",
		message:
			"Chrome komutu tanınmadı. Ayarlar > Tarayıcı bölümündeki gerçek komutlardan birini kullanın.",
	};
};

/**
 * Natural-language detection is intentionally read-only. Click and type require an
 * explicit /browser command so ordinary chat text can never mutate a page by accident.
 */
export const parseBrowserIntent = (prompt: string): BrowserIntent => {
	const explicit = parseExplicitCommand(prompt);
	if (explicit) return explicit;
	const normalized = normalize(prompt);
	const url = prompt.match(/https?:\/\/[^\s<>"')\]]+/iu)?.[0];
	const asksToInspect =
		/(incele|oku|özetle|ozetle|bak|araştır|arastir|analiz)/iu.test(normalized);
	if (url && asksToInspect) {
		return {
			direct: false,
			kind: "tool",
			request: { action: "open_url", url },
		};
	}
	if (
		/(?:aktif|açık|acik|bu)\s+(?:chrome\s+)?(?:sekme|sayfa)/iu.test(
			normalized,
		) &&
		asksToInspect
	) {
		return { direct: false, kind: "tool", request: { action: "read_page" } };
	}
	return { kind: "none" };
};
