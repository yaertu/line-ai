"use client";

import { cn } from "@/lib/utils";
import AIContextMeter from "@/components/line-ai/ai-context-meter";
import AIConversation from "@/components/line-ai/ai-conversation";
import AIDiff, { type AIDiffLine } from "@/components/line-ai/ai-diff";
import AILoader from "@/components/line-ai/ai-loader";
import AIMessage from "@/components/line-ai/ai-message";
import AIPromptInput, { type AIPromptAttachment } from "@/components/line-ai/ai-prompt-input";
import AIReasoning from "@/components/line-ai/ai-reasoning";
import AIResponse from "@/components/line-ai/ai-response";
import AISources, { type AISource } from "@/components/line-ai/ai-sources";
import AISuggestions from "@/components/line-ai/ai-suggestions";
import AITaskList, { type AITask } from "@/components/line-ai/ai-task-list";
import AIToolCall from "@/components/line-ai/ai-tool-call";
import SiriOrb from "@/components/line-ai/siri-orb";
import {
  isTauriDesktop,
  readDesktopDroppedTextFiles,
  type DesktopDroppedTextFile,
} from "@/lib/desktop-files";
import {
  BrainCircuit,
  Bot,
  CircleAlert,
  CircleCheck,
  Check,
  ChevronDown,
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
import {
  type ChatTurn,
  CONTEXT_LIMIT,
  type ExecutePromptRequest,
  type PromptAttachment,
  type PromptExecutor,
  PROVIDERS,
  type ProviderChoice,
  type ReasoningLevel,
  STARTER_SUGGESTIONS,
} from "./chat-data";

const MAX_FILE_BYTES = 512 * 1024 * 1024;
const MAX_FILE_CONTEXT_BYTES = 64 * 1024;
const MAX_FILES = 30;
const ACCEPTED_EXTENSIONS = new Set([
  "txt", "md", "json", "csv", "ts", "tsx", "js", "jsx", "py", "rs", "html", "css", "toml", "yaml", "yml",
]);
type DraftFile = AIPromptAttachment & PromptAttachment;
type NoticeTone = "error" | "info" | "success";
type Notice = { id: string; text: string; tone: NoticeTone };

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
  onDeleteTurn: (turnId: string) => void;
  onOpenSidebar?: () => void;
  onProviderChange: (provider: ProviderChoice) => void;
  onReasoningChange: (reasoning: ReasoningLevel) => void;
  onTruthModeChange: (enabled: boolean) => void;
  provider: ProviderChoice;
  reasoning: ReasoningLevel;
  title: string;
  truthMode: boolean;
  turns: ChatTurn[];
};

