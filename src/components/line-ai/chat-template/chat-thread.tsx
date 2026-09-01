"use client";

import {
	Bot,
	BrainCircuit,
	Check,
	ChevronDown,
	CircleAlert,
	CircleCheck,
	Code2,
	Copy,
	Files,
	FolderTree,
	Gauge,
	Globe2,
	PanelLeftOpen,
	Paperclip,
	Quote,
	ShieldCheck,
	Sparkles,
	Trash2,
	UploadCloud,
	X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AIContextMeter from "@/components/line-ai/ai-context-meter";
import AIConversation from "@/components/line-ai/ai-conversation";
import AIDiff, { type AIDiffLine } from "@/components/line-ai/ai-diff";
import AIMessage from "@/components/line-ai/ai-message";
import AIPromptInput, {
	type AIPromptAttachment,
} from "@/components/line-ai/ai-prompt-input";
import AIResponse from "@/components/line-ai/ai-response";
import AISources, { type AISource } from "@/components/line-ai/ai-sources";
import AISuggestions from "@/components/line-ai/ai-suggestions";
import AIToolCall from "@/components/line-ai/ai-tool-call";
import ChromeMark from "@/components/line-ai/chrome-mark";
import CodeWorkspace from "@/components/line-ai/code-workspace";
import SiriOrb from "@/components/line-ai/siri-orb";
import {
	executeBrowserTool,
	parseBrowserIntent,
	readBrowserStatus,
	startBrowserSession,
	stopBrowserSession,
} from "@/lib/browser";
import {
	extractCodeArtifact,
	extractStreamingCodeArtifact,
} from "@/lib/code-artifacts";
import {
	type DesktopDroppedTextFile,
	isTauriDesktop,
	readDesktopDroppedTextFiles,
} from "@/lib/desktop-files";
import { readBrowserFilePreview } from "@/lib/file-content";
import { cn } from "@/lib/utils";
import {
	type ChatTurn,
	CONTEXT_LIMIT,
	type ExecutePromptEvent,
	type ExecutePromptRequest,
	PROVIDERS,
	type PromptAttachment,
	type PromptExecutor,
	type ProviderChoice,
	type ReasoningLevel,
	STARTER_SUGGESTIONS,
	type ToolActivity,
	type WebSource,
} from "./chat-data";

const MAX_FILE_BYTES = 512 * 1024 * 1024;
const MAX_FILE_CONTEXT_BYTES = 64 * 1024;
const MAX_FILES = 30;
type DraftFile = AIPromptAttachment & PromptAttachment;
type NoticeTone = "error" | "info" | "success";
type Notice = { id: string; text: string; tone: NoticeTone };
type LivePhase = "browser" | "thinking" | "searching" | "writing";
type LiveProgress = {
	history: string[];
	label: string;
	phase: LivePhase;
	sources: WebSource[];
	streamedText: string;
};

const initialLiveProgress = (): LiveProgress => ({
	history: [],
	label: "İstek hazırlanıyor",
	phase: "thinking",
	sources: [],
	streamedText: "",
});

const advanceLiveProgress = (
	current: LiveProgress,
	label: string,
	phase: LivePhase,
): LiveProgress => {
	const isStreamingUpdate =
		current.phase === "writing" && phase === "writing";
	const history =
		current.label === label || isStreamingUpdate
			? current.history
			: [...current.history, current.label].slice(-5);
	return { ...current, history, label, phase };
};

const formatClock = (date: Date) =>
	`${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

const formatBytes = (size?: number) => {
	if (!size) return "";
	return size >= 1024 * 1024
		? `${(size / (1024 * 1024)).toFixed(1)} MB`
		: `${Math.max(1, Math.round(size / 1024))} KB`;
};

export type ChatThreadProps = {
	className?: string;
	executePrompt: PromptExecutor;
	onAppendTurn: (turn: ChatTurn) => void;
	onCodeWorkspaceOpen?: () => void;
	onDeleteTurn: (turnId: string) => void;
	onOpenSidebar?: () => void;
	onVoteTurn: (turnId: string, vote: "up" | "down") => void;
	onProviderChange: (provider: ProviderChoice) => void;
	onReasoningChange: (reasoning: ReasoningLevel) => void;
	onTruthModeChange: (enabled: boolean) => void;
	provider: ProviderChoice;
	reasoning: ReasoningLevel;
	title: string;
	truthMode: boolean;
	turns: ChatTurn[];
	browserTools: boolean;
	customInstructions: string;
	responseStyle: ExecutePromptRequest["responseStyle"];
};

export const ChatThread = ({
	className,
	executePrompt,
	onAppendTurn,
	onCodeWorkspaceOpen,
	onDeleteTurn,
	onOpenSidebar,
	onVoteTurn,
	onProviderChange,
	onReasoningChange,
	onTruthModeChange,
	provider,
	reasoning,
	title,
	truthMode,
	turns,
	browserTools,
	customInstructions,
	responseStyle,
}: ChatThreadProps) => {
	const [draft, setDraft] = useState("");
	const [draftFiles, setDraftFiles] = useState<DraftFile[]>([]);
	const [isBusy, setIsBusy] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const [liveProgress, setLiveProgress] =
		useState<LiveProgress>(initialLiveProgress);
	const [notice, setNotice] = useState<Notice | null>(null);
	const [openArtifactId, setOpenArtifactId] = useState<string | null>(null);
	const [liveArtifactDismissed, setLiveArtifactDismissed] = useState(false);
	const liveArtifactDismissedRef = useRef(false);
	const codeWorkspaceAutoOpenedRef = useRef(false);
	const [turnMenu, setTurnMenu] = useState<{
		turnId: string;
		x: number;
		y: number;
	} | null>(null);
	const [deleteTurnId, setDeleteTurnId] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const draftFilesRef = useRef<DraftFile[]>([]);
	const mountedRef = useRef(true);
	const shouldReduceMotion = useReducedMotion();

	useEffect(() => {
		// React StrictMode intentionally runs setup -> cleanup -> setup in
		// development. Restore the mounted flag in setup so a real native stream
		// is not discarded after the StrictMode lifecycle probe.
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		draftFilesRef.current = draftFiles;
	}, [draftFiles]);

	const allTurns = turns;
	const storedOpenArtifact = useMemo(() => {
		const turn = allTurns.find(
			(candidate) =>
				candidate.from === "assistant" &&
				candidate.artifact?.id === openArtifactId,
		);
		return turn?.from === "assistant" ? turn.artifact : undefined;
	}, [allTurns, openArtifactId]);
	const streamingArtifact = useMemo(
		() =>
			isBusy && !liveArtifactDismissed
				? extractStreamingCodeArtifact(liveProgress.streamedText)
				: undefined,
		[isBusy, liveArtifactDismissed, liveProgress.streamedText],
	);
	const openArtifact = streamingArtifact ?? storedOpenArtifact;
	const previousArtifact = useMemo(() => {
		const currentIndex = streamingArtifact
			? allTurns.length
			: allTurns.findIndex(
					(turn) =>
						turn.from === "assistant" &&
						turn.artifact?.id === openArtifact?.id,
				);
		if (currentIndex < 0) return undefined;
		for (let index = currentIndex - 1; index >= 0; index -= 1) {
			const turn = allTurns[index];
			if (turn?.from === "assistant" && turn.artifact) return turn.artifact;
		}
		return undefined;
	}, [allTurns, openArtifact?.id, streamingArtifact]);

	useEffect(() => {
		if (!streamingArtifact) {
			codeWorkspaceAutoOpenedRef.current = false;
			return;
		}
		if (codeWorkspaceAutoOpenedRef.current) return;
		codeWorkspaceAutoOpenedRef.current = true;
		onCodeWorkspaceOpen?.();
	}, [onCodeWorkspaceOpen, streamingArtifact]);
	const usedTokens = useMemo(
		() =>
			Math.ceil(
				allTurns.reduce((total, turn) => total + turn.text.length, 0) / 4,
			),
		[allTurns],
	);

	const showNotice = useCallback((text: string, tone: NoticeTone = "info") => {
		setNotice({ id: crypto.randomUUID(), text, tone });
	}, []);

	useEffect(() => {
		if (!notice) return;
		const timer = window.setTimeout(
			() => setNotice(null),
			notice.tone === "error" ? 7000 : 4500,
		);
		return () => window.clearTimeout(timer);
	}, [notice]);

	const setTruth = useCallback(
		(next: boolean) => {
			onTruthModeChange(next);
		},
		[onTruthModeChange],
	);

	const handleTruthCommand = (value: string) => {
		const normalized = value.trim().toLocaleLowerCase("tr-TR");
		if (!normalized.startsWith("/truthmode")) return false;
		const command = normalized
			.slice("/truthmode".length)
			.replace(/^\s*:?\s*/, "");
		if (["off", "kapat", "kapalı"].includes(command)) {
			setTruth(false);
			showNotice("Truth Mode kapatıldı.", "success");
		} else if (["status", "durum"].includes(command)) {
			showNotice(`Truth Mode şu anda ${truthMode ? "açık" : "kapalı"}.`);
		} else {
			setTruth(true);
			showNotice(
				"Truth Mode açık. Belirsizlikler ve doğrulanamayan sonuçlar açıkça belirtilecek.",
				"success",
			);
		}
		return true;
	};

	const addFiles = useCallback(
		async (files: FileList | File[]) => {
			const remainingSlots = Math.max(
				0,
				MAX_FILES - draftFilesRef.current.length,
			);
			const candidates = Array.from(files);
			const selected = candidates.slice(0, remainingSlots);
			const accepted: DraftFile[] = [];
			const rejected: string[] = [];
			let hasTruncatedPreview = false;
			let binaryCount = 0;
			for (const file of selected) {
				if (file.size > MAX_FILE_BYTES) {
					rejected.push(file.name);
					continue;
				}
				const preview = await readBrowserFilePreview(
					file,
					MAX_FILE_CONTEXT_BYTES,
				);
				hasTruncatedPreview ||= preview.truncated;
				if (preview.contentKind === "binary") binaryCount += 1;
				accepted.push({
					...preview,
					id: crypto.randomUUID(),
					name: file.name,
					size: file.size,
				});
			}
			setDraftFiles((current) => {
				const next = [...current, ...accepted].slice(0, MAX_FILES);
				draftFilesRef.current = next;
				return next;
			});
			if (candidates.length > remainingSlots) {
				rejected.push(
					`${candidates.length - remainingSlots} dosya (30 dosya sınırı)`,
				);
			}
			if (rejected.length > 0) {
				showNotice(
					`Eklenemeyen öğe: ${rejected.join(", ")}. Tek işlemde en fazla 30 dosya ve dosya başına en fazla 512 MiB desteklenir.`,
					"error",
				);
			} else if (binaryCount > 0) {
				showNotice(
					`${accepted.length} dosya eklendi; ${binaryCount} ikili dosya güvenli metadata olarak tutulacak.`,
				);
			} else if (hasTruncatedPreview) {
				showNotice(
					"Büyük dosyalar eklendi. Sağlayıcıya her dosyanın ilk 64 KiB metin önizlemesi gönderilecek.",
				);
			} else if (accepted.length > 0) {
				showNotice(`${accepted.length} dosya eklendi.`, "success");
			}
		},
		[showNotice],
	);

	const addDesktopFiles = useCallback(
		(files: DesktopDroppedTextFile[]) => {
			const remainingSlots = Math.max(
				0,
				MAX_FILES - draftFilesRef.current.length,
			);
			const selected = files.slice(0, remainingSlots);
			const addedCount = selected.length;
			const omittedCount = files.length - selected.length;
			setDraftFiles((current) => {
				const next = [
					...current,
					...selected.map((file) => ({ ...file, id: crypto.randomUUID() })),
				].slice(0, MAX_FILES);
				draftFilesRef.current = next;
				return next;
			});
			if (omittedCount > 0) {
				showNotice(
					`${addedCount} dosya eklendi; ${omittedCount} dosya 30 dosya sınırı nedeniyle eklenmedi.`,
					"error",
				);
			} else if (files.some((file) => file.contentKind === "binary")) {
				const binaryCount = files.filter(
					(file) => file.contentKind === "binary",
				).length;
				showNotice(
					`${addedCount} dosya eklendi; ${binaryCount} ikili dosya güvenli metadata olarak tutulacak.`,
				);
			} else if (files.some((file) => file.truncated)) {
				showNotice(
					`${addedCount} dosya eklendi. Büyük dosyalar için ilk 64 KiB metin önizlemesi kullanılacak.`,
				);
			} else if (addedCount > 0) {
				showNotice(`${addedCount} dosya veya klasör öğesi eklendi.`, "success");
			}
		},
		[showNotice],
	);

	useEffect(() => {
		if (!isTauriDesktop()) return;
		let disposed = false;
		let unlisten: (() => void) | undefined;

		void import("@tauri-apps/api/window")
			.then(async ({ getCurrentWindow }) => {
				const stopListening = await getCurrentWindow().onDragDropEvent(
					(event) => {
						if (disposed) return;
						if (
							event.payload.type === "enter" ||
							event.payload.type === "over"
						) {
							setIsDragging(true);
							return;
						}
						if (event.payload.type === "leave") {
							setIsDragging(false);
							return;
						}
						if (event.payload.type === "drop") {
							setIsDragging(false);
							void readDesktopDroppedTextFiles(event.payload.paths)
								.then(addDesktopFiles)
								.catch((error: unknown) => {
									showNotice(
										error instanceof Error
											? error.message
											: String(error || "Dosya eklenemedi."),
										"error",
									);
								});
						}
					},
				);
				if (disposed) stopListening();
				else unlisten = stopListening;
			})
			.catch(() => {
				if (!disposed) setIsDragging(false);
			});

		return () => {
			disposed = true;
			unlisten?.();
		};
	}, [addDesktopFiles, showNotice]);

	useEffect(() => {
		if (!turnMenu) return;
		const close = () => setTurnMenu(null);
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") close();
		};
		window.addEventListener("pointerdown", close);
		window.addEventListener("resize", close);
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("pointerdown", close);
			window.removeEventListener("resize", close);
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [turnMenu]);

	const openTurnMenu = (turnId: string, x: number, y: number) => {
		setTurnMenu({
			turnId,
			x: Math.min(x, Math.max(8, window.innerWidth - 216)),
			y: Math.min(y, Math.max(8, window.innerHeight - 150)),
		});
	};

	const focusComposer = () => {
		window.requestAnimationFrame(() => {
			document
				.querySelector<HTMLTextAreaElement>(
					'textarea[aria-label="Line AI\'ya mesaj gönder"]',
				)
				?.focus();
		});
	};

	const editUserTurn = (turnId: string) => {
		const turn = allTurns.find(
			(candidate) => candidate.id === turnId && candidate.from === "user",
		);
		if (!turn || turn.from !== "user") return;
		setDraft(turn.text);
		focusComposer();
		showNotice(
			turn.attachments?.length
				? "Mesaj düzenleyiciye alındı. Dosyaları yeniden ekleyip gönderebilirsiniz."
				: "Mesaj düzenleyiciye alındı.",
			"success",
		);
	};

	const send = async (value: string) => {
		const prompt = value.trim();
		if (!prompt || isBusy) return;
		if (handleTruthCommand(prompt)) return;
		if (prompt.startsWith("+")) {
			showNotice("Komutu göndermek yerine açılan listeden bir ayar seçin.");
			return;
		}
		liveArtifactDismissedRef.current = false;
		setLiveArtifactDismissed(false);
		setDraft("");

		const files = draftFiles;
		setDraftFiles([]);
		draftFilesRef.current = [];
		const userTurn: ChatTurn = {
			attachments: files.map(({ contentKind, id, name, size, truncated }) => ({
				contentKind,
				id,
				name,
				size,
				truncated,
			})),
			from: "user",
			id: crypto.randomUUID(),
			text: prompt,
			timestamp: formatClock(new Date()),
		};
		onAppendTurn(userTurn);
		setLiveProgress(initialLiveProgress());
		setIsBusy(true);
		const startedAt = performance.now();
		const browserIntent = parseBrowserIntent(prompt);
		const activities: ToolActivity[] = [];
		const browserAttachments: PromptAttachment[] = [];

		const appendDirectBrowserResult = (
			text: string,
			tone: "normal" | "error" = "normal",
		) => {
			onAppendTurn({
				activities,
				durationMs: Math.max(1, Math.round(performance.now() - startedAt)),
				from: "assistant",
				id: crypto.randomUUID(),
				text,
				timestamp: formatClock(new Date()),
				tone,
				truthMode,
			});
		};

		if (browserIntent.kind !== "none") {
			setLiveProgress({
				history: [],
				label: "Chrome bağlantısını hazırlıyorum",
				phase: "browser",
				sources: [],
				streamedText: "",
			});
			if (!browserTools) {
				activities.push({
					detail: "Ayarlar > Tarayıcı bölümünden etkinleştirin.",
					kind: "browser",
					label: "Chrome entegrasyonu kapalı",
					status: "failed",
				});
				appendDirectBrowserResult(
					"Chrome entegrasyonu kapalı. Ayarlar > Tarayıcı bölümünden etkinleştirebilirsiniz.",
					"error",
				);
				setIsBusy(false);
				return;
			}
			try {
				if (browserIntent.kind === "invalid") {
					throw new Error(browserIntent.message);
				}
				if (browserIntent.kind === "status") {
					const status = await readBrowserStatus();
					activities.push({
						detail: status.connected
							? `${status.tabCount} sekme · izole profil`
							: "Bağlantı kapalı",
						kind: "browser",
						label: "Chrome durumu doğrulandı",
						status: "completed",
					});
					appendDirectBrowserResult(
						status.connected
							? `Chrome bağlantısı açık. ${status.tabCount} sekme, izole Line AI profili ve yalnız 127.0.0.1 sınırı kullanılıyor.`
							: "Chrome bağlantısı şu anda kapalı.",
					);
					setIsBusy(false);
					return;
				}
				if (browserIntent.kind === "start") {
					const status = await startBrowserSession();
					activities.push({
						detail: `${status.tabCount} sekme · izole profil`,
						kind: "browser",
						label: "Chrome bağlantısı kuruldu",
						status: "completed",
					});
					appendDirectBrowserResult(
						"Chrome bağlantısı güvenli izole profilde başlatıldı.",
					);
					setIsBusy(false);
					return;
				}
				if (browserIntent.kind === "stop") {
					await stopBrowserSession();
					activities.push({
						kind: "browser",
						label: "Chrome bağlantısı durduruldu",
						status: "completed",
					});
					appendDirectBrowserResult(
						"Chrome bağlantısı ve izole tarayıcı süreci durduruldu.",
					);
					setIsBusy(false);
					return;
				}

				if (browserIntent.kind !== "tool") {
					throw new Error("Desteklenmeyen Chrome komutu.");
				}
				const status = await readBrowserStatus().catch(() => null);
				if (!status?.connected) await startBrowserSession();
				const firstResult = await executeBrowserTool(browserIntent.request);
				let contextResult = firstResult;
				if (
					!browserIntent.direct &&
					browserIntent.request.action === "open_url"
				) {
					await new Promise((resolve) => window.setTimeout(resolve, 650));
					contextResult = await executeBrowserTool({ action: "read_page" });
				}
				activities.push({
					detail: contextResult.message,
					kind: "browser",
					label: "Chrome entegrasyonu kullanıldı · komutlar çalıştırıldı",
					status: "completed",
					title: contextResult.title,
					url: contextResult.url,
				});

				if (browserIntent.direct) {
					const detail = contextResult.pageText
						? `${contextResult.pageText.length.toLocaleString("tr-TR")} karakter görünür metin okundu.`
						: contextResult.message;
					appendDirectBrowserResult(
						`${contextResult.title ? `${contextResult.title}\n` : ""}${detail}${contextResult.url ? `\n${contextResult.url}` : ""}`,
					);
					setIsBusy(false);
					return;
				}

				if (contextResult.pageText) {
					if (draftFiles.length >= MAX_FILES) {
						activities.push({
							detail:
								"Sayfa okundu ancak 30 dosya sınırı dolu olduğu için model bağlamına eklenemedi.",
							kind: "browser",
							label: "Chrome sayfa bağlamı eklenemedi",
							status: "failed",
						});
						appendDirectBrowserResult(
							"Chrome sayfası okundu; ancak bu istekte 30 dosya bulunduğu için sayfa içeriği sağlayıcıya güvenli biçimde eklenemedi.",
							"error",
						);
						setIsBusy(false);
						return;
					}
					const pagePreview = contextResult.pageText.slice(0, 15_000);
					const content = [
						`Chrome sayfa başlığı: ${contextResult.title ?? "Bilinmiyor"}`,
						`Adres: ${contextResult.url ?? "Bilinmiyor"}`,
						"",
						pagePreview,
					].join("\n");
					browserAttachments.push({
						content,
						contentKind: "text",
						mimeType: "text/plain",
						name: `Chrome · ${contextResult.title ?? "aktif sayfa"}.txt`,
						size: new TextEncoder().encode(content).byteLength,
						truncated: pagePreview.length < contextResult.pageText.length,
					});
				}
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Chrome işlemi tamamlanamadı.";
				activities.push({
					detail: message,
					kind: "browser",
					label: "Chrome entegrasyonu tamamlanamadı",
					status: "failed",
				});
				if (browserIntent.direct) {
					appendDirectBrowserResult(message, "error");
					setIsBusy(false);
					return;
				}
			}
		}

		const request: ExecutePromptRequest = {
			attachments: [
				...files.map(
					({ content, contentKind, mimeType, name, size, truncated }) => ({
						content,
						contentKind,
						mimeType,
						name,
						size: size ?? 0,
						truncated,
					}),
				),
				...browserAttachments,
			],
			customInstructions,
			prompt,
			provider,
			reasoning,
			responseStyle,
			transcript: allTurns.map((turn) => ({
				role: turn.from,
				content:
					turn.from === "assistant" && turn.artifact
						? `${turn.text}\n\n${turn.artifact.files
								.map(
									(file) =>
										`\`\`\`${file.language} file=${file.name}\n${file.content}\n\`\`\``,
								)
								.join("\n\n")}`
						: turn.text,
			})),
			truthMode,
		};

		try {
			const handleEvent = (event: ExecutePromptEvent) => {
				if (!mountedRef.current) return;
				if (event.kind === "reset") {
					setLiveProgress(initialLiveProgress());
					return;
				}
				if (event.kind === "status" || event.kind === "search") {
					setLiveProgress((current) =>
						advanceLiveProgress(
							current,
							event.label,
							event.kind === "search" ? "searching" : "thinking",
						),
					);
					return;
				}
				if (event.kind === "source") {
					setLiveProgress((current) =>
						current.sources.some((source) => source.url === event.source.url)
							? current
							: {
									history: [...current.history, current.label].slice(-5),
									label: "Kaynakları inceliyor",
									phase: "searching",
									sources: [...current.sources, event.source].slice(0, 8),
									streamedText: current.streamedText,
								},
					);
					return;
				}
				if (event.kind === "text_delta") {
					setLiveProgress((current) => {
						const streamedText = current.streamedText + event.text;
						const artifact = extractStreamingCodeArtifact(streamedText);
						const activeFile = artifact?.files.at(-1);
						const activeFileBytes = activeFile
							? new TextEncoder().encode(activeFile.content).byteLength
							: 0;
						return advanceLiveProgress(
							{ ...current, streamedText },
							activeFile
								? `${activeFile.name} yazılıyor · ${formatBytes(activeFileBytes)}`
								: "Yanıtı yazıyor",
							"writing",
						);
					});
				}
			};
			const result = await executePrompt(request, handleEvent);
			if (!mountedRef.current) return;
			const extracted = extractCodeArtifact(result.message);
			if (extracted.artifact && !liveArtifactDismissedRef.current) {
				setOpenArtifactId(extracted.artifact.id);
			}
			onAppendTurn({
				activities,
				artifact: extracted.artifact,
				durationMs: Math.max(1, Math.round(performance.now() - startedAt)),
				from: "assistant",
				id: crypto.randomUUID(),
				model: result.model,
				provider: result.provider,
				reasoning,
				sources: result.sources,
				text: extracted.visibleText,
				timestamp: formatClock(new Date()),
				truthMode,
			});
		} catch (error) {
			if (!mountedRef.current) return;
			const message =
				error instanceof Error ? error.message : "Yanıt alınamadı.";
			showNotice(message, "error");
			onAppendTurn({
				activities,
				durationMs: Math.max(1, Math.round(performance.now() - startedAt)),
				from: "assistant",
				id: crypto.randomUUID(),
				reasoning,
				text: message,
				timestamp: formatClock(new Date()),
				tone: "error",
				truthMode,
			});
		} finally {
			if (mountedRef.current) setIsBusy(false);
		}
	};

	const retryAssistantTurn = (turnId: string) => {
		if (isBusy) return;
		const assistantIndex = allTurns.findIndex(
			(turn) => turn.id === turnId && turn.from === "assistant",
		);
		if (assistantIndex < 1) return;
		const source = [...allTurns.slice(0, assistantIndex)]
			.reverse()
			.find((turn) => turn.from === "user");
		if (!source || source.from !== "user") return;
		if (source.attachments?.length) {
			setDraft(source.text);
			focusComposer();
			showNotice(
				"Bu istekte dosya vardı. Aynı dosyaları yeniden ekleyip göndermeniz gerekiyor.",
				"info",
			);
			return;
		}
		void send(source.text);
	};

	const contentKey = `${allTurns.length}-${isBusy ? "busy" : "idle"}`;

	return (
		<div className="relative flex min-h-0 min-w-0 flex-1">
			<section className={cn("flex min-w-0 flex-1 flex-col", className)}>
				<header className="flex h-14 shrink-0 items-center gap-3 border-border/60 border-b px-3 sm:px-5">
					<button
						aria-label="Sohbet listesini aç"
						className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
						onClick={onOpenSidebar}
						type="button"
					>
						<PanelLeftOpen aria-hidden="true" size={17} />
					</button>
					<div className="min-w-0 flex-1">
						<h1 className="truncate font-medium text-sm">{title}</h1>
						<p className="text-muted-foreground text-[0.68rem]">
							API bağlantılarınız · anahtarlar yalnız masaüstü işleminde
						</p>
					</div>
					<span className="hidden items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-primary text-xs sm:flex">
						<ShieldCheck aria-hidden="true" size={13} />
						Truth Mode {truthMode ? "açık" : "kapalı"}
					</span>
				</header>

				<section
					aria-label="Dosya bırakma ve sohbet alanı"
					className={cn(
						"relative min-h-0 flex-1",
						isDragging && "bg-primary/5",
					)}
					onDragEnter={(event) => {
						event.preventDefault();
						setIsDragging(true);
					}}
					onDragLeave={(event) => {
						if (!event.currentTarget.contains(event.relatedTarget as Node))
							setIsDragging(false);
					}}
					onDragOver={(event) => event.preventDefault()}
					onDrop={(event) => {
						event.preventDefault();
						setIsDragging(false);
						if (!isTauriDesktop()) void addFiles(event.dataTransfer.files);
					}}
				>
					<AnimatePresence>
						{isDragging ? (
							<motion.div
								animate={{ opacity: 1, scale: 1 }}
								className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center overflow-hidden rounded-3xl border border-primary/70 bg-primary/12 p-6 shadow-2xl shadow-primary/10 backdrop-blur-md sm:inset-5"
								exit={
									shouldReduceMotion
										? { opacity: 0 }
										: { opacity: 0, scale: 0.985 }
								}
								initial={
									shouldReduceMotion
										? { opacity: 0 }
										: { opacity: 0, scale: 0.985 }
								}
								transition={
									shouldReduceMotion
										? { duration: 0 }
										: { bounce: 0, duration: 0.18, type: "spring" }
								}
							>
								<div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--color-primary),transparent_64%)] opacity-[0.07]" />
								<div className="relative flex max-w-md flex-col items-center text-center">
									<motion.span
										animate={shouldReduceMotion ? undefined : { y: [0, -5, 0] }}
										className="mb-4 flex size-16 items-center justify-center rounded-2xl border border-primary/25 bg-background/90 text-primary shadow-lg shadow-primary/10"
										transition={{
											duration: 1.4,
											ease: "easeInOut",
											repeat: Number.POSITIVE_INFINITY,
										}}
									>
										<UploadCloud aria-hidden="true" size={30} />
									</motion.span>
									<strong className="text-lg">
										Eklemek için buraya bırakın
									</strong>
									<span className="mt-1.5 text-muted-foreground text-sm">
										Dosyalar ve klasörler güvenli biçimde taranır
									</span>
									<span className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
										<span className="flex items-center gap-1.5 rounded-full border border-border/70 bg-background/75 px-3 py-1.5">
											<Files size={13} /> En fazla 30 dosya
										</span>
										<span className="flex items-center gap-1.5 rounded-full border border-border/70 bg-background/75 px-3 py-1.5">
											<FolderTree size={13} /> Klasör desteği
										</span>
										<span className="rounded-full border border-border/70 bg-background/75 px-3 py-1.5">
											Dosya başına 512 MiB
										</span>
									</span>
								</div>
							</motion.div>
						) : null}
					</AnimatePresence>

					<AIConversation className="h-full" contentKey={contentKey}>
						<div className="mx-auto flex min-h-full w-full max-w-[52rem] flex-col px-4 py-7 sm:px-7 sm:py-9">
							{allTurns.length === 0 && !isBusy ? (
								<div className="m-auto flex w-full max-w-2xl flex-col items-center gap-6 py-12 text-center">
									<SiriOrb size="96px" state="idle" />
									<div>
										<h2 className="font-semibold text-2xl tracking-tight sm:text-3xl">
											Bugün ne üzerinde çalışıyoruz?
										</h2>
										<p className="mt-2 text-muted-foreground text-sm">
											API’nizi ekleyin, isteğinizi yazın; Line AI doğrulanan
											bağlantının gerçek yanıtını burada gösterir.
										</p>
									</div>
									<AISuggestions
										className="items-center"
										onSelect={(suggestion) => setDraft(suggestion.label)}
										suggestions={STARTER_SUGGESTIONS}
									/>
								</div>
							) : (
								<div
									aria-label="Sohbet mesajları"
									className="flex flex-col gap-7"
									role="log"
								>
									{allTurns.map((turn) => (
										<ChatTurnView
											key={turn.id}
											onEdit={editUserTurn}
											onOpenArtifact={setOpenArtifactId}
											onOpenContextMenu={openTurnMenu}
											onRetry={retryAssistantTurn}
											onVote={onVoteTurn}
											turn={turn}
										/>
									))}
									{isBusy ? (
										<LiveAssistantResponse progress={liveProgress} />
									) : null}
								</div>
							)}
						</div>
					</AIConversation>
				</section>

				<footer className="shrink-0 bg-gradient-to-t from-background via-background to-transparent px-3 pb-3 sm:px-6 sm:pb-5">
					<div className="mx-auto w-full max-w-3xl">
						<input
							className="hidden"
							multiple
							onChange={(event) => {
								if (event.target.files) void addFiles(event.target.files);
								event.target.value = "";
							}}
							ref={fileInputRef}
							type="file"
						/>
						<div className="relative">
							<ComposerCommandMenu
								filesAttached={draftFiles.length > 0}
								onClearFiles={() => {
									setDraftFiles([]);
									draftFilesRef.current = [];
									setDraft("");
									showNotice("Ekler temizlendi.", "success");
								}}
								onProvider={(next) => {
									onProviderChange(next);
									setDraft("");
									showNotice(
										`Sağlayıcı ${PROVIDERS.find((item) => item.id === next)?.label ?? next} olarak ayarlandı.`,
										"success",
									);
								}}
								onReasoning={(next) => {
									onReasoningChange(next);
									setDraft("");
									showNotice(
										`Akıl yürütme ${REASONING_OPTIONS.find((item) => item.id === next)?.label ?? next} olarak ayarlandı.`,
										"success",
									);
								}}
								onTruth={(next) => {
									setTruth(next);
									setDraft("");
									showNotice(
										`Truth Mode ${next ? "açıldı" : "kapatıldı"}.`,
										"success",
									);
								}}
								provider={provider}
								query={draft.startsWith("+") ? draft.slice(1) : null}
								reasoning={reasoning}
								truthMode={truthMode}
							/>
							<AIPromptInput
								ariaLabel="Line AI'ya mesaj gönder"
								attachments={draftFiles}
								attachLabel="Dosya veya arşiv ekle"
								disabled={isBusy}
								maxLength={32_000}
								onAttach={() => fileInputRef.current?.click()}
								onRemoveAttachment={(id) =>
									setDraftFiles((current) => {
										const next = current.filter((file) => file.id !== id);
										draftFilesRef.current = next;
										return next;
									})
								}
								onSubmit={(value) => void send(value)}
								onValueChange={setDraft}
								placeholder="Line AI'ya bir görev veya soru yazın…"
								state={isBusy ? "thinking" : "idle"}
								stopLabel="Yanıtı durdur"
								submitLabel="Mesajı gönder"
								value={draft}
							>
								<ProviderPicker onSelect={onProviderChange} value={provider} />
								<ReasoningPicker
									onSelect={onReasoningChange}
									value={reasoning}
								/>
								<button
									aria-label={`Truth Mode ${truthMode ? "açık" : "kapalı"}`}
									aria-pressed={truthMode}
									className={cn(
										"flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors",
										truthMode
											? "bg-primary/10 text-primary"
											: "text-muted-foreground hover:bg-muted",
									)}
									onClick={() => setTruth(!truthMode)}
									title="/truthmode"
									type="button"
								>
									<ShieldCheck aria-hidden="true" size={13} />
									<span className="hidden lg:inline">Truth</span>
								</button>
								<AIContextMeter
									className="hidden sm:inline-block"
									limit={CONTEXT_LIMIT}
									used={usedTokens}
								/>
							</AIPromptInput>
						</div>
						<p className="mt-1.5 text-center text-muted-foreground text-[0.66rem]">
							Enter gönderir · Shift+Enter yeni satır · /truthmode durumu
							yönetir
						</p>
					</div>
				</footer>

				<AnimatePresence>
					{notice ? (
						<StatusNotice
							key={notice.id}
							notice={notice}
							onClose={() => setNotice(null)}
						/>
					) : null}
				</AnimatePresence>

				{turnMenu ? (
					<div
						aria-label="Mesaj işlemleri"
						className="fixed z-50 w-52 rounded-xl border border-border/70 bg-popover p-1.5 text-popover-foreground shadow-black/15 shadow-xl"
						onPointerDown={(event) => event.stopPropagation()}
						role="menu"
						style={{ left: turnMenu.x, top: turnMenu.y }}
					>
						<TurnMenuAction
							icon={<Copy aria-hidden="true" size={15} />}
							label="Metni kopyala"
							onClick={() => {
								const turn = allTurns.find(
									(item) => item.id === turnMenu.turnId,
								);
								if (turn) {
									void navigator.clipboard
										.writeText(turn.text)
										.catch(() =>
											showNotice("Mesaj panoya kopyalanamadı.", "error"),
										);
								}
								setTurnMenu(null);
							}}
						/>
						<TurnMenuAction
							icon={<Quote aria-hidden="true" size={15} />}
							label="Mesajı alıntıla"
							onClick={() => {
								const turn = allTurns.find(
									(item) => item.id === turnMenu.turnId,
								);
								if (turn) {
									const quoted = turn.text
										.split("\n")
										.map((line) => `> ${line}`)
										.join("\n");
									setDraft((current) => `${quoted}\n\n${current}`);
								}
								setTurnMenu(null);
							}}
						/>
						<TurnMenuAction
							destructive
							icon={<Trash2 aria-hidden="true" size={15} />}
							label="Mesajı sil"
							onClick={() => {
								setDeleteTurnId(turnMenu.turnId);
								setTurnMenu(null);
							}}
						/>
					</div>
				) : null}

				{deleteTurnId ? (
					<div
						className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/25 p-4 backdrop-blur-[2px]"
						role="presentation"
					>
						<div
							aria-label="Mesajı sil"
							aria-modal="true"
							className="w-full max-w-sm rounded-2xl border border-border bg-background p-5 shadow-black/20 shadow-2xl"
							role="dialog"
						>
							<div className="mb-3 flex items-center justify-between gap-3">
								<h2 className="font-semibold text-base">Mesaj silinsin mi?</h2>
								<button
									aria-label="Pencereyi kapat"
									className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
									onClick={() => setDeleteTurnId(null)}
									type="button"
								>
									<X aria-hidden="true" size={16} />
								</button>
							</div>
							<p className="text-muted-foreground text-sm">
								Bu mesaj, Line AI Cloud sohbet geçmişinden kalıcı olarak
								silinecek.
							</p>
							<div className="mt-4 flex justify-end gap-2">
								<button
									className="rounded-xl border border-border px-3 py-2 font-medium text-sm hover:bg-muted"
									onClick={() => setDeleteTurnId(null)}
									type="button"
								>
									Vazgeç
								</button>
								<button
									className="rounded-xl border border-destructive/30 bg-destructive px-3 py-2 font-medium text-destructive-foreground text-sm hover:bg-destructive/90"
									onClick={() => {
										onDeleteTurn(deleteTurnId);
										setDeleteTurnId(null);
									}}
									type="button"
								>
									Mesajı sil
								</button>
							</div>
						</div>
					</div>
				) : null}
			</section>
			<AnimatePresence>
				{openArtifact ? (
					<CodeWorkspace
						artifact={openArtifact}
						isStreaming={Boolean(streamingArtifact)}
						onClose={() => {
							if (streamingArtifact) {
								liveArtifactDismissedRef.current = true;
								setLiveArtifactDismissed(true);
								return;
							}
							setOpenArtifactId(null);
						}}
						previousArtifact={previousArtifact}
					/>
				) : null}
			</AnimatePresence>
		</div>
	);
};

const ChatTurnView = ({
	onEdit,
	onOpenArtifact,
	onOpenContextMenu,
	onRetry,
	onVote,
	turn,
}: {
	onEdit: (turnId: string) => void;
	onOpenArtifact: (artifactId: string) => void;
	onOpenContextMenu: (turnId: string, x: number, y: number) => void;
	onRetry: (turnId: string) => void;
	onVote: (turnId: string, vote: "up" | "down") => void;
	turn: ChatTurn;
}) => {
	const contextProps = {
		onContextMenu: (event: React.MouseEvent<HTMLElement>) => {
			event.preventDefault();
			onOpenContextMenu(turn.id, event.clientX, event.clientY);
		},
		onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
			if (
				event.key === "ContextMenu" ||
				(event.shiftKey && event.key === "F10")
			) {
				event.preventDefault();
				const bounds = event.currentTarget.getBoundingClientRect();
				onOpenContextMenu(
					turn.id,
					bounds.left + 24,
					bounds.top + bounds.height,
				);
			}
		},
		tabIndex: 0,
	};

	if (turn.from === "user") {
		return (
			<article aria-label="Kullanıcı mesajı işlemleri" {...contextProps}>
				<AIMessage
					copyText={turn.text}
					from="user"
					onEdit={() => onEdit(turn.id)}
					timestamp={turn.timestamp}
				>
					<span className="flex flex-col gap-2">
						<span>{turn.text}</span>
						{turn.attachments?.length ? (
							<span className="flex flex-wrap justify-end gap-1.5">
								{turn.attachments.map((file) => (
									<span
										className="flex items-center gap-1.5 rounded-lg bg-background/15 px-2 py-1 text-xs"
										key={file.id}
									>
										<Paperclip aria-hidden="true" size={11} />
										{file.name}{" "}
										<span className="opacity-70">{formatBytes(file.size)}</span>
									</span>
								))}
							</span>
						) : null}
					</span>
				</AIMessage>
			</article>
		);
	}

	const rendered = splitAssistantResponse(turn.text);
	const sources = turn.sources?.length
		? turn.sources.map<AISource>((source) => ({
				...source,
				favicon: <SourceFavicon url={source.url} />,
			}))
		: extractSources(turn.text);
	const providerLabel =
		turn.provider === "openai"
			? "OpenAI"
			: turn.provider === "gemini"
				? "Gemini"
				: "Sağlayıcı";

	return (
		<article aria-label="Line AI mesajı işlemleri" {...contextProps}>
			<AIMessage
				bubble={false}
				copyText={turn.text}
				from="assistant"
				onRetry={() => onRetry(turn.id)}
				onVote={(vote) => onVote(turn.id, vote)}
				selectedVote={turn.feedback ?? null}
				timestamp={turn.timestamp}
			>
				<div
					className={cn(
						"flex flex-col gap-3",
						turn.tone === "error" && "text-destructive",
					)}
				>
					{turn.activities?.map((activity, index) => (
						<AIToolCall
							className={
								activity.status === "failed"
									? "border-destructive/30"
									: "border-border/70"
							}
							defaultOpen={activity.status === "failed"}
							key={`${activity.kind}-${activity.label}-${index}`}
							name={activity.label}
							result={
								<div className="flex min-w-0 items-center gap-2">
									<ChromeMark
										aria-hidden="true"
										className="shrink-0"
										size={14}
									/>
									<span className="min-w-0 flex-1 leading-relaxed">
										{activity.detail ?? "Chrome işlemi tamamlandı."}
									</span>
									{activity.url ? (
										<a
											className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background"
											href={activity.url}
											rel="noreferrer"
											target="_blank"
											title={activity.title ?? activity.url}
										>
											<SourceFavicon url={activity.url} />
										</a>
									) : null}
								</div>
							}
							status={activity.status === "completed" ? "success" : "error"}
							summary={activity.title}
						/>
					))}
					{rendered.text ? <AIResponse text={rendered.text} /> : null}
					{rendered.diffs.map((diff) => (
						<AIDiff key={diff.id} lines={diff.lines} title={diff.title} />
					))}
					{sources.length ? (
						<AISources label="Kaynaklar" sources={sources} />
					) : null}
					{turn.artifact ? (
						<button
							className="flex w-fit items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 font-medium text-xs transition-colors hover:bg-muted"
							onClick={(event) => {
								event.stopPropagation();
								onOpenArtifact(turn.artifact?.id ?? "");
							}}
							type="button"
						>
							<Code2 aria-hidden="true" size={14} />
							KOD · ÖNİZLE · DIFF
							<span className="text-muted-foreground">
								{turn.artifact.files.length} dosya
							</span>
						</button>
					) : null}
					{turn.provider || turn.durationMs ? (
						<p className="text-[0.7rem] text-muted-foreground tracking-[-0.005em]">
							{turn.model ?? providerLabel}
							{turn.durationMs
								? ` · ${(turn.durationMs / 1000).toFixed(1)} sn`
								: ""}
						</p>
					) : null}
				</div>
			</AIMessage>
		</article>
	);
};

type ResponseDiff = { id: string; lines: AIDiffLine[]; title: string };

const splitAssistantResponse = (
	text: string,
): { diffs: ResponseDiff[]; text: string } => {
	const diffs: ResponseDiff[] = [];
	const prose = text.replace(
		/```(?:diff)?\s*\n([\s\S]*?)```/gi,
		(block, body: string) => {
			const rawLines = body.replace(/\r/g, "").split("\n");
			const meaningful = rawLines.some(
				(line) => line.startsWith("+") || line.startsWith("-"),
			);
			if (!meaningful) return block;
			const titleLine =
				rawLines.find(
					(line) => line.startsWith("+++ ") && !line.endsWith("/dev/null"),
				) ??
				rawLines.find(
					(line) => line.startsWith("--- ") && !line.endsWith("/dev/null"),
				);
			const title =
				titleLine
					?.slice(4)
					.trim()
					.replace(/^[ab]\//, "") || `Değişiklik ${diffs.length + 1}`;
			const lines = rawLines
				.filter(
					(line) =>
						!line.startsWith("@@") &&
						!line.startsWith("+++ ") &&
						!line.startsWith("--- "),
				)
				.map<AIDiffLine>((line, index) => ({
					content:
						line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")
							? line.slice(1)
							: line,
					kind: line.startsWith("+")
						? "added"
						: line.startsWith("-")
							? "removed"
							: "context",
					number: index + 1,
				}));
			diffs.push({ id: `${diffs.length}-${title}`, lines, title });
			return "";
		},
	);
	return { diffs, text: prose.trim() };
};

const extractSources = (text: string): AISource[] => {
	const urls = text.match(/https?:\/\/[^\s<>)\]}]+/g) ?? [];
	return [...new Set(urls.map((url) => url.replace(/[.,;:!?]+$/, "")))]
		.slice(0, 12)
		.map((url, index) => {
			let title = url;
			try {
				title = new URL(url).hostname.replace(/^www\./, "");
			} catch {
				// Keep the original URL when a provider returned a malformed link.
			}
			return {
				favicon: <SourceFavicon url={url} />,
				id: `${index}-${url}`,
				title,
				url,
			};
		});
};

const SourceFavicon = ({ url }: { url: string }) => {
	const [failed, setFailed] = useState(false);
	let faviconUrl: string;
	try {
		faviconUrl = new URL("/favicon.ico", url).toString();
	} catch {
		return <Globe2 aria-hidden="true" size={12} />;
	}
	if (failed) return <Globe2 aria-hidden="true" size={12} />;
	return (
		<img
			alt=""
			className="size-full object-cover"
			loading="lazy"
			onError={() => setFailed(true)}
			referrerPolicy="no-referrer"
			src={faviconUrl}
		/>
	);
};

const visibleStreamingText = (text: string) => {
	const fenceMatches = [...text.matchAll(/```([^\r\n`]*)\r?\n/g)];
	if (fenceMatches.length % 2 === 1) {
		const openFence = fenceMatches.at(-1);
		const language = openFence?.[1].trim().toLowerCase() ?? "";
		if (language !== "diff" && language !== "patch") {
			return text.slice(0, openFence?.index ?? text.length).trim();
		}
	}
	return extractCodeArtifact(text).visibleText;
};

const LiveAssistantResponse = ({ progress }: { progress: LiveProgress }) => {
	const streamedText = visibleStreamingText(progress.streamedText);
	return (
		<div className="flex min-w-0 flex-col gap-3">
			<BusyResponse progress={progress} />
			{streamedText ? <AIResponse isStreaming text={streamedText} /> : null}
		</div>
	);
};

const BusyResponse = ({ progress }: { progress: LiveProgress }) => {
	const shouldReduceMotion = useReducedMotion();
	const StatusIcon =
		progress.phase === "browser"
			? ChromeMark
			: progress.phase === "searching"
				? Globe2
				: progress.phase === "writing"
					? Sparkles
					: BrainCircuit;
	return (
		<div
			aria-label="Canlı yapay zekâ akışı"
			aria-live="polite"
			className="flex min-w-0 flex-col gap-2 overflow-hidden text-[0.8rem] text-muted-foreground"
			role="status"
		>
			<div className="flex h-7 min-w-0 items-center gap-2 leading-none">
				<span className="relative flex size-4 shrink-0 items-center justify-center">
					<StatusIcon aria-hidden="true" size={14} strokeWidth={1.7} />
					{shouldReduceMotion ? null : (
						<motion.span
							animate={{
								opacity: [0.15, 0.8, 0.15],
								scale: [0.7, 1.1, 0.7],
							}}
							aria-hidden="true"
							className="absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full bg-primary"
							transition={{
								duration: 1.25,
								ease: "easeInOut",
								repeat: Number.POSITIVE_INFINITY,
							}}
						/>
					)}
				</span>
				{progress.sources.length ? (
					<span className="flex shrink-0 -space-x-1.5">
						{progress.sources.slice(0, 4).map((source) => (
							<span
								className="flex size-4 items-center justify-center overflow-hidden rounded-full border border-background bg-muted"
								key={source.id}
								title={source.title}
							>
								<SourceFavicon url={source.url} />
							</span>
						))}
					</span>
				) : null}
				<span className="shrink-0 font-medium text-muted-foreground/95">
					{progress.label}
				</span>
				{progress.sources.length ? (
					<span className="truncate text-[0.72rem] opacity-75">
						{progress.sources
							.slice(0, 3)
							.map((source) => {
								try {
									return new URL(source.url).hostname.replace(/^www\./, "");
								} catch {
									return source.title;
								}
							})
							.join(" · ")}
					</span>
				) : null}
			</div>
			<ol
				aria-label="Canlı işlem adımları"
				className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] leading-4"
			>
				{progress.history.map((label, index) => (
					<li className="flex min-w-0 items-center gap-1 opacity-65" key={`${label}-${index}`}>
						<Check aria-hidden="true" className="shrink-0" size={11} />
						<span className="truncate">{label}</span>
					</li>
				))}
				<li aria-current="step" className="flex min-w-0 items-center gap-1 font-medium">
					<span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />
					<span className="truncate">{progress.label}</span>
				</li>
			</ol>
		</div>
	);
};

type CommandItem = {
	icon: React.ReactNode;
	id: string;
	label: string;
	note: string;
	selected?: boolean;
	run: () => void;
};

const ComposerCommandMenu = ({
	filesAttached,
	onClearFiles,
	onProvider,
	onReasoning,
	onTruth,
	provider,
	query,
	reasoning,
	truthMode,
}: {
	filesAttached: boolean;
	onClearFiles: () => void;
	onProvider: (provider: ProviderChoice) => void;
	onReasoning: (reasoning: ReasoningLevel) => void;
	onTruth: (enabled: boolean) => void;
	provider: ProviderChoice;
	query: string | null;
	reasoning: ReasoningLevel;
	truthMode: boolean;
}) => {
	if (query === null) return null;
	const items: CommandItem[] = [
		...PROVIDERS.map((item) => ({
			icon:
				item.id === "auto" ? (
					<Sparkles size={15} />
				) : item.id === "openai" ? (
					<Bot size={15} />
				) : (
					<Globe2 size={15} />
				),
			id: `provider-${item.id}`,
			label: `Sağlayıcı: ${item.label}`,
			note: item.note,
			selected: provider === item.id,
			run: () => onProvider(item.id),
		})),
		...REASONING_OPTIONS.map((item) => ({
			icon:
				item.id === "high" ? <BrainCircuit size={15} /> : <Gauge size={15} />,
			id: `reasoning-${item.id}`,
			label: `Akıl yürütme: ${item.label}`,
			note: item.note,
			selected: reasoning === item.id,
			run: () => onReasoning(item.id),
		})),
		{
			icon: <ShieldCheck size={15} />,
			id: "truth-mode",
			label: `Truth Mode: ${truthMode ? "Kapat" : "Aç"}`,
			note: "Doğrulanamayan sonuçları ve belirsizlikleri açıkça belirt",
			run: () => onTruth(!truthMode),
		},
		...(filesAttached
			? [
					{
						icon: <Trash2 size={15} />,
						id: "clear-files",
						label: "Ekleri temizle",
						note: "Bu mesaja eklenen dosyaları kaldır",
						run: onClearFiles,
					},
				]
			: []),
	];
	const needle = query.trim().toLocaleLowerCase("tr-TR");
	const visible = items.filter((item) =>
		`${item.label} ${item.note}`.toLocaleLowerCase("tr-TR").includes(needle),
	);
	return (
		<motion.div
			animate={{ opacity: 1, y: 0 }}
			aria-label="Line AI komutları"
			className="absolute right-0 bottom-full left-0 z-40 mb-2 max-h-80 overflow-y-auto rounded-2xl border border-border/70 bg-popover p-1.5 text-popover-foreground shadow-black/15 shadow-2xl"
			initial={{ opacity: 0, y: 6 }}
			role="menu"
		>
			<p className="px-2.5 py-2 font-medium text-muted-foreground text-xs">
				Ayar veya komut seçin
			</p>
			{visible.length ? (
				visible.map((item) => (
					<button
						className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted"
						key={item.id}
						onClick={item.run}
						role="menuitem"
						type="button"
					>
						<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
							{item.icon}
						</span>
						<span className="min-w-0 flex-1">
							<span className="block text-sm">{item.label}</span>
							<span className="block truncate text-muted-foreground text-xs">
								{item.note}
							</span>
						</span>
						{item.selected ? (
							<Check aria-hidden="true" className="text-primary" size={15} />
						) : null}
					</button>
				))
			) : (
				<p className="px-3 py-5 text-center text-muted-foreground text-sm">
					Eşleşen komut yok.
				</p>
			)}
		</motion.div>
	);
};

const StatusNotice = ({
	notice,
	onClose,
}: {
	notice: Notice;
	onClose: () => void;
}) => {
	const Icon =
		notice.tone === "error"
			? CircleAlert
			: notice.tone === "success"
				? CircleCheck
				: Sparkles;
	return (
		<motion.div
			animate={{ opacity: 1, y: 0 }}
			aria-live={notice.tone === "error" ? "assertive" : "polite"}
			className={cn(
				"fixed right-4 bottom-28 z-[70] flex max-w-md items-start gap-2.5 rounded-2xl border bg-popover px-3 py-2.5 text-popover-foreground shadow-black/15 shadow-xl",
				notice.tone === "error" && "border-destructive/35",
				notice.tone === "success" && "border-emerald-500/35",
			)}
			exit={{ opacity: 0, y: 8 }}
			initial={{ opacity: 0, y: 8 }}
			role={notice.tone === "error" ? "alert" : "status"}
		>
			<Icon
				aria-hidden="true"
				className={cn(
					"mt-0.5 shrink-0",
					notice.tone === "error"
						? "text-destructive"
						: notice.tone === "success"
							? "text-emerald-600"
							: "text-primary",
				)}
				size={16}
			/>
			<span className="text-sm leading-relaxed">{notice.text}</span>
			<button
				aria-label="Bildirimi kapat"
				className="rounded-md p-0.5 text-muted-foreground hover:bg-muted"
				onClick={onClose}
				type="button"
			>
				<X size={14} />
			</button>
		</motion.div>
	);
};

const TurnMenuAction = ({
	destructive = false,
	icon,
	label,
	onClick,
}: {
	destructive?: boolean;
	icon: React.ReactNode;
	label: string;
	onClick: () => void;
}) => (
	<button
		className={cn(
			"flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
			destructive && "text-destructive",
		)}
		onClick={onClick}
		role="menuitem"
		type="button"
	>
		{icon}
		{label}
	</button>
);

const ProviderPicker = ({
	onSelect,
	value,
}: {
	onSelect: (value: ProviderChoice) => void;
	value: ProviderChoice;
}) => {
	const current = PROVIDERS.find((item) => item.id === value) ?? PROVIDERS[0];
	return (
		<SelectMenu
			icon={<Sparkles aria-hidden="true" size={13} />}
			label="Sağlayıcı"
			onSelect={(id) => onSelect(id as ProviderChoice)}
			options={PROVIDERS}
			value={current.id}
		/>
	);
};

const REASONING_OPTIONS = [
	{ id: "low", label: "Hızlı", note: "Daha kısa düşünme" },
	{ id: "medium", label: "Dengeli", note: "Genel kullanım" },
	{ id: "high", label: "Derin", note: "Karmaşık görevler" },
] as const;

const ReasoningPicker = ({
	onSelect,
	value,
}: {
	onSelect: (value: ReasoningLevel) => void;
	value: ReasoningLevel;
}) => (
	<SelectMenu
		icon={<BrainCircuit aria-hidden="true" size={13} />}
		label="Akıl yürütme"
		onSelect={(id) => onSelect(id as ReasoningLevel)}
		options={REASONING_OPTIONS}
		value={value}
	/>
);

type SelectOption = { id: string; label: string; note: string };

const SelectMenu = ({
	icon,
	label,
	onSelect,
	options,
	value,
}: {
	icon: React.ReactNode;
	label: string;
	onSelect: (id: string) => void;
	options: readonly SelectOption[];
	value: string;
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const current = options.find((option) => option.id === value) ?? options[0];

	useEffect(() => {
		if (!isOpen) return;
		const onPointerDown = (event: PointerEvent) => {
			if (!containerRef.current?.contains(event.target as Node))
				setIsOpen(false);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setIsOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [isOpen]);

	return (
		<div className="relative" ref={containerRef}>
			<button
				aria-expanded={isOpen}
				aria-haspopup="menu"
				aria-label={`${label}: ${current.label}`}
				className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground"
				onClick={() => setIsOpen((open) => !open)}
				type="button"
			>
				{icon}
				<span className="hidden sm:inline">{current.label}</span>
				<ChevronDown aria-hidden="true" size={11} />
			</button>
			{isOpen ? (
				<div
					className="absolute bottom-full left-0 z-30 mb-2 w-56 overflow-hidden rounded-xl border border-border/60 bg-background p-1 shadow-black/10 shadow-lg"
					role="menu"
				>
					<p className="px-2 py-1.5 font-medium text-[0.68rem] text-muted-foreground uppercase tracking-wide">
						{label}
					</p>
					{options.map((option) => (
						<button
							className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted"
							key={option.id}
							onClick={() => {
								onSelect(option.id);
								setIsOpen(false);
							}}
							role="menuitem"
							type="button"
						>
							<span className="min-w-0 flex-1">
								<span className="block text-sm">{option.label}</span>
								<span className="block truncate text-muted-foreground text-xs">
									{option.note}
								</span>
							</span>
							{option.id === value ? (
								<Check aria-hidden="true" className="text-primary" size={14} />
							) : null}
						</button>
					))}
				</div>
			) : null}
		</div>
	);
};

export default ChatThread;
