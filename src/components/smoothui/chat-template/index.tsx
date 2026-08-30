"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import {
  type ChatConversation,
  type ChatTurn,
  CONVERSATIONS,
  type PromptExecutor,
} from "./chat-data";
import ChatSidebar from "./chat-sidebar";
import ChatThread from "./chat-thread";

const CHAT_STORE_KEY = "line-cli.conversations.v1";
const DRAWER_SPRING = { bounce: 0, duration: 0.3, type: "spring" as const };
const SCRIM_FADE = { duration: 0.2 };

const createConversationId = () => crypto.randomUUID();

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
    const parsed: unknown = JSON.parse(localStorage.getItem(CHAT_STORE_KEY) ?? "null");
    if (!Array.isArray(parsed)) return fallback;
    return parsed
      .filter((value): value is ChatConversation => {
        if (!value || typeof value !== "object") return false;
        const conversation = value as Partial<ChatConversation>;
        return (
          typeof conversation.id === "string" &&
          typeof conversation.title === "string" &&
          typeof conversation.group === "string" &&
          Array.isArray(conversation.turns) &&
          conversation.turns.every(isStoredTurn)
        );
      })
      .slice(0, 100)
      .map((conversation) => ({
        ...conversation,
        title: conversation.title.slice(0, 80),
        turns: conversation.turns.slice(-500),
      }));
  } catch {
    return fallback;
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
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    localStorage.setItem(CHAT_STORE_KEY, JSON.stringify(conversationItems));
  }, [conversationItems]);

  const open = (id: string) => {
    setActiveId(id);
    setIsDrawerOpen(false);
  };

  const newChat = () => {
    setActiveId(createConversationId());
    setNewChatVersion((version) => version + 1);
    setIsDrawerOpen(false);
  };

  const renameConversation = (id: string, title: string) => {
    const normalizedTitle = title.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!normalizedTitle) return;
    setConversationItems((current) =>
      current.map((conversation) =>
        conversation.id === id ? { ...conversation, title: normalizedTitle } : conversation
      )
    );
  };

  const deleteConversation = (id: string) => {
    const remaining = conversationItems.filter((conversation) => conversation.id !== id);
    setConversationItems(remaining);
    if (activeId === id) {
      setActiveId(remaining[0]?.id ?? createConversationId());
      setNewChatVersion((version) => version + 1);
    }
    setIsDrawerOpen(false);
  };

  const appendTurn = (turn: ChatTurn) => {
    setConversationItems((current) => {
      const existingIndex = current.findIndex((conversation) => conversation.id === activeId);
      if (existingIndex === -1) {
        return [
          {
            group: "Bugün",
            id: activeId,
            title: titleFromTurn(turn),
            turns: [turn],
          },
          ...current,
        ];
      }
      return current.map((conversation, index) =>
        index === existingIndex
          ? { ...conversation, turns: [...conversation.turns, turn] }
          : conversation
      );
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

  const active = conversationItems.find((conversation) => conversation.id === activeId);

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 w-full overflow-hidden bg-background text-foreground",
        className
      )}
      data-registry="smoothui.dev/chat-template"
      data-testid="smoothui-chat-template"
    >
      <ChatSidebar
        activeId={activeId}
        className="hidden md:flex"
        collapsed={!isSidebarOpen}
        conversations={conversationItems}
        onDelete={deleteConversation}
        onNewChat={newChat}
        onRename={renameConversation}
        onSelect={open}
        onToggleCollapsed={() => setIsSidebarOpen((isOpen) => !isOpen)}
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
                onRename={renameConversation}
                onSelect={open}
                onToggleCollapsed={() => setIsDrawerOpen(false)}
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
        title={active?.title ?? "Yeni sohbet"}
        turns={active?.turns ?? []}
      />
    </div>
  );
};

export default ChatTemplate;
export type { ChatConversation, ChatTurn } from "./chat-data";