export const ChatThread = ({
  className,
  executePrompt,
  onAppendTurn,
  onDeleteTurn,
  onOpenSidebar,
  onProviderChange,
  onReasoningChange,
  onTruthModeChange,
  provider,
  reasoning,
  title,
  truthMode,
  turns,
}: ChatThreadProps) => {
  const [draft, setDraft] = useState("");
  const [draftFiles, setDraftFiles] = useState<DraftFile[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [turnMenu, setTurnMenu] = useState<{ turnId: string; x: number; y: number } | null>(null);
  const [deleteTurnId, setDeleteTurnId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftFilesRef = useRef<DraftFile[]>([]);
  const mountedRef = useRef(true);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    draftFilesRef.current = draftFiles;
  }, [draftFiles]);

  const allTurns = turns;
  const usedTokens = useMemo(
    () => Math.ceil(allTurns.reduce((total, turn) => total + turn.text.length, 0) / 4),
    [allTurns]
  );

  const showNotice = useCallback((text: string, tone: NoticeTone = "info") => {
    setNotice({ id: crypto.randomUUID(), text, tone });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), notice.tone === "error" ? 7000 : 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const setTruth = useCallback((next: boolean) => {
    onTruthModeChange(next);
  }, [onTruthModeChange]);

  const handleTruthCommand = (value: string) => {
    const normalized = value.trim().toLocaleLowerCase("tr-TR");
    if (!normalized.startsWith("/truthmode")) return false;
    const command = normalized.slice("/truthmode".length).replace(/^\s*:?\s*/, "");
    if (["off", "kapat", "kapalı"].includes(command)) {
      setTruth(false);
      showNotice("Truth Mode kapatıldı.", "success");
    } else if (["status", "durum"].includes(command)) {
      showNotice(`Truth Mode şu anda ${truthMode ? "açık" : "kapalı"}.`);
    } else {
      setTruth(true);
      showNotice("Truth Mode açık. Belirsizlikler ve doğrulanamayan sonuçlar açıkça belirtilecek.", "success");
    }
    return true;
  };

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const remainingSlots = Math.max(0, MAX_FILES - draftFilesRef.current.length);
    const candidates = Array.from(files);
    const selected = candidates.slice(0, remainingSlots);
    const accepted: DraftFile[] = [];
    const rejected: string[] = [];
    let hasTruncatedPreview = false;
    for (const file of selected) {
      const extension = file.name.split(".").pop()?.toLocaleLowerCase("en-US") ?? "";
      if (file.size > MAX_FILE_BYTES || !ACCEPTED_EXTENSIONS.has(extension)) {
        rejected.push(file.name);
        continue;
      }
      const truncated = file.size > MAX_FILE_CONTEXT_BYTES;
      hasTruncatedPreview ||= truncated;
      accepted.push({
        content: await file.slice(0, MAX_FILE_CONTEXT_BYTES).text(),
        id: crypto.randomUUID(),
        mimeType: file.type || "text/plain",
        name: file.name,
        size: file.size,
        truncated,
      });
    }
    setDraftFiles((current) => {
      const next = [...current, ...accepted].slice(0, MAX_FILES);
      draftFilesRef.current = next;
      return next;
    });
    if (candidates.length > remainingSlots) {
      rejected.push(`${candidates.length - remainingSlots} dosya (30 dosya sınırı)`);
    }
    if (rejected.length > 0) {
      showNotice(
        `Eklenemeyen öğe: ${rejected.join(", ")}. Tek işlemde en fazla 30 dosya ve dosya başına en fazla 512 MiB desteklenir.`,
        "error"
      );
    } else if (hasTruncatedPreview) {
      showNotice("Büyük dosyalar eklendi. Sağlayıcıya her dosyanın ilk 64 KiB metin önizlemesi gönderilecek.");
    } else if (accepted.length > 0) {
      showNotice(`${accepted.length} dosya eklendi.`, "success");
    }
  }, [showNotice]);

  const addDesktopFiles = useCallback((files: DesktopDroppedTextFile[]) => {
    const remainingSlots = Math.max(0, MAX_FILES - draftFilesRef.current.length);
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
      showNotice(`${addedCount} dosya eklendi; ${omittedCount} dosya 30 dosya sınırı nedeniyle eklenmedi.`, "error");
    } else if (files.some((file) => file.truncated)) {
      showNotice(`${addedCount} dosya eklendi. Büyük dosyalar için ilk 64 KiB metin önizlemesi kullanılacak.`);
    } else if (addedCount > 0) {
      showNotice(`${addedCount} dosya veya klasör öğesi eklendi.`, "success");
    }
  }, [showNotice]);

  useEffect(() => {
    if (!isTauriDesktop()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        const stopListening = await getCurrentWindow().onDragDropEvent((event) => {
          if (disposed) return;
          if (event.payload.type === "enter" || event.payload.type === "over") {
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
                  error instanceof Error ? error.message : String(error || "Dosya eklenemedi."),
                  "error"
                );
              });
          }
        });
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

  const send = async (value: string) => {
    const prompt = value.trim();
    if (!prompt || isBusy) return;
    if (handleTruthCommand(prompt)) return;
    if (prompt.startsWith("+")) {
      showNotice("Komutu göndermek yerine açılan listeden bir ayar seçin.");
      return;
    }
    setDraft("");

    const files = draftFiles;
    setDraftFiles([]);
    draftFilesRef.current = [];
    const userTurn: ChatTurn = {
      attachments: files.map(({ id, name, size }) => ({ id, name, size })),
      from: "user",
      id: crypto.randomUUID(),
      text: prompt,
      timestamp: formatClock(new Date()),
    };
    onAppendTurn(userTurn);
    setIsBusy(true);
    const startedAt = performance.now();

    const request: ExecutePromptRequest = {
      attachments: files.map(({ content, mimeType, name, size, truncated }) => ({
        content,
        mimeType,
        name,
        size: size ?? 0,
        truncated,
      })),
      prompt,
      provider,
      reasoning,
      transcript: allTurns.map((turn) => ({ role: turn.from, content: turn.text })),
      truthMode,
    };

    try {
      const result = await executePrompt(request);
      if (!mountedRef.current) return;
      onAppendTurn({
        durationMs: Math.max(1, Math.round(performance.now() - startedAt)),
        from: "assistant",
        id: crypto.randomUUID(),
        model: result.model,
        provider: result.provider,
        reasoning,
        text: result.message,
        timestamp: formatClock(new Date()),
        truthMode,
      });
    } catch (error) {
      if (!mountedRef.current) return;
      const message = error instanceof Error ? error.message : "Yanıt alınamadı.";
      showNotice(message, "error");
      onAppendTurn({
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

  const contentKey = `${allTurns.length}-${isBusy ? "busy" : "idle"}`;

  return (
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
          <p className="text-muted-foreground text-[0.68rem]">OpenAI ve Gemini · anahtarlar yalnız masaüstü işleminde</p>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-primary text-xs sm:flex">
          <ShieldCheck aria-hidden="true" size={13} />
          Truth Mode {truthMode ? "açık" : "kapalı"}
        </span>
      </header>

      <div
        className={cn("relative min-h-0 flex-1", isDragging && "bg-primary/5")}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDragging(false);
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
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
              transition={shouldReduceMotion ? { duration: 0 } : { bounce: 0, duration: 0.18, type: "spring" }}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--color-primary),transparent_64%)] opacity-[0.07]" />
              <div className="relative flex max-w-md flex-col items-center text-center">
                <motion.span
                  animate={shouldReduceMotion ? undefined : { y: [0, -5, 0] }}
                  className="mb-4 flex size-16 items-center justify-center rounded-2xl border border-primary/25 bg-background/90 text-primary shadow-lg shadow-primary/10"
                  transition={{ duration: 1.4, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }}
                >
                  <UploadCloud aria-hidden="true" size={30} />
                </motion.span>
                <strong className="text-lg">Eklemek için buraya bırakın</strong>
                <span className="mt-1.5 text-muted-foreground text-sm">Dosyalar ve klasörler güvenli biçimde taranır</span>
                <span className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
                  <span className="flex items-center gap-1.5 rounded-full border border-border/70 bg-background/75 px-3 py-1.5"><Files size={13} /> En fazla 30 dosya</span>
                  <span className="flex items-center gap-1.5 rounded-full border border-border/70 bg-background/75 px-3 py-1.5"><FolderTree size={13} /> Klasör desteği</span>
                  <span className="rounded-full border border-border/70 bg-background/75 px-3 py-1.5">Dosya başına 512 MiB</span>
                </span>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AIConversation className="h-full" contentKey={contentKey}>
          <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-4 py-6 sm:px-8">
            {allTurns.length === 0 && !isBusy ? (
              <div className="m-auto flex w-full max-w-2xl flex-col items-center gap-6 py-12 text-center">
                <SiriOrb size="96px" state="idle" />
                <div>
                  <h2 className="font-semibold text-2xl tracking-tight sm:text-3xl">Bugün ne üzerinde çalışıyoruz?</h2>
                  <p className="mt-2 text-muted-foreground text-sm">Sağlayıcıyı seçin, isteğinizi yazın; Line AI gerçek API yanıtını burada gösterir.</p>
                </div>
                <AISuggestions
                  className="items-center"
                  onSelect={(suggestion) => setDraft(suggestion.label)}
                  suggestions={STARTER_SUGGESTIONS}
                />
              </div>
            ) : (
              <div aria-label="Sohbet mesajları" className="flex flex-col gap-6" role="log">
                {allTurns.map((turn) => (
                  <ChatTurnView key={turn.id} onOpenContextMenu={openTurnMenu} turn={turn} />
                ))}
                {isBusy ? (
                  <AIMessage avatar={<SiriOrb size="28px" state="thinking" />} bubble={false} from="assistant">
                    <BusyResponse provider={provider} reasoning={reasoning} truthMode={truthMode} />
                  </AIMessage>
                ) : null}
              </div>
            )}
          </div>
        </AIConversation>
      </div>

      <footer className="shrink-0 bg-gradient-to-t from-background via-background to-transparent px-3 pb-3 sm:px-6 sm:pb-5">
        <div className="mx-auto w-full max-w-3xl">
          <input
            accept=".txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.rs,.html,.css,.toml,.yaml,.yml"
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
                showNotice(`Sağlayıcı ${PROVIDERS.find((item) => item.id === next)?.label ?? next} olarak ayarlandı.`, "success");
              }}
              onReasoning={(next) => {
                onReasoningChange(next);
                setDraft("");
                showNotice(`Akıl yürütme ${REASONING_OPTIONS.find((item) => item.id === next)?.label ?? next} olarak ayarlandı.`, "success");
              }}
              onTruth={(next) => {
                setTruth(next);
                setDraft("");
                showNotice(`Truth Mode ${next ? "açıldı" : "kapatıldı"}.`, "success");
              }}
              provider={provider}
              query={draft.startsWith("+") ? draft.slice(1) : null}
              reasoning={reasoning}
              truthMode={truthMode}
            />
            <AIPromptInput
            ariaLabel="Line AI'ya mesaj gönder"
            attachments={draftFiles}
            attachLabel="Metin veya kod dosyası ekle"
            disabled={isBusy}
            maxLength={32_000}
            onAttach={() => fileInputRef.current?.click()}
            onRemoveAttachment={(id) => setDraftFiles((current) => {
              const next = current.filter((file) => file.id !== id);
              draftFilesRef.current = next;
              return next;
            })}
            onSubmit={(value) => void send(value)}
            onValueChange={setDraft}
            placeholder="Line AI'ya bir görev veya soru yazın…"
            state={isBusy ? "thinking" : "idle"}
            stopLabel="Yanıtı durdur"
            submitLabel="Mesajı gönder"
            value={draft}
          >
            <ProviderPicker onSelect={onProviderChange} value={provider} />
            <ReasoningPicker onSelect={onReasoningChange} value={reasoning} />
            <button
              aria-label={`Truth Mode ${truthMode ? "açık" : "kapalı"}`}
              aria-pressed={truthMode}
              className={cn(
                "flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors",
                truthMode ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
              )}
              onClick={() => setTruth(!truthMode)}
              title="/truthmode"
              type="button"
            >
              <ShieldCheck aria-hidden="true" size={13} />
              <span className="hidden lg:inline">Truth</span>
            </button>
            <AIContextMeter className="hidden sm:inline-block" limit={CONTEXT_LIMIT} used={usedTokens} />
          </AIPromptInput>
          </div>
          <p className="mt-1.5 text-center text-muted-foreground text-[0.66rem]">Enter gönderir · Shift+Enter yeni satır · /truthmode durumu yönetir</p>
        </div>
      </footer>

      <AnimatePresence>
        {notice ? (
          <StatusNotice key={notice.id} notice={notice} onClose={() => setNotice(null)} />
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
              const turn = allTurns.find((item) => item.id === turnMenu.turnId);
              if (turn) {
                void navigator.clipboard.writeText(turn.text).catch(() =>
                  showNotice("Mesaj panoya kopyalanamadı.", "error")
                );
              }
              setTurnMenu(null);
            }}
          />
          <TurnMenuAction
            icon={<Quote aria-hidden="true" size={15} />}
            label="Mesajı alıntıla"
            onClick={() => {
              const turn = allTurns.find((item) => item.id === turnMenu.turnId);
              if (turn) {
                const quoted = turn.text.split("\n").map((line) => `> ${line}`).join("\n");
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/25 p-4 backdrop-blur-[2px]" role="presentation">
          <div aria-label="Mesajı sil" aria-modal="true" className="w-full max-w-sm rounded-2xl border border-border bg-background p-5 shadow-black/20 shadow-2xl" role="dialog">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold text-base">Mesaj silinsin mi?</h2>
              <button aria-label="Pencereyi kapat" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" onClick={() => setDeleteTurnId(null)} type="button">
                <X aria-hidden="true" size={16} />
              </button>
            </div>
            <p className="text-muted-foreground text-sm">Bu mesaj, bu cihazdaki sohbet geçmişinden kalıcı olarak silinecek.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-xl border border-border px-3 py-2 font-medium text-sm hover:bg-muted" onClick={() => setDeleteTurnId(null)} type="button">Vazgeç</button>
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
  );
};

const ChatTurnView = ({
  onOpenContextMenu,
  turn,
}: {
  onOpenContextMenu: (turnId: string, x: number, y: number) => void;
  turn: ChatTurn;
}) => {
  const contextProps = {
    onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      onOpenContextMenu(turn.id, event.clientX, event.clientY);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        onOpenContextMenu(turn.id, bounds.left + 24, bounds.top + bounds.height);
      }
    },
    tabIndex: 0,
  };

  if (turn.from === "user") {
    return (
      <div aria-label="Kullanıcı mesajı işlemleri" {...contextProps}>
        <AIMessage copyText={turn.text} from="user" timestamp={turn.timestamp}>
          <span className="flex flex-col gap-2">
            <span>{turn.text}</span>
            {turn.attachments?.length ? (
              <span className="flex flex-wrap justify-end gap-1.5">
                {turn.attachments.map((file) => (
                  <span className="flex items-center gap-1.5 rounded-lg bg-background/15 px-2 py-1 text-xs" key={file.id}>
                    <Paperclip aria-hidden="true" size={11} />
                    {file.name} <span className="opacity-70">{formatBytes(file.size)}</span>
                  </span>
                ))}
              </span>
            ) : null}
          </span>
        </AIMessage>
      </div>
    );
  }

  const rendered = splitAssistantResponse(turn.text);
  const sources = extractSources(turn.text);
  const providerLabel = turn.provider === "openai" ? "OpenAI" : turn.provider === "gemini" ? "Gemini" : "Sağlayıcı";
  const durationSeconds = turn.durationMs ? turn.durationMs / 1000 : undefined;

  return (
    <div aria-label="Line AI mesajı işlemleri" {...contextProps}>
      <AIMessage
        avatar={<SiriOrb size="28px" state={turn.tone === "error" ? "error" : "done"} />}
        bubble={false}
        copyText={turn.text}
        from="assistant"
        timestamp={turn.timestamp}
      >
        <div className={cn("flex flex-col gap-3", turn.tone === "error" && "text-destructive")}>
          {turn.reasoning ? (
            <AIReasoning collapseWhenDone duration={durationSeconds}>
              <p>
                {turn.reasoning === "high" ? "Derin" : turn.reasoning === "medium" ? "Dengeli" : "Hızlı"} işleme düzeyi kullanıldı.
                {turn.truthMode ? " Truth Mode doğruluk sınırları etkin tutuldu." : " Truth Mode kapalıydı."}
              </p>
            </AIReasoning>
          ) : null}
          {rendered.text ? <AIResponse text={rendered.text} /> : null}
          {rendered.diffs.map((diff) => (
            <AIDiff key={diff.id} lines={diff.lines} title={diff.title} />
          ))}
          {sources.length ? <AISources label="Yanıttaki bağlantılar" sources={sources} /> : null}
          {turn.provider || turn.tone === "error" ? (
            <AIToolCall
              args={turn.provider ? `Sağlayıcı: ${providerLabel}` : "Sağlayıcı seçimi tamamlanamadı"}
              defaultOpen={turn.tone === "error"}
              name="Model yanıtı"
              result={turn.tone === "error" ? turn.text : `${turn.model ?? "Model"} yanıtı alındı.`}
              status={turn.tone === "error" ? "error" : "success"}
              summary={turn.durationMs ? `${(turn.durationMs / 1000).toFixed(1)} sn` : undefined}
            />
          ) : null}
        </div>
      </AIMessage>
    </div>
  );
};

