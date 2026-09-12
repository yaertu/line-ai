import { Channel, invoke as tauriInvoke } from "@tauri-apps/api/core";
import type {
	ExecutePromptEvent,
	ExecutePromptRequest,
	ExecutePromptResult,
	EngineImageJob,
	EngineStatus,
	PromptExecutor,
	ProviderStatus,
} from "@/components/line-ai/chat-template/chat-data";

// Tauri streams events through a JavaScript Channel object. Keep a strong
// reference until the native command settles; otherwise the channel can be
// collected while a long provider response is still in flight.
// Native Result<String> failures arrive as strings, not JavaScript Error objects.
// Normalize once so every Engine surface can display the safe server explanation.
const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
 try { return await tauriInvoke<T>(command, args); }
 catch (error) { throw error instanceof Error ? error : new Error(typeof error === "string" ? error : "Masaüstü işlemi tamamlanamadı."); }
};

const activePromptChannels = new Set<Channel<ExecutePromptEvent>>();

export const executeDesktopPrompt: PromptExecutor = async (
	request: ExecutePromptRequest,
	onEvent?: (event: ExecutePromptEvent) => void,
): Promise<ExecutePromptResult> => {
	if (!("__TAURI_INTERNALS__" in window)) {
		throw new Error(
			"Yapay zekâ bağlantısı Line AI masaüstü uygulamasında kullanılabilir.",
		);
	}

	const onEventChannel = new Channel<ExecutePromptEvent>();
	onEventChannel.onmessage = (event) => onEvent?.(event);
	activePromptChannels.add(onEventChannel);
	try {
		return await invoke<ExecutePromptResult>("execute_ai_prompt", {
			onEvent: onEventChannel,
			request,
		});
	} finally {
		activePromptChannels.delete(onEventChannel);
	}
};

export const readDesktopProviderStatus = async (): Promise<ProviderStatus> => {
	if (!("__TAURI_INTERNALS__" in window)) {
		return {
			geminiConfigured: false,
			geminiModel: "Masaüstü uygulamasında doğrulanır",
			openAiConfigured: false,
			openAiModel: "Masaüstü uygulamasında doğrulanır",
		};
	}
	return invoke<ProviderStatus>("get_provider_status");
};

const requireDesktop = () => {
	if (!("__TAURI_INTERNALS__" in window)) {
		throw new Error("Line AI Engine yalnız masaüstü uygulamasında kullanılabilir.");
	}
};

export const readEngineStatus = () => {
	requireDesktop();
	return invoke<EngineStatus>("get_engine_status");
};

export const saveEngineKey = async (key: string) => {
	requireDesktop();
	await invoke("save_engine_key", { key });
};

export const deleteEngineKey = async () => {
	requireDesktop();
	await invoke("delete_engine_key");
};

export const submitEngineFeedback = (request: {
	note?: string;
	rating: "up" | "down";
	requestId: string;
	trainingOptIn: boolean;
}) => {
	requireDesktop();
	return invoke<{ saved: boolean; trainingOptIn: boolean }>(
		"submit_engine_feedback",
		{ request },
	);
};

export const generateEngineImage = (request: {
	prompt: string;
	aspectRatio: "1:1" | "3:2" | "2:3";
	quality: "low" | "medium" | "high";
	style: "natural" | "illustration" | "product" | "poster";
}) => {
	requireDesktop();
	return invoke<EngineImageJob>("generate_engine_image", { request });
};

export const getEngineImage = (jobId: string) => {
	requireDesktop();
	return invoke<EngineImageJob>("get_engine_image", { jobId });
};

export const getEngineAsset = (assetId: string) => {
	requireDesktop();
	return invoke<string>("get_engine_asset", { assetId });
};

export const downloadEngineAsset = (assetId: string, fileName?: string) => {
	requireDesktop();
	return invoke<{ path: string; bytes: number }>("download_engine_asset", {
		assetId,
		fileName,
	});
};

export const deleteEngineImage = async (jobId: string) => {
	requireDesktop();
	await invoke("delete_engine_image", { jobId });
};
