import { Channel, invoke } from "@tauri-apps/api/core";
import type {
	ExecutePromptEvent,
	ExecutePromptRequest,
	ExecutePromptResult,
	PromptExecutor,
	ProviderStatus,
} from "@/components/line-ai/chat-template/chat-data";

// Tauri streams events through a JavaScript Channel object. Keep a strong
// reference until the native command settles; otherwise the channel can be
// collected while a long provider response is still in flight.
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