type ResponseDiff = { id: string; lines: AIDiffLine[]; title: string };

const splitAssistantResponse = (text: string): { diffs: ResponseDiff[]; text: string } => {
  const diffs: ResponseDiff[] = [];
  const prose = text.replace(/```(?:diff)?\s*\n([\s\S]*?)```/gi, (block, body: string) => {
    const rawLines = body.replace(/\r/g, "").split("\n");
    const meaningful = rawLines.some((line) => line.startsWith("+") || line.startsWith("-"));
    if (!meaningful) return block;
    const titleLine = rawLines.find((line) => line.startsWith("+++ ") || line.startsWith("--- "));
    const title = titleLine?.slice(4).trim() || `Değişiklik ${diffs.length + 1}`;
    const lines = rawLines
      .filter((line) => !line.startsWith("@@") && !line.startsWith("+++ ") && !line.startsWith("--- "))
      .map<AIDiffLine>((line, index) => ({
        content: line.startsWith("+") || line.startsWith("-") || line.startsWith(" ") ? line.slice(1) : line,
        kind: line.startsWith("+") ? "added" : line.startsWith("-") ? "removed" : "context",
        number: index + 1,
      }));
    diffs.push({ id: `${diffs.length}-${title}`, lines, title });
    return "";
  });
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
      return { id: `${index}-${url}`, title, url };
    });
};

