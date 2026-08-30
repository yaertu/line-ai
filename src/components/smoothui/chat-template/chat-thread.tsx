"use client";

import { cn } from "@/lib/utils";
import AIContextMeter from "@/components/smoothui/ai-context-meter";
import AIConversation from "@/components/smoothui/ai-conversation";
import AILoader from "@/components/smoothui/ai-loader";
import AIMessage from "@/components/smoothui/ai-message";
import AIPromptInput, { type AIPromptAttachment } from "@/components/smoothui/ai-prompt-input";
import AIResponse from "@/components/smoothui/ai-response";
import AISuggestions from "@/components/smoothui/ai-suggestions";
import SiriOrb from "@/components/smoothui/siri-orb";
import {
  isTauriDesktop,
  readDesktopDroppedTextFiles,
  type DesktopDroppedTextFile,
} from "@/lib/desktop-files";
import {
  BrainCircuit,
  Check,
  ChevronDown,
  Copy,
  FileText,
  PanelLeftOpen,
  Paperclip,
  Quote,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
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

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_FILES = 4;
const ACCEPTED_EXTENSIONS = new Set([
  "txt", "md", "json", "csv", "ts", "tsx", "js", "jsx", "py", "rs", "html", "css", "toml", "yaml", "yml",
]);
const TRUTH_MODE_KEY = "line-cli.truth-mode";

type DraftFile = AIPromptAttachment & PromptAttachment;

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
  title: string;
  turns: ChatTurn[];
};

