"use client";

import { cn } from "@/lib/utils";
import {
  Bot,
  BrainCircuit,
  Check,
  MessageSquarePlus,
  MessageSquareText,
  Moon,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AppPreferences,
  ChatConversation,
  ProviderChoice,
  ReasoningLevel,
  ThemeChoice,
} from "./chat-data";

type PaletteItem = {
  action: () => void;
  category: "Sohbetler" | "Hızlı işlemler" | "Yapay zekâ";
  description: string;
  icon: React.ReactNode;
  id: string;
  keywords: string;
  label: string;
  selected?: boolean;
  shortcut?: string;
};

export type CommandPaletteProps = {
  conversations: ChatConversation[];
  onClose: () => void;
  onNewChat: () => void;
  onOpenConversation: (id: string) => void;
  onOpenSettings: () => void;
  onPreferencesChange: (preferences: AppPreferences) => void;
  preferences: AppPreferences;
};

const normalize = (value: string) =>
  value.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();

const nextTheme = (theme: ThemeChoice): ThemeChoice => {
  if (theme === "system") return "light";
  if (theme === "light") return "dark";
  return "system";
};

const providerLabels: Record<ProviderChoice, string> = {
  auto: "Otomatik",
  gemini: "Gemini",
  openai: "OpenAI",
};

const reasoningLabels: Record<ReasoningLevel, string> = {
  high: "Derin",
  low: "Hızlı",
  medium: "Dengeli",
};