const BusyResponse = ({
  provider,
  reasoning,
  truthMode,
}: {
  provider: ProviderChoice;
  reasoning: ReasoningLevel;
  truthMode: boolean;
}) => {
  const providerName = PROVIDERS.find((item) => item.id === provider)?.label ?? provider;
  const tasks: AITask[] = [
    { id: "request", label: "İstek ve sohbet bağlamı hazırlandı", status: "done" },
    {
      id: "provider",
      label: provider === "auto" ? "Kullanılabilir sağlayıcı seçiliyor" : `${providerName} yanıtı bekleniyor`,
      note: reasoning === "high" ? "Derin" : reasoning === "medium" ? "Dengeli" : "Hızlı",
      status: "running",
    },
  ];
  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <AILoader label="Yanıt hazırlanıyor" />
      <AIReasoning defaultOpen isStreaming>
        <p>{truthMode ? "Truth Mode açık; belirsizlik ve doğrulanamayan iddialar sonuçta belirtilecek." : "Standart yanıt hazırlanıyor."}</p>
      </AIReasoning>
      <AITaskList label="İstek durumu" tasks={tasks} />
      <AIToolCall
        args={`Sağlayıcı: ${providerName} · Düzey: ${reasoning}`}
        name="Model isteği"
        status="running"
        summary="Yanıt bekleniyor"
      />
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
      icon: item.id === "auto" ? <Sparkles size={15} /> : item.id === "openai" ? <Bot size={15} /> : <Globe2 size={15} />,
      id: `provider-${item.id}`,
      label: `Sağlayıcı: ${item.label}`,
      note: item.note,
      selected: provider === item.id,
      run: () => onProvider(item.id),
    })),
    ...REASONING_OPTIONS.map((item) => ({
      icon: item.id === "high" ? <BrainCircuit size={15} /> : <Gauge size={15} />,
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
      ? [{ icon: <Trash2 size={15} />, id: "clear-files", label: "Ekleri temizle", note: "Bu mesaja eklenen dosyaları kaldır", run: onClearFiles }]
      : []),
  ];
  const needle = query.trim().toLocaleLowerCase("tr-TR");
  const visible = items.filter((item) => `${item.label} ${item.note}`.toLocaleLowerCase("tr-TR").includes(needle));
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      aria-label="Line AI komutları"
      className="absolute right-0 bottom-full left-0 z-40 mb-2 max-h-80 overflow-y-auto rounded-2xl border border-border/70 bg-popover p-1.5 text-popover-foreground shadow-black/15 shadow-2xl"
      initial={{ opacity: 0, y: 6 }}
      role="menu"
    >
      <p className="px-2.5 py-2 font-medium text-muted-foreground text-xs">Ayar veya komut seçin</p>
      {visible.length ? visible.map((item) => (
        <button
          className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted"
          key={item.id}
          onClick={item.run}
          role="menuitem"
          type="button"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">{item.icon}</span>
          <span className="min-w-0 flex-1"><span className="block text-sm">{item.label}</span><span className="block truncate text-muted-foreground text-xs">{item.note}</span></span>
          {item.selected ? <Check aria-hidden="true" className="text-primary" size={15} /> : null}
        </button>
      )) : <p className="px-3 py-5 text-center text-muted-foreground text-sm">Eşleşen komut yok.</p>}
    </motion.div>
  );
};

