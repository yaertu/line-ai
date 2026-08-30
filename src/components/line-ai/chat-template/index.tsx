"use client";

import { cn } from "@/lib/utils";
import {
  clearCloudHistory,
  type CloudConnectionState,
  loadCloudHistory,
  mergeConversationHistories,
  readCloudStatus,
  removeCloudConversation,
  saveCloudConversation,
} from "@/lib/cloud-history";
import { Undo2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AppPreferences,
  type ChatConversation,
  type ChatTurn,
  CONVERSATIONS,
  DEFAULT_PREFERENCES,
  type PromptExecutor,
} from "./chat-data";
import ChatSidebar from "./chat-sidebar";
import ChatThread from "./chat-thread";
import CommandPalette from "./command-palette";
import SettingsPanel from "./settings-panel";

const CHAT_STORE_KEY = "line-ai.conversations.v1";
const PREFERENCES_STORE_KEY = "line-ai.preferences.v1";
const SIDEBAR_WIDTH_STORE_KEY = "line-ai.sidebar-width.v1";
const DRAWER_SPRING = { bounce: 0, duration: 0.3, type: "spring" as const };
const SCRIM_FADE = { duration: 0.2 };

const createConversationId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

const loadSidebarWidth = () => {
  const raw = localStorage.getItem(SIDEBAR_WIDTH_STORE_KEY);
  if (raw === null) return 272;
  const stored = Number(raw);
  return Number.isFinite(stored) ? Math.min(400, Math.max(240, stored)) : 272;
};

const isStoredTurn = (value: unknown): value is ChatTurn => {
  if (!value || typeof value !== "object") return false;
  const turn = value as Partial<ChatTurn>;
  return (
    (turn.from === "user" || turn.from === "assistant") &&
    typeof turn.id === "string" &&
    typeof turn.text === "string" &&
    typeof turn.timestamp === "string"
  );
};

const loadConversations = (fallback: ChatConversation[]) => {
  try {
    const stored = localStorage.getItem(CHAT_STORE_KEY);
    const parsed: unknown = JSON.parse(stored ?? "null");
    if (!Array.isArray(parsed)) return fallback;
    return parsed
      .filter((value): value is ChatConversation => {
        if (!value || typeof value !== "object") return false;
        const conversation = value as Partial<ChatConversation>;
        return (
          typeof conversation.id === "string" &&
          typeof conversation.title === "string" &&
          Array.isArray(conversation.turns) &&
          conversation.turns.every(isStoredTurn)
        );
      })
      .slice(0, 100)
      .map((conversation) => ({
        ...conversation,
        pinned: conversation.pinned === true,
        title: conversation.title.slice(0, 80),
        turns: conversation.turns.slice(-500),
        updatedAt:
          typeof conversation.updatedAt === "string" && !Number.isNaN(Date.parse(conversation.updatedAt))
            ? conversation.updatedAt
            : nowIso(),
      }))
      .sort((left, right) =>
        Number(right.pinned === true) - Number(left.pinned === true) ||
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      );
  } catch {
    return fallback;
  }
};

const loadPreferences = (): AppPreferences => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFERENCES_STORE_KEY) ?? "null") as Partial<AppPreferences> | null;
    if (!parsed) {
      const previewTheme = new URLSearchParams(window.location.search).get("theme");
      return previewTheme === "light" || previewTheme === "dark"
        ? { ...DEFAULT_PREFERENCES, theme: previewTheme }
        : DEFAULT_PREFERENCES;
    }
    return {
      provider: ["auto", "openai", "gemini"].includes(parsed.provider ?? "") ? parsed.provider as AppPreferences["provider"] : DEFAULT_PREFERENCES.provider,
      reasoning: ["low", "medium", "high"].includes(parsed.reasoning ?? "") ? parsed.reasoning as AppPreferences["reasoning"] : DEFAULT_PREFERENCES.reasoning,
      theme: ["system", "light", "dark"].includes(parsed.theme ?? "") ? parsed.theme as AppPreferences["theme"] : DEFAULT_PREFERENCES.theme,
      truthMode: typeof parsed.truthMode === "boolean" ? parsed.truthMode : DEFAULT_PREFERENCES.truthMode,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
};

const titleFromTurn = (turn: ChatTurn) => {
  const compact = turn.text.replace(/\s+/g, " ").trim();
  if (turn.from === "assistant") return "Truth Mode";
  return compact.length > 48 ? `${compact.slice(0, 48).trimEnd()}…` : compact;
};

export type ChatTemplateProps = {
  className?: string;
  conversations?: ChatConversation[];
  defaultConversationId?: string;
  executePrompt: PromptExecutor;
};

