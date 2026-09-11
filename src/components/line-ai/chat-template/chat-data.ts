import type { AIPromptAttachment } from "@/components/line-ai/ai-prompt-input";
import type { AISuggestion } from "@/components/line-ai/ai-suggestions";
import type { FileContentKind } from "@/lib/file-content";

export type ProviderChoice = "auto" | "openai" | "gemini" | "local";
export type LocalModelEngine = "ollama" | "lm-studio" | "openai-compatible";
export type ReasoningLevel = "low" | "medium" | "high";
export type ThemeChoice = "system" | "light" | "dark";
export type MotionChoice = "system" | "reduce";
export type ResponseStyle = "balanced" | "concise" | "detailed";

export type AppPreferences = {
	provider: ProviderChoice;
	reasoning: ReasoningLevel;
	theme: ThemeChoice;
	truthMode: boolean;
	browserTools: boolean;
	chatFontSize: number;
	codeFontSize: number;
	customInstructions: string;
	localEndpoint: string;
	localEngine: LocalModelEngine;
	localModel: string;
	motion: MotionChoice;
	responseStyle: ResponseStyle;
	uiFontSize: number;
};

export type ToolActivity = {
	detail?: string;
	kind: "browser";
	label: string;
	status: "completed" | "failed";
	title?: string;
	url?: string;
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
			feedback?: "up" | "down";
			from: "assistant";
			id: string;
			model?: string;
			provider?: "openai" | "gemini" | "local";
			sources?: WebSource[];
			durationMs?: number;
			reasoning?: ReasoningLevel;
			truthMode?: boolean;
			text: string;
			timestamp: string;
			tone?: "normal" | "error";
			activities?: ToolActivity[];
	  };

export type ChatConversation = {
	archived?: boolean;
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
	localEndpoint?: string;
	localEngine?: LocalModelEngine;
	localModel?: string;
	transcript: PromptTranscriptTurn[];
	truthMode: boolean;
	customInstructions?: string;
	responseStyle?: ResponseStyle;
};

export type ExecutePromptResult = {
	message: string;
	model: string;
	provider: "openai" | "gemini" | "local";
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
	browserTools: true,
	chatFontSize: 15,
	codeFontSize: 13,
	customInstructions: "",
	localEndpoint: "http://127.0.0.1:11434/v1",
	localEngine: "ollama",
	localModel: "llama3.2",
	motion: "system",
	responseStyle: "balanced",
	uiFontSize: 14,
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
	{ id: "local", label: "Yerel model", note: "Ollama veya uyumlu motor" },
] as const satisfies ReadonlyArray<{
	id: ProviderChoice;
	label: string;
	note: string;
}>;

export const LOCAL_MODEL_ENGINES = [
	{
		endpoint: "http://127.0.0.1:11434/v1",
		id: "ollama",
		label: "Ollama",
		note: "Varsayılan adres: 11434",
	},
	{
		endpoint: "http://127.0.0.1:1234/v1",
		id: "lm-studio",
		label: "LM Studio",
		note: "OpenAI uyumlu sunucu: 1234/v1",
	},
	{
		endpoint: "http://127.0.0.1:8000/v1",
		id: "openai-compatible",
		label: "OpenAI uyumlu",
		note: "Özel yerel motor için adres",
	},
] as const satisfies ReadonlyArray<{
	endpoint: string;
	id: LocalModelEngine;
	label: string;
	note: string;
}>;

export const localEndpointForEngine = (engine: LocalModelEngine) =>
	LOCAL_MODEL_ENGINES.find((item) => item.id === engine)?.endpoint ??
	DEFAULT_PREFERENCES.localEndpoint;

export const isLocalLoopbackEndpoint = (value: unknown): value is string => {
	if (typeof value !== "string" || value.length > 512) return false;
	const input = value.trim();
	if (
		!/^http:\/\/(?:localhost|127(?:\.\d{1,3}){3}|\[::1\]):\d{1,5}(?:[/?]|$)/i.test(
			input,
		)
	)
		return false;
	try {
		const endpoint = new URL(input);
		const hostname = endpoint.hostname.toLowerCase().replace(/^\[|\]$/g, "");
		return (
			endpoint.protocol === "http:" &&
			Number(endpoint.port) > 0 &&
			endpoint.username.length === 0 &&
			endpoint.password.length === 0 &&
			endpoint.search.length === 0 &&
			endpoint.hash.length === 0 &&
			(hostname === "localhost" || hostname === "::1" || hostname.startsWith("127."))
		);
	} catch {
		return false;
	}
};

export const CONTEXT_LIMIT = 1_000_000;