const StatusNotice = ({ notice, onClose }: { notice: Notice; onClose: () => void }) => {
  const Icon = notice.tone === "error" ? CircleAlert : notice.tone === "success" ? CircleCheck : Sparkles;
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      aria-live={notice.tone === "error" ? "assertive" : "polite"}
      className={cn(
        "fixed right-4 bottom-28 z-[70] flex max-w-md items-start gap-2.5 rounded-2xl border bg-popover px-3 py-2.5 text-popover-foreground shadow-black/15 shadow-xl",
        notice.tone === "error" && "border-destructive/35",
        notice.tone === "success" && "border-emerald-500/35"
      )}
      exit={{ opacity: 0, y: 8 }}
      initial={{ opacity: 0, y: 8 }}
      role={notice.tone === "error" ? "alert" : "status"}
    >
      <Icon aria-hidden="true" className={cn("mt-0.5 shrink-0", notice.tone === "error" ? "text-destructive" : notice.tone === "success" ? "text-emerald-600" : "text-primary")} size={16} />
      <span className="text-sm leading-relaxed">{notice.text}</span>
      <button aria-label="Bildirimi kapat" className="rounded-md p-0.5 text-muted-foreground hover:bg-muted" onClick={onClose} type="button"><X size={14} /></button>
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
      destructive && "text-destructive"
    )}
    onClick={onClick}
    role="menuitem"
    type="button"
  >
    {icon}{label}
  </button>
);

const ProviderPicker = ({ onSelect, value }: { onSelect: (value: ProviderChoice) => void; value: ProviderChoice }) => {
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

const ReasoningPicker = ({ onSelect, value }: { onSelect: (value: ReasoningLevel) => void; value: ReasoningLevel }) => (
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
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
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
        {icon}<span className="hidden sm:inline">{current.label}</span><ChevronDown aria-hidden="true" size={11} />
      </button>
      {isOpen ? (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-56 overflow-hidden rounded-xl border border-border/60 bg-background p-1 shadow-black/10 shadow-lg" role="menu">
          <p className="px-2 py-1.5 font-medium text-[0.68rem] text-muted-foreground uppercase tracking-wide">{label}</p>
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
              <span className="min-w-0 flex-1"><span className="block text-sm">{option.label}</span><span className="block truncate text-muted-foreground text-xs">{option.note}</span></span>
              {option.id === value ? <Check aria-hidden="true" className="text-primary" size={14} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default ChatThread;
