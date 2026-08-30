import type { AIPromptAttachment } from "@/components/line-ai/ai-prompt-input";
import type { AISuggestion } from "@/components/line-ai/ai-suggestions";
import type { FileContentKind } from "@/lib/file-content";

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

export type WebSource = {
	id: string;
	snippet?: string;
	title: string;
	url: string;
};

export type CodeArtifactFile = {
	content: string;
	language: string;
	name: string;
};

export type CodeArtifact = {
	createdAt: string;
	files: CodeArtifactFile[];
	id: string;
	title: string;
};

export type ExecutePromptEvent =
	| { kind: "reset" }
	| { kind: "search"; label: string }
	| { kind: "source"; source: WebSource }
	| { kind: "status"; label: string }
	| { kind: "text_delta"; text: string };

export type ChatTurn =
	| {
			attachments?: AIPromptAttachment[];
			from: "user";
			id: string;
			text: string;
			timestamp: string;
	  }
	| {
			artifact?: CodeArtifact;
			from: "assistant";
			id: string;
			model?: string;
			provider?: "openai" | "gemini";
			sources?: WebSource[];
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
	contentKind: FileContentKind;
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
	sources: WebSource[];
};

export type PromptExecutor = (
	request: ExecutePromptRequest,
	onEvent?: (event: ExecutePromptEvent) => void,
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
