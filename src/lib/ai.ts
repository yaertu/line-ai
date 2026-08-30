import { invoke } from "@tauri-apps/api/core";
import type {
  ExecutePromptRequest,
  ExecutePromptResult,
  PromptExecutor,
} from "@/components/smoothui/chat-template/chat-data";

export const executeDesktopPrompt: PromptExecutor = async (
  request: ExecutePromptRequest
): Promise<ExecutePromptResult> => {
  if (!("__TAURI_INTERNALS__" in window)) {
    throw new Error(
      "Yapay zekâ bağlantısı Line CLI masaüstü uygulamasında kullanılabilir."
    );
  }

  return invoke<ExecutePromptResult>("execute_ai_prompt", { request });
};
