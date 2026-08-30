import { invoke } from "@tauri-apps/api/core";
import type {
  ExecutePromptRequest,
  ExecutePromptResult,
  ProviderStatus,
  PromptExecutor,
} from "@/components/line-ai/chat-template/chat-data";

export const executeDesktopPrompt: PromptExecutor = async (
  request: ExecutePromptRequest
): Promise<ExecutePromptResult> => {
  if (!("__TAURI_INTERNALS__" in window)) {
    throw new Error(
      "Yapay zekâ bağlantısı Line AI masaüstü uygulamasında kullanılabilir."
    );
  }

  return invoke<ExecutePromptResult>("execute_ai_prompt", { request });
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