export const CommandPalette = ({
  conversations,
  onClose,
  onNewChat,
  onOpenConversation,
  onOpenSettings,
  onPreferencesChange,
  preferences,
}: CommandPaletteProps) => {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const items = useMemo<PaletteItem[]>(() => {
    const closeAfter = (action: () => void) => () => {
      action();
      onClose();
    };
    const actions: PaletteItem[] = [
      {
        action: closeAfter(onNewChat),
        category: "Hızlı işlemler",
        description: "Boş bir sohbet başlat",
        icon: <MessageSquarePlus aria-hidden="true" size={17} />,
        id: "new-chat",
        keywords: "yeni sohbet oluştur başlat",
        label: "Yeni sohbet",
        shortcut: "Ctrl N",
      },
      {
        action: closeAfter(onOpenSettings),
        category: "Hızlı işlemler",
        description: "Uygulama ve sağlayıcı tercihlerini aç",
        icon: <Settings2 aria-hidden="true" size={17} />,
        id: "settings",
        keywords: "ayarlar tercihler görünüm sağlayıcı",
        label: "Ayarları aç",
        shortcut: "Ctrl ,",
      },
      {
        action: closeAfter(() => onPreferencesChange({ ...preferences, theme: nextTheme(preferences.theme) })),
        category: "Hızlı işlemler",
        description: `Şu an: ${preferences.theme === "system" ? "Sistem" : preferences.theme === "dark" ? "Koyu" : "Açık"}`,
        icon: preferences.theme === "dark" ? <Moon aria-hidden="true" size={17} /> : <Sun aria-hidden="true" size={17} />,
        id: "theme",
        keywords: "tema gece gündüz koyu açık sistem görünüm",
        label: "Temayı değiştir",
      },
      {
        action: closeAfter(() => onPreferencesChange({ ...preferences, truthMode: !preferences.truthMode })),
        category: "Yapay zekâ",
        description: preferences.truthMode ? "Açık; kapatmak için seç" : "Kapalı; açmak için seç",
        icon: <ShieldCheck aria-hidden="true" size={17} />,
        id: "truth-mode",
        keywords: "truth doğruluk gerçeklik",
        label: "Truth Mode",
        selected: preferences.truthMode,
      },
      ...(["auto", "openai", "gemini"] as ProviderChoice[]).map((provider) => ({
        action: closeAfter(() => onPreferencesChange({ ...preferences, provider })),
        category: "Yapay zekâ" as const,
        description: provider === "auto" ? "Uygun sağlayıcıyı otomatik seç" : `${providerLabels[provider]} sağlayıcısını kullan`,
        icon: <Bot aria-hidden="true" size={17} />,
        id: `provider-${provider}`,
        keywords: `sağlayıcı model ${providerLabels[provider]}`,
        label: `Sağlayıcı: ${providerLabels[provider]}`,
        selected: preferences.provider === provider,
      })),
      ...(["low", "medium", "high"] as ReasoningLevel[]).map((reasoning) => ({
        action: closeAfter(() => onPreferencesChange({ ...preferences, reasoning })),
        category: "Yapay zekâ" as const,
        description: `${reasoningLabels[reasoning]} akıl yürütme düzeyi`,
        icon: <BrainCircuit aria-hidden="true" size={17} />,
        id: `reasoning-${reasoning}`,
        keywords: `akıl yürütme düşünme ${reasoningLabels[reasoning]}`,
        label: `Akıl yürütme: ${reasoningLabels[reasoning]}`,
        selected: preferences.reasoning === reasoning,
      })),
    ];
    const history: PaletteItem[] = conversations.map((conversation) => ({
      action: closeAfter(() => onOpenConversation(conversation.id)),
      category: "Sohbetler",
      description: new Date(conversation.updatedAt).toLocaleString("tr-TR", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
      icon: <MessageSquareText aria-hidden="true" size={17} />,
      id: `conversation-${conversation.id}`,
      keywords: `sohbet geçmiş ${conversation.title}`,
      label: conversation.title,
    }));
    return [...actions, ...history];
  }, [conversations, onClose, onNewChat, onOpenConversation, onOpenSettings, onPreferencesChange, preferences]);

  const filteredItems = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return items.slice(0, 12);
    return items
      .filter((item) => normalize(`${item.label} ${item.description} ${item.keywords}`).includes(needle))
      .slice(0, 20);
  }, [items, query]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const choose = (item?: PaletteItem) => item?.action();

  return (
    <div aria-label="Hızlı arama ve komutlar" aria-modal="true" className="fixed inset-0 z-[70] flex items-start justify-center px-3 pt-[10vh] sm:pt-[14vh]" role="dialog">
      <motion.button
        animate={{ opacity: 1 }}
        aria-label="Hızlı aramayı kapat"
        className="absolute inset-0 cursor-default bg-foreground/25 backdrop-blur-[2px]"
        exit={{ opacity: 0 }}
        initial={{ opacity: 0 }}
        onClick={onClose}
        transition={{ duration: shouldReduceMotion ? 0 : 0.16 }}
        type="button"
      />
      <motion.div
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border/80 bg-popover text-popover-foreground shadow-2xl shadow-black/25"
        exit={{ opacity: 0, scale: 0.985, y: -6 }}
        initial={{ opacity: 0, scale: 0.985, y: -6 }}
        transition={shouldReduceMotion ? { duration: 0 } : { bounce: 0, duration: 0.2, type: "spring" }}
      >
        <label className="flex items-center gap-3 border-border/70 border-b px-4 py-3.5">
          <Search aria-hidden="true" className="shrink-0 text-muted-foreground" size={19} />
          <span className="sr-only">Sohbet veya işlem ara</span>
          <input
            aria-controls="line-ai-command-results"
            aria-expanded="true"
            aria-haspopup="listbox"
            aria-label="Sohbet veya işlem ara"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((current) => Math.min(filteredItems.length - 1, current + 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((current) => Math.max(0, current - 1));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                choose(filteredItems[activeIndex]);
              }
            }}
            placeholder="Sohbetlerde ve işlemlerde ara…"
            ref={inputRef}
            role="combobox"
            value={query}
          />
          <kbd className="rounded-lg border border-border bg-muted px-2 py-1 font-medium text-[0.65rem] text-muted-foreground">Esc</kbd>
        </label>

        <div className="max-h-[min(58vh,32rem)] overflow-y-auto p-2" id="line-ai-command-results" role="listbox">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Search aria-hidden="true" className="mx-auto mb-2 text-muted-foreground" size={22} />
              <p className="font-medium text-sm">Eşleşme bulunamadı</p>
              <p className="mt-1 text-muted-foreground text-xs">Başka bir sohbet başlığı veya işlem yazın.</p>
            </div>
          ) : null}
          {filteredItems.map((item, index) => {
            const previous = filteredItems[index - 1];
            const showCategory = !previous || previous.category !== item.category;
            return (
              <div key={item.id}>
                {showCategory ? <p className="px-3 pt-2 pb-1 font-semibold text-[0.66rem] text-muted-foreground uppercase tracking-wider">{item.category}</p> : null}
                <button
                  aria-selected={activeIndex === index}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                    activeIndex === index ? "bg-primary/12 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  onClick={() => choose(item)}
                  onMouseEnter={() => setActiveIndex(index)}
                  role="option"
                  type="button"
                >
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted", activeIndex === index && "bg-primary/15 text-primary")}>{item.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-sm">{item.label}</span>
                    <span className="block truncate text-[0.7rem] text-muted-foreground">{item.description}</span>
                  </span>
                  {item.selected ? <Check aria-label="Seçili" className="text-primary" size={16} /> : null}
                  {item.shortcut ? <kbd className="rounded-md border border-border bg-background px-1.5 py-0.5 font-medium text-[0.62rem] text-muted-foreground">{item.shortcut}</kbd> : null}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-border/70 border-t bg-muted/35 px-4 py-2 text-[0.65rem] text-muted-foreground">
          <span>↑↓ gezin · Enter seç · Esc kapat</span>
          <span>Line AI masaüstü komut merkezi</span>
        </div>
      </motion.div>
    </div>
  );
};

export default CommandPalette;
