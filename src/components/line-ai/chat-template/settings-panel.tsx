"use client";

import { cn } from "@/lib/utils";
import { readDesktopProviderStatus } from "@/lib/ai";
import type { CloudConnectionState } from "@/lib/cloud-history";
import {
  BrainCircuit,
  Check,
  Cloud,
  CloudOff,
  Info,
  Laptop,
  Moon,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import {
  type AppPreferences,
  type ProviderChoice,
  type ProviderStatus,
  PROVIDERS,
  type ReasoningLevel,
  type ThemeChoice,
} from "./chat-data";

type SettingsSection = "general" | "ai" | "appearance" | "data" | "about";

export type SettingsPanelProps = {
  cloudMessage: string;
  cloudState: CloudConnectionState;
  conversationCount: number;
  messageCount: number;
  onChange: (preferences: AppPreferences) => void;
  onClearHistory: () => void;
  onClose: () => void;
  onRetryCloud: () => void;
  preferences: AppPreferences;
};

const SECTIONS = [
  { icon: Sparkles, id: "general", label: "Genel" },
  { icon: BrainCircuit, id: "ai", label: "Yapay zekâ" },
  { icon: Palette, id: "appearance", label: "Görünüm" },
  { icon: Cloud, id: "data", label: "Bulut verileri" },
  { icon: Info, id: "about", label: "Hakkında" },
] as const;

const EMPTY_STATUS: ProviderStatus = {
  geminiConfigured: false,
  geminiModel: "Denetleniyor",
  openAiConfigured: false,
  openAiModel: "Denetleniyor",
};

const updatePreference = <K extends keyof AppPreferences>(
  preferences: AppPreferences,
  key: K,
  value: AppPreferences[K]
) => ({ ...preferences, [key]: value });

const SettingsPanel = ({
  cloudMessage,
  cloudState,
  conversationCount,
  messageCount,
  onChange,
  onClearHistory,
  onClose,
  onRetryCloud,
  preferences,
}: SettingsPanelProps) => {
  const [section, setSection] = useState<SettingsSection>("general");
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>(EMPTY_STATUS);
  const [statusState, setStatusState] = useState<"loading" | "ready" | "error">("loading");
  const [confirmClear, setConfirmClear] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const refreshStatus = async () => {
    setStatusState("loading");
    try {
      setProviderStatus(await readDesktopProviderStatus());
      setStatusState("ready");
    } catch {
      setStatusState("error");
    }
  };

  useEffect(() => {
    let cancelled = false;
    void readDesktopProviderStatus()
      .then((status) => {
        if (cancelled) return;
        setProviderStatus(status);
        setStatusState("ready");
      })
      .catch(() => {
        if (!cancelled) setStatusState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const configuredCount = Number(providerStatus.openAiConfigured) + Number(providerStatus.geminiConfigured);
  const activeLabel = SECTIONS.find((item) => item.id === section)?.label ?? "Ayarlar";
  const cloudStateLabel = cloudState === "connected"
    ? "Bağlı"
    : cloudState === "connecting"
      ? "Bağlanıyor"
      : cloudState === "unsynced"
        ? "Senkron bekliyor"
        : "Çevrimdışı";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground/25 p-0 backdrop-blur-sm sm:p-5" role="presentation">
      <button aria-label="Ayarları kapat" className="absolute inset-0 cursor-default" onClick={onClose} type="button" />
      <motion.section
        animate={{ opacity: 1, scale: 1, y: 0 }}
        aria-label="Line AI ayarları"
        aria-modal="true"
        className="relative flex h-full max-h-[52rem] w-full max-w-5xl flex-col overflow-hidden border border-border bg-background shadow-black/25 shadow-2xl sm:h-[min(86vh,52rem)] sm:rounded-3xl"
        initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.985, y: 8 }}
        role="dialog"
        transition={shouldReduceMotion ? { duration: 0 } : { bounce: 0.05, duration: 0.25, type: "spring" }}
      >
        <header className="flex h-16 shrink-0 items-center gap-3 border-border/60 border-b px-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-base">Ayarlar</h2>
            <p className="truncate text-muted-foreground text-xs">Arayüz tercihleri bu cihazda; sohbet geçmişi Line AI Cloud’da saklanır.</p>
          </div>
          <button aria-label="Ayarları kapat" className="rounded-xl border border-border/70 p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav aria-label="Ayar bölümleri" className="flex shrink-0 gap-1 overflow-x-auto border-border/60 border-b bg-muted/35 p-2 sm:w-56 sm:flex-col sm:border-r sm:border-b-0 sm:p-3">
            {SECTIONS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  aria-current={section === item.id ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors sm:w-full",
                    section === item.id ? "bg-background text-foreground shadow-black/5 shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  type="button"
                >
                  <Icon aria-hidden="true" size={15} />{item.label}
                </button>
              );
            })}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
            <div className="mx-auto max-w-3xl">
              <div className="mb-5 flex items-end justify-between gap-3">
                <div><p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">Line AI</p><h3 className="mt-1 font-semibold text-xl">{activeLabel}</h3></div>
                {section === "ai" ? (
                  <button className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs hover:bg-muted" disabled={statusState === "loading"} onClick={() => void refreshStatus()} type="button">
                    <RefreshCw aria-hidden="true" className={statusState === "loading" ? "animate-spin" : ""} size={13} /> Yenile
                  </button>
                ) : null}
              </div>

              {section === "general" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <SummaryCard icon={<ShieldCheck size={18} />} label="Truth Mode" value={preferences.truthMode ? "Açık" : "Kapalı"} note="Belirsizlikler açıkça belirtilir." />
                  <SummaryCard icon={<BrainCircuit size={18} />} label="Akıl yürütme" value={reasoningLabel(preferences.reasoning)} note="Yeni isteklerde kullanılır." />
                  <SummaryCard icon={<Sparkles size={18} />} label="Sağlayıcı" value={providerLabel(preferences.provider)} note={`${statusState === "ready" ? configuredCount : "—"} sağlayıcı yapılandırılmış`} />
                  <SummaryCard icon={<Cloud size={18} />} label="Bulut geçmişi" value={`${conversationCount} sohbet`} note={`${messageCount} mesaj · ${cloudStateLabel}`} />
                </div>
              ) : null}

              {section === "ai" ? (
                <div className="space-y-5">
                  <SettingsGroup description="Yeni mesajın hangi sağlayıcıya gönderileceğini seçin. Otomatik seçim OpenAI başarısızsa yapılandırılmış Gemini'ye geçer." title="Sağlayıcı yönlendirme">
                    <ChoiceGrid
                      onSelect={(value) => onChange(updatePreference(preferences, "provider", value as ProviderChoice))}
                      options={PROVIDERS.map((item) => ({ id: item.id, label: item.label, note: item.note }))}
                      value={preferences.provider}
                    />
                  </SettingsGroup>
                  <SettingsGroup description="Bu tercih yalnız destekleyen model isteğine eklenir; modelin gizli düşünce zinciri gösterilmez." title="Akıl yürütme düzeyi">
                    <ChoiceGrid
                      onSelect={(value) => onChange(updatePreference(preferences, "reasoning", value as ReasoningLevel))}
                      options={[
                        { id: "low", label: "Hızlı", note: "Kısa ve doğrudan görevler" },
                        { id: "medium", label: "Dengeli", note: "Genel kullanım" },
                        { id: "high", label: "Derin", note: "Çok adımlı ve karmaşık işler" },
                      ]}
                      value={preferences.reasoning}
                    />
                  </SettingsGroup>
                  <SettingsGroup description="Yanıt, bilmediği veya doğrulayamadığı noktaları saklamaz; başarı durumları uydurulmaz." title="Doğruluk modu">
                    <ToggleRow checked={preferences.truthMode} label="Truth Mode" note="Tüm yeni sohbetlerde varsayılan olarak uygula" onChange={(value) => onChange(updatePreference(preferences, "truthMode", value))} />
                  </SettingsGroup>
                  <SettingsGroup description="Yalnız ortam değişkeninin varlığı okunur. Anahtar değeri arayüze veya yerel depoya alınmaz." title="Bağlantı durumu">
                    <ProviderRow configured={providerStatus.openAiConfigured} model={providerStatus.openAiModel} name="OpenAI" state={statusState} />
                    <ProviderRow configured={providerStatus.geminiConfigured} model={providerStatus.geminiModel} name="Gemini" state={statusState} />
                    {statusState === "error" ? <p className="px-1 pt-2 text-destructive text-xs">Masaüstü sağlayıcı durumu okunamadı.</p> : null}
                  </SettingsGroup>
                </div>
              ) : null}

              {section === "appearance" ? (
                <SettingsGroup description="Sistem teması Windows tercihini izler. Seçim anında uygulanır ve bu cihazda saklanır." title="Renk teması">
                  <ChoiceGrid
                    onSelect={(value) => onChange(updatePreference(preferences, "theme", value as ThemeChoice))}
                    options={[
                      { id: "system", label: "Sistem", note: "Windows ayarını izle", icon: <Laptop size={16} /> },
                      { id: "light", label: "Açık", note: "Aydınlık yüzey", icon: <Sun size={16} /> },
                      { id: "dark", label: "Koyu", note: "Karanlık yüzey", icon: <Moon size={16} /> },
                    ]}
                    value={preferences.theme}
                  />
                </SettingsGroup>
              ) : null}

              {section === "data" ? (
                <div className="space-y-5">
                  <SettingsGroup description="Sohbet geçmişi kurulum kimliğine bağlı Line AI Cloud alanında saklanır; erişim secret’ı Windows Credential Manager’dan arayüze taşınmaz." title="Line AI Cloud">
                    <div
                      className={cn(
                        "mb-3 flex items-start gap-3 rounded-xl border p-3",
                        cloudState === "connected"
                          ? "border-emerald-500/25 bg-emerald-500/5"
                          : cloudState === "connecting"
                            ? "border-primary/25 bg-primary/5"
                            : "border-amber-500/30 bg-amber-500/5",
                      )}
                      role="status"
                    >
                      {cloudState === "offline" || cloudState === "unsynced" ? (
                        <CloudOff aria-hidden="true" className="mt-0.5 shrink-0 text-amber-500" size={17} />
                      ) : (
                        <Cloud aria-hidden="true" className={cn("mt-0.5 shrink-0", cloudState === "connecting" ? "animate-pulse text-primary" : "text-emerald-500")} size={17} />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm">{cloudStateLabel}</p>
                        <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">{cloudMessage}</p>
                      </div>
                      {cloudState === "offline" || cloudState === "unsynced" ? (
                        <button className="shrink-0 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs hover:bg-muted" onClick={onRetryCloud} type="button">Yeniden dene</button>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Metric label="Sohbet" value={conversationCount} /><Metric label="Mesaj" value={messageCount} />
                    </div>
                  </SettingsGroup>
                  <SettingsGroup description="Bu işlem Line AI Cloud sohbet geçmişini temizler. Uygulama tercihleri, sağlayıcı anahtarları ve kurulum kimliği korunur." title="Sohbet geçmişi">
                    {confirmClear ? (
                      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                        <p className="font-medium text-sm">Tüm bulut sohbetleri silinsin mi?</p>
                        <div className="mt-3 flex gap-2"><button className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted" onClick={() => setConfirmClear(false)} type="button">Vazgeç</button><button className="rounded-lg bg-destructive px-3 py-2 text-destructive-foreground text-xs" onClick={() => { onClearHistory(); setConfirmClear(false); }} type="button">Kalıcı olarak temizle</button></div>
                      </div>
                    ) : (
                      <button className="flex items-center gap-2 rounded-xl border border-destructive/25 px-3 py-2.5 text-destructive text-sm transition-colors hover:bg-destructive/5 disabled:opacity-50" disabled={conversationCount === 0} onClick={() => setConfirmClear(true)} type="button"><Trash2 size={15} /> Tüm sohbet geçmişini temizle</button>
                    )}
                  </SettingsGroup>
                </div>
              ) : null}

              {section === "about" ? (
                <div className="space-y-4">
                  <SettingsGroup description="Windows için açık kaynak yapay zekâ çalışma alanı." title="Line AI 0.2.0">
                    <p className="text-muted-foreground text-sm leading-relaxed">OpenAI ve Gemini sağlayıcılarına doğrudan bağlanır; sohbet, dosya bağlamı, sağlayıcı yönlendirme ve çalışma durumlarını tek masaüstü arayüzünde birleştirir.</p>
                  </SettingsGroup>
                  <SettingsGroup description="Arayüz bileşenlerinin kaynak ve lisans bildirimleri dağıtımdaki THIRD_PARTY_NOTICES.md dosyasında tutulur." title="Gizlilik ve lisans">
                    <p className="text-muted-foreground text-sm leading-relaxed">Sağlayıcı anahtarları ve bulut erişim secret’ı React katmanına aktarılmaz. Her kurulum kendi kimliğiyle ayrılır; geçmiş silinebilir.</p>
                  </SettingsGroup>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </motion.section>
    </div>
  );
};

const providerLabel = (value: ProviderChoice) => PROVIDERS.find((item) => item.id === value)?.label ?? value;
const reasoningLabel = (value: ReasoningLevel) => value === "high" ? "Derin" : value === "medium" ? "Dengeli" : "Hızlı";

const SettingsGroup = ({ children, description, title }: { children: React.ReactNode; description: string; title: string }) => (
  <section className="rounded-2xl border border-border/70 bg-muted/20 p-4">
    <h4 className="font-semibold text-sm">{title}</h4><p className="mt-1 mb-4 text-muted-foreground text-xs leading-relaxed">{description}</p>{children}
  </section>
);

const SummaryCard = ({ icon, label, note, value }: { icon: React.ReactNode; label: string; note: string; value: string }) => (
  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4"><span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</span><p className="mt-4 text-muted-foreground text-xs">{label}</p><p className="mt-0.5 font-semibold text-base">{value}</p><p className="mt-1 text-muted-foreground text-xs">{note}</p></div>
);

const ChoiceGrid = ({ onSelect, options, value }: { onSelect: (id: string) => void; options: Array<{ icon?: React.ReactNode; id: string; label: string; note: string }>; value: string }) => (
  <div className="grid gap-2 sm:grid-cols-3">{options.map((option) => <button aria-pressed={option.id === value} className={cn("relative min-h-20 rounded-xl border p-3 text-left transition-colors", option.id === value ? "border-primary bg-primary/8" : "border-border bg-background hover:border-primary/35")} key={option.id} onClick={() => onSelect(option.id)} type="button"><span className="flex items-center gap-2 font-medium text-sm">{option.icon}{option.label}</span><span className="mt-1.5 block text-muted-foreground text-xs leading-relaxed">{option.note}</span>{option.id === value ? <Check className="absolute top-2.5 right-2.5 text-primary" size={14} /> : null}</button>)}</div>
);

const ToggleRow = ({ checked, label, note, onChange }: { checked: boolean; label: string; note: string; onChange: (checked: boolean) => void }) => <button aria-pressed={checked} className="flex w-full items-center gap-3 text-left" onClick={() => onChange(!checked)} type="button"><span className="min-w-0 flex-1"><span className="block font-medium text-sm">{label}</span><span className="block text-muted-foreground text-xs">{note}</span></span><span className={cn("relative h-6 w-11 rounded-full transition-colors", checked ? "bg-primary" : "bg-muted-foreground/25")}><span className={cn("absolute top-1 size-4 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-6" : "translate-x-1")} /></span></button>;

const ProviderRow = ({ configured, model, name, state }: { configured: boolean; model: string; name: string; state: "loading" | "ready" | "error" }) => <div className="flex items-center gap-3 border-border/60 border-t py-3 first:border-t-0 first:pt-0 last:pb-0"><span className={cn("size-2.5 rounded-full", state === "loading" ? "animate-pulse bg-muted-foreground" : configured ? "bg-emerald-500" : "bg-amber-500")} /><span className="min-w-0 flex-1"><span className="block font-medium text-sm">{name}</span><span className="block truncate text-muted-foreground text-xs">{model}</span></span><span className="text-muted-foreground text-xs">{state === "loading" ? "Denetleniyor" : configured ? "Hazır" : "Anahtar yok"}</span></div>;

const Metric = ({ label, value }: { label: string; value: number }) => <div className="rounded-xl border border-border bg-background p-3"><p className="font-semibold text-xl tabular-nums">{value}</p><p className="text-muted-foreground text-xs">{label}</p></div>;

export default SettingsPanel;