const ChatTemplate = ({
  className,
  conversations = CONVERSATIONS,
  defaultConversationId,
  executePrompt,
}: ChatTemplateProps) => {
  const [conversationItems, setConversationItems] = useState(() =>
    loadConversations(conversations)
  );
  const [activeId, setActiveId] = useState(
    () => defaultConversationId ?? conversationItems[0]?.id ?? createConversationId()
  );
  const [newChatVersion, setNewChatVersion] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
  const [deletedConversation, setDeletedConversation] = useState<{
    conversation: ChatConversation;
    index: number;
  } | null>(null);
  const [preferences, setPreferences] = useState(loadPreferences);
  const [cloudState, setCloudState] = useState<CloudConnectionState>("connecting");
  const [cloudMessage, setCloudMessage] = useState("Line AI Cloud bağlantısı hazırlanıyor.");
  const shouldReduceMotion = useReducedMotion();
  const conversationItemsRef = useRef(conversationItems);
  const cloudHydratedRef = useRef(false);
  const hydrateStartedRef = useRef(false);
  const lastSyncedRef = useRef(new Map<string, string>());
  const pendingClearRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const syncRequestedRef = useRef(false);

  useEffect(() => {
    conversationItemsRef.current = conversationItems;
  }, [conversationItems]);

  const runCloudSync = useCallback(async () => {
    if (!cloudHydratedRef.current) return;
    if (syncInFlightRef.current) {
      syncRequestedRef.current = true;
      return;
    }

    syncInFlightRef.current = true;
    try {
      do {
        syncRequestedRef.current = false;
        const snapshot = conversationItemsRef.current;
        const nextMap = new Map(
          snapshot.map((conversation) => [conversation.id, JSON.stringify(conversation)]),
        );

        if (pendingClearRef.current) {
          await clearCloudHistory();
          pendingClearRef.current = false;
          lastSyncedRef.current = new Map();
        } else {
          const deletedIds = [...lastSyncedRef.current.keys()].filter(
            (id) => !nextMap.has(id),
          );
          await Promise.all(
            deletedIds.map((id) => removeCloudConversation(id)),
          );
        }

        const changed = snapshot.filter(
          (conversation) =>
            lastSyncedRef.current.get(conversation.id) !==
            nextMap.get(conversation.id),
        );
        await Promise.all(
          changed.map((conversation) => saveCloudConversation(conversation)),
        );
        lastSyncedRef.current = nextMap;
        setCloudState("connected");
        setCloudMessage("Sohbet geçmişi Line AI Cloud ile eşitlendi.");
      } while (syncRequestedRef.current);
    } catch (error) {
      setCloudState("unsynced");
      setCloudMessage(
        error instanceof Error
          ? error.message
          : "Bulut senkronizasyonu tamamlanamadı; açık oturum bellekte korunuyor.",
      );
    } finally {
      syncInFlightRef.current = false;
    }
  }, []);

  const hydrateCloud = useCallback(async () => {
    if (hydrateStartedRef.current) return;
    hydrateStartedRef.current = true;
    setCloudState("connecting");
    setCloudMessage("Line AI Cloud bağlantısı hazırlanıyor.");

    try {
      const remote = await loadCloudHistory();
      const merged = mergeConversationHistories(
        remote.conversations,
        conversationItemsRef.current,
      );
      const remoteMap = new Map(
        remote.conversations.map((conversation) => [
          conversation.id,
          JSON.stringify(conversation),
        ]),
      );
      const migrations = merged.filter(
        (conversation) =>
          remoteMap.get(conversation.id) !== JSON.stringify(conversation),
      );
      await Promise.all(
        migrations.map((conversation) => saveCloudConversation(conversation)),
      );

      const status = await readCloudStatus().catch(() => null);
      lastSyncedRef.current = new Map(
        merged.map((conversation) => [conversation.id, JSON.stringify(conversation)]),
      );
      cloudHydratedRef.current = true;
      setConversationItems(merged);
      localStorage.removeItem(CHAT_STORE_KEY);
      setCloudState("connected");
      setCloudMessage(
        status?.message ??
          `Sohbet geçmişi ${remote.endpoint || "Line AI Cloud"} ile eşitlendi.`,
      );
    } catch (error) {
      hydrateStartedRef.current = false;
      setCloudState("offline");
      setCloudMessage(
        error instanceof Error
          ? error.message
          : "Line AI Cloud erişilemiyor; açık oturum bellekte çalışmaya devam ediyor.",
      );
    }
  }, []);

  const retryCloud = useCallback(() => {
    if (!cloudHydratedRef.current) {
      void hydrateCloud();
      return;
    }
    setCloudState("connecting");
    syncRequestedRef.current = true;
    void runCloudSync();
  }, [hydrateCloud, runCloudSync]);

  useEffect(() => {
    void hydrateCloud();
  }, [hydrateCloud]);

  useEffect(() => {
    if (!cloudHydratedRef.current) return;
    syncRequestedRef.current = true;
    const timer = window.setTimeout(() => void runCloudSync(), 250);
    return () => window.clearTimeout(timer);
  }, [conversationItems, runCloudSync]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_STORE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    if (!deletedConversation) return;
    const timer = window.setTimeout(() => setDeletedConversation(null), 5000);
    return () => window.clearTimeout(timer);
  }, [deletedConversation]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFERENCES_STORE_KEY, JSON.stringify(preferences));
    } catch {
      // The in-memory preferences still apply for the current session.
    }

    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const dark = preferences.theme === "dark" || (preferences.theme === "system" && media?.matches === true);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
    };
    applyTheme();
    if (preferences.theme !== "system") return;
    media?.addEventListener("change", applyTheme);
    return () => media?.removeEventListener("change", applyTheme);
  }, [preferences]);

  const open = useCallback((id: string) => {
    setActiveId(id);
    setIsDrawerOpen(false);
  }, []);

  const newChat = useCallback(() => {
    setActiveId(createConversationId());
    setNewChatVersion((version) => version + 1);
    setIsDrawerOpen(false);
  }, []);

  const renameConversation = (id: string, title: string) => {
    const normalizedTitle = title.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!normalizedTitle) return;
    setConversationItems((current) =>
      current.map((conversation) =>
        conversation.id === id ? { ...conversation, title: normalizedTitle } : conversation
      )
    );
  };

  const togglePinnedConversation = (id: string) => {
    setConversationItems((current) =>
      current
        .map((conversation) =>
          conversation.id === id ? { ...conversation, pinned: !conversation.pinned } : conversation
        )
        .sort((left, right) =>
          Number(right.pinned === true) - Number(left.pinned === true) ||
          Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
        )
    );
  };

  const deleteConversation = (id: string) => {
    const deletedIndex = conversationItems.findIndex((conversation) => conversation.id === id);
    const deleted = conversationItems[deletedIndex];
    if (!deleted) return;
    const remaining = conversationItems.filter((conversation) => conversation.id !== id);
    setConversationItems(remaining);
    setDeletedConversation({ conversation: deleted, index: deletedIndex });
    if (activeId === id) {
      setActiveId(remaining[0]?.id ?? createConversationId());
      setNewChatVersion((version) => version + 1);
    }
    setIsDrawerOpen(false);
  };

  const appendTurn = (turn: ChatTurn) => {
    setConversationItems((current) => {
      const existingIndex = current.findIndex((conversation) => conversation.id === activeId);
      const updatedAt = nowIso();
      if (existingIndex === -1) {
        return [
          {
            id: activeId,
            title: titleFromTurn(turn),
            turns: [turn],
            updatedAt,
          },
          ...current,
        ];
      }
      const existing = current[existingIndex];
      if (!existing) return current;
      return [
        { ...existing, turns: [...existing.turns, turn], updatedAt },
        ...current.filter((_, index) => index !== existingIndex),
      ];
    });
  };

  const deleteTurn = (turnId: string) => {
    setConversationItems((current) =>
      current.map((conversation) =>
        conversation.id === activeId
          ? { ...conversation, turns: conversation.turns.filter((turn) => turn.id !== turnId) }
          : conversation
      )
    );
  };

  const clearHistory = () => {
    pendingClearRef.current = true;
    setConversationItems([]);
    setDeletedConversation(null);
    setActiveId(createConversationId());
    setNewChatVersion((version) => version + 1);
  };

  const restoreDeletedConversation = () => {
    if (!deletedConversation) return;
    setConversationItems((current) => {
      if (current.some((conversation) => conversation.id === deletedConversation.conversation.id)) return current;
      const restored = [...current];
      restored.splice(Math.min(deletedConversation.index, restored.length), 0, deletedConversation.conversation);
      return restored;
    });
    setDeletedConversation(null);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLocaleLowerCase("tr-TR");
      if (key === "k") {
        event.preventDefault();
        setIsCommandPaletteOpen(true);
      }
      if (key === "n") {
        event.preventDefault();
        newChat();
      }
      if (event.key === ",") {
        event.preventDefault();
        setIsSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [newChat]);

  const active = conversationItems.find((conversation) => conversation.id === activeId);

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 w-full overflow-hidden bg-background text-foreground",
        className
      )}
      data-registry="line-ai/chat-workspace"
      data-testid="line-ai-chat-workspace"
    >
      <ChatSidebar
        activeId={activeId}
        className="hidden md:flex"
        collapsed={!isSidebarOpen}
        conversations={conversationItems}
        onDelete={deleteConversation}
        onNewChat={newChat}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRename={renameConversation}
        onSelect={open}
        onTogglePin={togglePinnedConversation}
        onToggleCollapsed={() => setIsSidebarOpen((isOpen) => !isOpen)}
        onWidthChange={setSidebarWidth}
        provider={preferences.provider}
        width={sidebarWidth}
        truthMode={preferences.truthMode}
      />

      <AnimatePresence>
        {isDrawerOpen ? (
          <>
            <motion.button
              animate={{ opacity: 1 }}
              aria-label="Sohbet listesini kapat"
              className="absolute inset-0 z-20 cursor-default bg-foreground/20 md:hidden"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key="chat-drawer-scrim"
              onClick={() => setIsDrawerOpen(false)}
              transition={shouldReduceMotion ? { duration: 0 } : SCRIM_FADE}
              type="button"
            />
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="absolute inset-y-0 left-0 z-30 flex md:hidden"
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: "-100%" }}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 1, x: "-100%" }}
              key="chat-drawer-panel"
              transition={shouldReduceMotion ? SCRIM_FADE : DRAWER_SPRING}
            >
              <ChatSidebar
                activeId={activeId}
                className="h-full bg-background shadow-black/10 shadow-xl"
                conversations={conversationItems}
                onDelete={deleteConversation}
                onNewChat={newChat}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onRename={renameConversation}
                onSelect={open}
                onTogglePin={togglePinnedConversation}
                onToggleCollapsed={() => setIsDrawerOpen(false)}
                provider={preferences.provider}
                truthMode={preferences.truthMode}
              />
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <ChatThread
        executePrompt={executePrompt}
        key={`${activeId}-${newChatVersion}`}
        onAppendTurn={appendTurn}
        onDeleteTurn={deleteTurn}
        onOpenSidebar={() => setIsDrawerOpen(true)}
        onProviderChange={(provider) => setPreferences((current) => ({ ...current, provider }))}
        onReasoningChange={(reasoning) => setPreferences((current) => ({ ...current, reasoning }))}
        onTruthModeChange={(truthMode) => setPreferences((current) => ({ ...current, truthMode }))}
        provider={preferences.provider}
        reasoning={preferences.reasoning}
        title={active?.title ?? "Yeni sohbet"}
        truthMode={preferences.truthMode}
        turns={active?.turns ?? []}
      />

      {isSettingsOpen ? (
        <SettingsPanel
          cloudMessage={cloudMessage}
          cloudState={cloudState}
          conversationCount={conversationItems.length}
          messageCount={conversationItems.reduce((total, conversation) => total + conversation.turns.length, 0)}
          onChange={setPreferences}
          onClearHistory={clearHistory}
          onClose={() => setIsSettingsOpen(false)}
          onRetryCloud={retryCloud}
          preferences={preferences}
        />
      ) : null}

      <AnimatePresence>
        {isCommandPaletteOpen ? (
          <CommandPalette
            conversations={conversationItems}
            key="line-ai-command-palette"
            onClose={() => setIsCommandPaletteOpen(false)}
            onNewChat={newChat}
            onOpenConversation={open}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onPreferencesChange={setPreferences}
            preferences={preferences}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {deletedConversation ? (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            aria-live="polite"
            className="fixed bottom-5 left-1/2 z-[65] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-border/80 bg-popover text-popover-foreground shadow-2xl shadow-black/20"
            exit={{ opacity: 0, y: 8 }}
            initial={{ opacity: 0, y: 8 }}
            role="status"
            transition={shouldReduceMotion ? { duration: 0 } : { bounce: 0, duration: 0.22, type: "spring" }}
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-sm">Sohbet silindi</span>
                <span className="block truncate text-muted-foreground text-xs">{deletedConversation.conversation.title}</span>
              </span>
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary/12 px-2.5 py-1.5 font-medium text-primary text-xs hover:bg-primary/20" onClick={restoreDeletedConversation} type="button">
                <Undo2 aria-hidden="true" size={14} /> Geri al
              </button>
              <button aria-label="Bildirimi kapat" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setDeletedConversation(null)} type="button"><X aria-hidden="true" size={14} /></button>
            </div>
            <motion.span
              animate={{ scaleX: 0 }}
              className="block h-0.5 origin-left bg-primary"
              initial={{ scaleX: 1 }}
              transition={{ duration: shouldReduceMotion ? 0 : 5, ease: "linear" }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default ChatTemplate;
export type { ChatConversation, ChatTurn } from "./chat-data";
