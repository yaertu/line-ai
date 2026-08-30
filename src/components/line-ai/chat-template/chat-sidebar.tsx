"use client";

import { cn } from "@/lib/utils";
import {
  Clock3,
  Command,
  History,
  MessageSquareText,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PROVIDERS, type ChatConversation, type ProviderChoice } from "./chat-data";

export type ChatSidebarProps = {
  activeId: string;
  className?: string;
  collapsed?: boolean;
  conversations: ChatConversation[];
  onDelete: (id: string) => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onRename: (id: string, title: string) => void;
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleCollapsed?: () => void;
  onWidthChange?: (width: number) => void;
  provider: ProviderChoice;
  width?: number;
  truthMode: boolean;
};

const LineAiMark = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    viewBox="0 0 64 64"
  >
    <path
      d="M17 13v30c0 5.5 4.5 10 10 10h20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="8"
    />
    <path
      d="m34 21 11 10-11 10"
      stroke="var(--primary)"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="7"
    />
  </svg>
);

const formatHistoryGroup = (value: string) => {
  const date = new Date(value);
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round((startToday.getTime() - startDate.getTime()) / 86_400_000);
  if (dayDifference === 0) return "Bugün";
  if (dayDifference === 1) return "Dün";
  if (dayDifference < 7) return "Son 7 gün";
  return date.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
};

const formatHistoryTime = (value: string) => {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
};

