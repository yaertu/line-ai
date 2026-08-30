import type { AIPromptAttachment } from "@/components/smoothui/ai-prompt-input";
import type { AISuggestion } from "@/components/smoothui/ai-suggestions";

export type ProviderChoice = "auto" | "openai" | "gemini";
export type ReasoningLevel = "low" | "medium" | "high";

export type ChatTurn =
  | {
      attachments?: AIPromptAttachment[];
      from: "user";
      id: string;
      text: string;
      timestamp: string;
    }
  | {
      from: "assistant";
      id: string;
      model?: string;
      provider?: "openai" | "gemini";
      text: string;
      timestamp: string;
      tone?: "normal" | "error";
    };

export type ChatConversation = {
  group: string;
  id: string;
  title: string;
  turns: ChatTurn[];
};

export type PromptTranscriptTurn = {
  role: "user" | "assistant";
  content: string;
};

export type PromptAttachment = {
  content: string;
  mimeType: string;
  name: string;
};

export type ExecutePromptRequest = {
  attachments?: PromptAttachment[];
  prompt: string;
  provider: ProviderChoice;
  reasoning: ReasoningLevel;
  transcript: PromptTranscriptTurn[];
  truthMode: boolean;
};

export type ExecutePromptResult = {
  message: string;
  model: string;
  provider: "openai" | "gemini";
};

export type PromptExecutor = (
  request: ExecutePromptRequest
) => Promise<ExecutePromptResult>;

export const CONVERSATIONS: ChatConversation[] = [];

export const STARTER_SUGGESTIONS: AISuggestion[] = [
  { id: "st1", label: "Bir fikri uygulanabilir adımlara böl" },
  { id: "st2", label: "Bu hatayı birlikte inceleyelim" },
  { id: "st3", label: "Kısa ve net bir metin hazırla" },
];

export const PROVIDERS = [
  { id: "auto", label: "Otomatik", note: "OpenAI, gerekirse Gemini" },
  { id: "openai", label: "OpenAI", note: "GPT-5.6 Terra" },
  { id: "gemini", label: "Gemini", note: "Gemini 3.7 Flash" },
] as const satisfies ReadonlyArray<{
  id: ProviderChoice;
  label: string;
  note: string;
}>;

export const CONTEXT_LIMIT = 1_000_000;
