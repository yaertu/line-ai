import type { AIPromptAttachment } from "@/components/line-ai/ai-prompt-input";
import type { AISuggestion } from "@/components/line-ai/ai-suggestions";

export type ProviderChoice = "auto" | "openai" | "gemini";
export type ReasoningLevel = "low" | "medium" | "high";
export type ThemeChoice = "system" | "light" | "dark";

export type AppPreferences = {
  provider: ProviderChoice;
  reasoning: ReasoningLevel;
  theme: ThemeChoice;
  truthMode: boolean;
};

export type ProviderStatus = {
  geminiConfigured: boolean;
  geminiModel: string;
  openAiConfigured: boolean;
  openAiModel: string;
};

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
      durationMs?: number;
      reasoning?: ReasoningLevel;
      truthMode?: boolean;
      text: string;
      timestamp: string;
      tone?: "normal" | "error";
    };

export type ChatConversation = {
  id: string;
  /** Pinned conversations stay above chronological history groups. */
  pinned?: boolean;
  title: string;
  turns: ChatTurn[];
  /** ISO-8601 time used for sorting and the visible history timestamp. */
  updatedAt: string;
};

export type PromptTranscriptTurn = {
  role: "user" | "assistant";
  content: string;
};

export type PromptAttachment = {
  content: string;
  mimeType: string;
  name: string;
  size: number;
  truncated: boolean;
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

export const DEFAULT_PREFERENCES: AppPreferences = {
  provider: "auto",
  reasoning: "medium",
  theme: "system",
  truthMode: true,
};

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