export const ChatSidebar = ({
  activeId,
  className,
  collapsed = false,
  conversations,
  onDelete,
  onNewChat,
  onOpenSettings,
  onRename,
  onSelect,
  onTogglePin,
  onToggleCollapsed,
  onWidthChange,
  provider,
  width = 272,
  truthMode,
}: ChatSidebarProps) => {
  const [query, setQuery] = useState("");
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renameTarget, setRenameTarget] = useState<ChatConversation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChatConversation | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const groups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    const matching = needle
      ? conversations.filter((conversation) =>
          conversation.title.toLocaleLowerCase("tr-TR").includes(needle)
        )
      : conversations;
    const pinned = matching.filter((conversation) => conversation.pinned);
    const regular = matching.filter((conversation) => !conversation.pinned);
    const byGroup = new Map<string, ChatConversation[]>();
    for (const conversation of regular) {
      const group = formatHistoryGroup(conversation.updatedAt);
      const bucket = byGroup.get(group) ?? [];
      bucket.push(conversation);
      byGroup.set(group, bucket);
    }
    return [
      ...(pinned.length > 0 ? [["Sabitlenenler", pinned] as [string, ChatConversation[]]] : []),
      ...byGroup.entries(),
    ];
  }, [conversations, query]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
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
  }, [contextMenu]);

  useEffect(() => {
    if (!isResizing || !onWidthChange) return;
    const resize = (event: PointerEvent) => {
      onWidthChange(Math.min(400, Math.max(240, event.clientX)));
    };
    const stop = () => setIsResizing(false);
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stop, { once: true });
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stop);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, onWidthChange]);

  const openContextMenu = (conversation: ChatConversation, x: number, y: number) => {
    setContextMenu({
      id: conversation.id,
      x: Math.min(x, Math.max(8, window.innerWidth - 216)),
      y: Math.min(y, Math.max(8, window.innerHeight - 150)),
    });
  };

  if (collapsed) {
    return (
      <aside
        aria-label="Daraltılmış sohbet kenar çubuğu"
        className={cn(
          "flex h-full w-[4.5rem] shrink-0 flex-col items-center gap-2 border-border/60 border-r bg-muted/60 py-3",
          className
        )}
      >
        <span className="mb-1 flex size-9 items-center justify-center rounded-xl bg-primary/10 text-foreground">
          <LineAiMark className="size-6" />
        </span>
        <RailButton
          icon={<PanelLeftOpen aria-hidden="true" size={17} />}
          label="Kenar çubuğunu genişlet"
          onClick={onToggleCollapsed}
        />
        <RailButton
          icon={<Search aria-hidden="true" size={17} />}
          label="Sohbetlerde ara"
          onClick={() => {
            onToggleCollapsed?.();
            requestAnimationFrame(() => searchRef.current?.focus());
          }}
        />
        <RailButton
          icon={<Plus aria-hidden="true" size={17} />}
          label="Yeni sohbet"
          onClick={onNewChat}
        />
        <div className="mt-auto flex flex-col items-center gap-2">
          <span aria-label={`Truth Mode ${truthMode ? "açık" : "kapalı"}`} className={truthMode ? "text-primary" : "text-muted-foreground"} title={`Truth Mode ${truthMode ? "açık" : "kapalı"}`}>
            <ShieldCheck aria-hidden="true" size={17} />
          </span>
          <RailButton icon={<Settings2 aria-hidden="true" size={17} />} label="Ayarlar" onClick={onOpenSettings} />
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Sohbet kenar çubuğu"
      className={cn(
        "relative flex h-full shrink-0 flex-col gap-3 border-border/60 border-r bg-muted/60 p-3",
        className
      )}
      style={{ width }}
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="flex min-w-0 items-center gap-2.5 font-semibold text-sm">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <LineAiMark className="size-6" />
          </span>
          <span className="truncate">Line AI</span>
        </span>
        <span className="flex items-center gap-1">
          <button
            aria-label="Sohbetlerde ara"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => searchRef.current?.focus()}
            title="Sohbetlerde ara"
            type="button"
          >
            <Search aria-hidden="true" size={16} />
          </button>
          <button
            aria-label="Kenar çubuğunu daralt"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onToggleCollapsed}
            type="button"
          >
            <PanelLeftClose aria-hidden="true" size={16} />
          </button>
        </span>
      </div>

      <label className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/75 px-2.5 py-2 shadow-black/5 shadow-xs transition-colors focus-within:border-primary/45 focus-within:bg-background">
        <span className="sr-only">Sohbetlerde ara</span>
        <Search aria-hidden="true" className="shrink-0 text-muted-foreground" size={14} />
        <input
          aria-label="Sohbetlerde ara"
          className="w-full appearance-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Sohbetlerde ara"
          ref={searchRef}
          type="search"
          value={query}
        />
        <kbd className="hidden shrink-0 whitespace-nowrap rounded-md border border-border/70 bg-muted px-1.5 py-0.5 font-medium text-[0.6rem] text-muted-foreground min-[340px]:inline">Ctrl K</kbd>
      </label>

      <motion.button
        aria-label="Yeni sohbet"
        className="group relative flex items-center gap-2 overflow-hidden rounded-xl border border-primary/35 bg-primary/12 px-3 py-2.5 text-left font-medium text-sm shadow-black/5 shadow-xs transition-colors hover:border-primary/60 hover:bg-primary/18"
        onClick={onNewChat}
        transition={shouldReduceMotion ? { duration: 0 } : { bounce: 0.1, duration: 0.22, type: "spring" }}
        type="button"
        whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
      >
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-500 group-hover:translate-x-[430%]" />
        <span className="relative flex size-6 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Plus aria-hidden="true" size={14} />
        </span>
        <span className="relative">Yeni sohbet</span>
      </motion.button>

      <nav aria-label="Sohbet geçmişi" className="-mx-1 flex-1 overflow-y-auto px-1">
        {groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/80 bg-background/35 px-3 py-5 text-center">
            <History aria-hidden="true" className="mx-auto mb-2 text-muted-foreground" size={18} />
            <p className="font-medium text-sm">{query ? "Sonuç bulunamadı" : "Henüz sohbet yok"}</p>
            <p className="mt-1 text-muted-foreground text-xs">
              {query ? "Başka bir arama deneyin." : "İlk mesajınız burada yeni bir başlık açar."}
            </p>
            {!query ? (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-muted-foreground text-[0.68rem]">
                <Command aria-hidden="true" size={12} /> Komutlar için yazma alanına + girin
              </p>
            ) : null}
          </div>
        ) : null}

        {groups.map(([group, items]) => (
          <div className="mb-3" key={group}>
            <p className="px-2 pt-1 pb-1.5 font-medium text-[0.7rem] text-muted-foreground/80 uppercase tracking-wide">
              {group}
            </p>
            <ul className="flex list-none flex-col gap-0.5">
              {items.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    aria-current={conversation.id === activeId ? "page" : undefined}
                    aria-haspopup="menu"
                    aria-label={conversation.title}
                    className={cn(
                      "group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                      conversation.id === activeId
                        ? "bg-background text-foreground shadow-black/5 shadow-xs"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    onClick={() => onSelect(conversation.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openContextMenu(conversation, event.clientX, event.clientY);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                        event.preventDefault();
                        const bounds = event.currentTarget.getBoundingClientRect();
                        openContextMenu(conversation, bounds.left + 24, bounds.top + bounds.height);
                      }
                    }}
                    type="button"
                  >
                    <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
                    <time
                      aria-hidden="true"
                      className="inline-flex shrink-0 items-center gap-1 text-[0.66rem] text-muted-foreground/80 tabular-nums"
                      dateTime={conversation.updatedAt}
                      title={new Date(conversation.updatedAt).toLocaleString("tr-TR")}
                    >
                      <Clock3 aria-hidden="true" size={11} />
                      {formatHistoryTime(conversation.updatedAt)}
                    </time>
                    <MoreHorizontal
                      aria-hidden="true"
                      className="shrink-0 opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70"
                      size={14}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2 border-border/60 border-t pt-3">
        <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck aria-hidden="true" size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-xs">Truth Mode {truthMode ? "açık" : "kapalı"}</span>
          <span className="block truncate text-muted-foreground text-[0.68rem]">{PROVIDERS.find((item) => item.id === provider)?.label ?? provider} sağlayıcı yönlendirmesi</span>
        </span>
        <button aria-label="Ayarları aç" className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" onClick={onOpenSettings} title="Ayarlar" type="button"><Settings2 aria-hidden="true" size={16} /></button>
      </div>

      {contextMenu ? (
        <div
          aria-label="Sohbet işlemleri"
          className="fixed z-50 w-52 rounded-xl border border-border/70 bg-popover p-1.5 text-popover-foreground shadow-black/15 shadow-xl"
          onPointerDown={(event) => event.stopPropagation()}
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <ContextAction
            icon={<MessageSquareText aria-hidden="true" size={15} />}
            label="Sohbeti aç"
            onClick={() => {
              onSelect(contextMenu.id);
              setContextMenu(null);
            }}
          />
          <ContextAction
            icon={conversations.find((conversation) => conversation.id === contextMenu.id)?.pinned
              ? <PinOff aria-hidden="true" size={15} />
              : <Pin aria-hidden="true" size={15} />}
            label={conversations.find((conversation) => conversation.id === contextMenu.id)?.pinned
              ? "Sabitlemeyi kaldır"
              : "Sohbeti sabitle"}
            onClick={() => {
              onTogglePin(contextMenu.id);
              setContextMenu(null);
            }}
          />
          <ContextAction
            icon={<Pencil aria-hidden="true" size={15} />}
            label="Yeniden adlandır"
            onClick={() => {
              const target = conversations.find((conversation) => conversation.id === contextMenu.id);
              if (target) {
                setRenameTarget(target);
                setRenameValue(target.title);
              }
              setContextMenu(null);
            }}
          />
          <ContextAction
            destructive
            icon={<Trash2 aria-hidden="true" size={15} />}
            label="Sohbeti sil"
            onClick={() => {
              setDeleteTarget(conversations.find((conversation) => conversation.id === contextMenu.id) ?? null);
              setContextMenu(null);
            }}
          />
        </div>
      ) : null}

      {renameTarget ? (
        <DialogShell onClose={() => setRenameTarget(null)} title="Sohbeti yeniden adlandır">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!renameValue.trim()) return;
              onRename(renameTarget.id, renameValue);
              setRenameTarget(null);
            }}
          >
            <label className="block font-medium text-xs" htmlFor="conversation-title">Sohbet başlığı</label>
            <input
              autoFocus
              className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              id="conversation-title"
              maxLength={80}
              onChange={(event) => setRenameValue(event.target.value)}
              value={renameValue}
            />
            <div className="mt-4 flex justify-end gap-2">
              <DialogButton label="Vazgeç" onClick={() => setRenameTarget(null)} />
              <DialogButton label="Kaydet" primary submit />
            </div>
          </form>
        </DialogShell>
      ) : null}

      {deleteTarget ? (
        <DialogShell onClose={() => setDeleteTarget(null)} title="Sohbet silinsin mi?">
          <p className="text-muted-foreground text-sm">
            “{deleteTarget.title}” ve içindeki mesajlar bu cihazdan silinecek. İşlemi kısa süre içinde geri alabilirsiniz.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <DialogButton label="Vazgeç" onClick={() => setDeleteTarget(null)} />
            <DialogButton
              destructive
              label="Sohbeti sil"
              onClick={() => {
                onDelete(deleteTarget.id);
                setDeleteTarget(null);
              }}
            />
          </div>
        </DialogShell>
      ) : null}

      {onWidthChange ? (
        <div
          aria-label="Kenar çubuğu genişliğini ayarla"
          aria-orientation="vertical"
          aria-valuemax={400}
          aria-valuemin={240}
          aria-valuenow={width}
          className="group absolute inset-y-0 -right-1 z-10 hidden w-2 cursor-col-resize items-center justify-center outline-none md:flex"
          onDoubleClick={() => onWidthChange(272)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              onWidthChange(Math.max(240, width - 16));
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              onWidthChange(Math.min(400, width + 16));
            }
            if (event.key === "Home") onWidthChange(240);
            if (event.key === "End") onWidthChange(400);
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            setIsResizing(true);
          }}
          role="separator"
          tabIndex={0}
          title="Sürükleyerek yeniden boyutlandır; çift tıklayarak sıfırla"
        >
          <span className={cn("h-12 w-0.5 rounded-full bg-border transition-colors group-hover:bg-primary group-focus-visible:bg-primary", isResizing && "bg-primary")} />
        </div>
      ) : null}
    </aside>
  );
};

const ContextAction = ({
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

const DialogShell = ({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/25 p-4 backdrop-blur-[2px]" role="presentation">
    <div aria-label={title} aria-modal="true" className="w-full max-w-sm rounded-2xl border border-border bg-background p-5 shadow-black/20 shadow-2xl" role="dialog">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold text-base">{title}</h2>
        <button aria-label="Pencereyi kapat" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" onClick={onClose} type="button">
          <X aria-hidden="true" size={16} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const DialogButton = ({
  destructive = false,
  label,
  onClick,
  primary = false,
  submit = false,
}: {
  destructive?: boolean;
  label: string;
  onClick?: () => void;
  primary?: boolean;
  submit?: boolean;
}) => (
  <button
    className={cn(
      "rounded-xl border border-border px-3 py-2 font-medium text-sm transition-colors hover:bg-muted",
      primary && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
      destructive && "border-destructive/30 bg-destructive text-destructive-foreground hover:bg-destructive/90"
    )}
    onClick={onClick}
    type={submit ? "submit" : "button"}
  >
    {label}
  </button>
);

const RailButton = ({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) => (
  <button
    aria-label={label}
    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    onClick={onClick}
    title={label}
    type="button"
  >
    {icon}
  </button>
);

export default ChatSidebar;