export const ChatThread = ({
  className,
  executePrompt,
  onAppendTurn,
  onDeleteTurn,
  onOpenSidebar,
  title,
  turns,
}: ChatThreadProps) => {
  const [draft, setDraft] = useState("");
  const [draftFiles, setDraftFiles] = useState<DraftFile[]>([]);
  const [provider, setProvider] = useState<ProviderChoice>("auto");
  const [reasoning, setReasoning] = useState<ReasoningLevel>("medium");
  const [truthMode, setTruthMode] = useState(
    () => localStorage.getItem(TRUTH_MODE_KEY) !== "off"
  );
  const [isBusy, setIsBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [turnMenu, setTurnMenu] = useState<{ turnId: string; x: number; y: number } | null>(null);
  const [deleteTurnId, setDeleteTurnId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const allTurns = turns;
  const usedTokens = useMemo(
    () => Math.ceil(allTurns.reduce((total, turn) => total + turn.text.length, 0) / 4),
    [allTurns]
  );

  const appendStatus = useCallback((text: string, tone: "normal" | "error" = "normal") => {
    onAppendTurn({
      from: "assistant",
      id: crypto.randomUUID(),
      text,
      timestamp: formatClock(new Date()),
      tone,
    });
  }, [onAppendTurn]);

  const setTruth = useCallback((next: boolean) => {
    setTruthMode(next);
    localStorage.setItem(TRUTH_MODE_KEY, next ? "on" : "off");
  }, []);

  const handleTruthCommand = (value: string) => {
    const normalized = value.trim().toLocaleLowerCase("tr-TR");
    if (!normalized.startsWith("/truthmode")) return false;
    const command = normalized.slice("/truthmode".length).replace(/^\s*:?\s*/, "");
    if (["off", "kapat", "kapalı"].includes(command)) {
      setTruth(false);
      appendStatus("Truth Mode kapatıldı. Bu tercih yeni sohbetlerde de korunacak.");
    } else if (["status", "durum"].includes(command)) {
      appendStatus(`Truth Mode şu anda ${truthMode ? "açık" : "kapalı"}.`);
    } else {
      setTruth(true);
      appendStatus("Truth Mode açık. Belirsizlikler belirtilecek; kaynak, işlem ve sonuçlar uydurulmayacak.");
    }
    return true;
  };

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const selected = Array.from(files).slice(0, MAX_FILES);
    const accepted: DraftFile[] = [];
    const rejected: string[] = [];
    for (const file of selected) {
      const extension = file.name.split(".").pop()?.toLocaleLowerCase("en-US") ?? "";
      if (file.size > MAX_FILE_BYTES || !ACCEPTED_EXTENSIONS.has(extension)) {
        rejected.push(file.name);
        continue;
      }
      accepted.push({
        content: await file.text(),
        id: crypto.randomUUID(),
        mimeType: file.type || "text/plain",
        name: file.name,
        size: file.size,
      });
    }
    setDraftFiles((current) => [...current, ...accepted].slice(0, MAX_FILES));
    if (rejected.length > 0) {
      appendStatus(
        `Eklenemeyen dosya: ${rejected.join(", ")}. En fazla 1 MB boyutunda metin ve kod dosyaları desteklenir.`,
        "error"
      );
    }
  }, [appendStatus]);

  const addDesktopFiles = useCallback((files: DesktopDroppedTextFile[]) => {
    setDraftFiles((current) => [
      ...current,
      ...files.map((file) => ({ ...file, id: crypto.randomUUID() })),
    ].slice(0, MAX_FILES));
  }, []);

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
                appendStatus(
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
  }, [addDesktopFiles, appendStatus]);

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
    setDraft("");
    if (handleTruthCommand(prompt)) return;

    const files = draftFiles;
    setDraftFiles([]);
    const userTurn: ChatTurn = {
      attachments: files.map(({ id, name, size }) => ({ id, name, size })),
      from: "user",
      id: crypto.randomUUID(),
      text: prompt,
      timestamp: formatClock(new Date()),
    };
    onAppendTurn(userTurn);
    setIsBusy(true);

    const request: ExecutePromptRequest = {
      attachments: files.map(({ content, mimeType, name }) => ({ content, mimeType, name })),
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
        from: "assistant",
        id: crypto.randomUUID(),
        model: result.model,
        provider: result.provider,
        text: result.message,
        timestamp: formatClock(new Date()),
      });
    } catch (error) {
      if (!mountedRef.current) return;
      appendStatus(error instanceof Error ? error.message : "Yanıt alınamadı.", "error");
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
          void addFiles(event.dataTransfer.files);
        }}
      >
        {isDragging ? (
          <div className="pointer-events-none absolute inset-4 z-20 flex items-center justify-center rounded-2xl border-2 border-primary border-dashed bg-background/90 backdrop-blur">
            <span className="flex items-center gap-2 font-medium text-sm"><FileText size={18} /> Metin veya kod dosyasını bırakın</span>
          </div>
        ) : null}

        <AIConversation className="h-full" contentKey={contentKey}>
          <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-4 py-6 sm:px-8">
            {allTurns.length === 0 && !isBusy ? (
              <div className="m-auto flex w-full max-w-2xl flex-col items-center gap-6 py-12 text-center">
                <SiriOrb size="96px" state="idle" />
                <div>
                  <h2 className="font-semibold text-2xl tracking-tight sm:text-3xl">Bugün ne üzerinde çalışıyoruz?</h2>
                  <p className="mt-2 text-muted-foreground text-sm">Sağlayıcıyı seçin, isteğinizi yazın; Line CLI gerçek API yanıtını burada gösterir.</p>
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
                    <AILoader label="Yanıt hazırlanıyor" showElapsed variant="dots" />
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
          <AIPromptInput
            ariaLabel="Line CLI'ya mesaj gönder"
            attachments={draftFiles}
            attachLabel="Metin veya kod dosyası ekle"
            disabled={isBusy}
            maxLength={32_000}
            onAttach={() => fileInputRef.current?.click()}
            onRemoveAttachment={(id) => setDraftFiles((current) => current.filter((file) => file.id !== id))}
            onSubmit={(value) => void send(value)}
            onValueChange={setDraft}
            placeholder="Line CLI'ya bir görev veya soru yazın…"
            state={isBusy ? "thinking" : "idle"}
            stopLabel="Yanıtı durdur"
            submitLabel="Mesajı gönder"
            value={draft}
          >
            <ProviderPicker onSelect={setProvider} value={provider} />
            <ReasoningPicker onSelect={setReasoning} value={reasoning} />
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
          <p className="mt-1.5 text-center text-muted-foreground text-[0.66rem]">Enter gönderir · Shift+Enter yeni satır · /truthmode durumu yönetir</p>
        </div>
      </footer>

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
                  appendStatus("Mesaj panoya kopyalanamadı.", "error")
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

  return (
    <div aria-label="Line CLI mesajı işlemleri" {...contextProps}>
      <AIMessage
        avatar={<SiriOrb size="28px" state={turn.tone === "error" ? "error" : "done"} />}
        bubble={false}
        copyText={turn.text}
        from="assistant"
        timestamp={turn.timestamp}
      >
        <div className={cn("flex flex-col gap-2", turn.tone === "error" && "text-destructive")}>
          <AIResponse text={turn.text} />
          {turn.provider && turn.model ? (
            <span className="text-muted-foreground text-[0.68rem]">{turn.provider === "openai" ? "OpenAI" : "Gemini"} · {turn.model}</span>
          ) : null}
        </div>
      </AIMessage>
    </div>
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
