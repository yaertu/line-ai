"use client";

import {
	ArchiveRestore,
	BrainCircuit,
	Check,
	Cloud,
	CloudOff,
	Download,
	Info,
	Keyboard,
	Laptop,
	Moon,
	Palette,
	RefreshCw,
	ShieldCheck,
	Sparkles,
	Sun,
	Trash2,
	Type,
	Upload,
	UserRound,
	X,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { deleteEngineKey, readEngineStatus, saveEngineKey } from "@/lib/ai";
import {
	type BrowserStatus,
	readBrowserStatus,
	startBrowserSession,
	stopBrowserSession,
} from "@/lib/browser";
import type { CloudConnectionState } from "@/lib/cloud-history";
import { cn } from "@/lib/utils";
import ChromeMark from "../chrome-mark";
import {
	type AppPreferences,
	type EngineStatus,
	type ChatConversation,
	type MotionChoice,
	type ReasoningLevel,
	type ResponseStyle,
	type ThemeChoice,
} from "./chat-data";

type SettingsSection =
	| "general"
	| "transfer"
	| "ai"
	| "appearance"
	| "personalization"
	| "browser"
	| "shortcuts"
	| "data"
	| "archive"
	| "about";

type SectionItem = {
	icon: React.ComponentType<{
		"aria-hidden"?: boolean | "true" | "false";
		className?: string;
		size?: number;
	}>;
	id: SettingsSection;
	label: string;
};

type ReleaseHighlight = {
	description: string;
	icon: SectionItem["icon"];
	title: string;
};

export type SettingsPanelProps = {
	cloudMessage: string;
	cloudState: CloudConnectionState;
	archivedConversations: ChatConversation[];
	conversationCount: number;
	messageCount: number;
	onChange: (preferences: AppPreferences) => void;
	onClearHistory: () => void;
	onClose: () => void;
	onRetryCloud: () => void;
	onDeleteArchived: (id: string) => void;
	onExportData: () => void;
	onImportData: (file: File) => Promise<void>;
	onRestoreArchived: (id: string) => void;
	preferences: AppPreferences;
};

const SECTION_GROUPS: ReadonlyArray<{
	items: ReadonlyArray<SectionItem>;
	label: string;
}> = [
	{
		label: "Kişisel",
		items: [
			{ icon: Sparkles, id: "general", label: "Genel" },
			{ icon: Download, id: "transfer", label: "İçe / dışa aktar" },
			{ icon: BrainCircuit, id: "ai", label: "Yapay zekâ" },
			{ icon: Palette, id: "appearance", label: "Görünüm" },
			{ icon: UserRound, id: "personalization", label: "Kişiselleştirme" },
			{ icon: Keyboard, id: "shortcuts", label: "Klavye kısayolları" },
		],
	},
	{
		label: "Entegrasyonlar",
		items: [{ icon: ChromeMark, id: "browser", label: "Tarayıcı" }],
	},
	{
		label: "Veri ve uygulama",
		items: [
			{ icon: Cloud, id: "data", label: "Bulut verileri" },
			{ icon: ArchiveRestore, id: "archive", label: "Arşivlenen sohbetler" },
			{ icon: Info, id: "about", label: "Hakkında" },
		],
	},
];

const SECTIONS = SECTION_GROUPS.flatMap((group) => group.items);

const RELEASE_HIGHLIGHTS: ReadonlyArray<ReleaseHighlight> = [
	{
		description:
			"Sohbet, kodlama ve görsel işleri tek özel bulut API sözleşmesinden geçer; uygulama yalnız Line AI Engine kullanır.",
		icon: ShieldCheck,
		title: "Tek Line AI Engine",
	},
	{
		description:
			"Geçmiş, dosya ekleri, kod önizleme ve DIFF, görsel üretimi, yeniden deneme ve geri bildirim aynı akışta toplandı.",
		icon: ArchiveRestore,
		title: "Modern sohbet çalışma alanı",
	},
	{
		description:
			"Graphite ve mint tema, yeni konuşma işareti ve tüm Windows ikon boyutları birlikte yenilendi.",
		icon: BrainCircuit,
		title: "Yeni marka ve ikon",
	},
];

const updatePreference = <K extends keyof AppPreferences>(
	preferences: AppPreferences,
	key: K,
	value: AppPreferences[K],
) => ({ ...preferences, [key]: value });

const SettingsPanel = ({
	cloudMessage,
	cloudState,
	archivedConversations,
	conversationCount,
	messageCount,
	onChange,
	onClearHistory,
	onClose,
	onRetryCloud,
	onDeleteArchived,
	onExportData,
	onImportData,
	onRestoreArchived,
	preferences,
}: SettingsPanelProps) => {
	const [section, setSection] = useState<SettingsSection>("general");
	const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
	const [engineMessage, setEngineMessage] = useState("Engine durumu okunuyor…");
	const [engineBusy, setEngineBusy] = useState(false);
	const engineKeyRef = useRef<HTMLInputElement>(null);
	const [browserStatus, setBrowserStatus] = useState<BrowserStatus | null>(
		null,
	);
	const [browserState, setBrowserState] = useState<
		"idle" | "loading" | "ready" | "error"
	>("idle");
	const [browserMessage, setBrowserMessage] = useState("Durum henüz okunmadı.");
	const [confirmClear, setConfirmClear] = useState(false);
	const [transferMessage, setTransferMessage] = useState("");
	const systemReduceMotion = useReducedMotion();
	const shouldReduceMotion =
		preferences.motion === "reduce" ||
		(preferences.motion === "system" && systemReduceMotion);

	const refreshEngine = async () => {
		setEngineBusy(true);
		try {
			const status = await readEngineStatus();
			setEngineStatus(status);
			setEngineMessage(status.message);
		} catch (error) {
			setEngineMessage(error instanceof Error ? error.message : "Engine durumu okunamadı.");
		} finally { setEngineBusy(false); }
	};

	const saveKey = async () => {
		const key = engineKeyRef.current?.value ?? "";
		setEngineBusy(true);
		try {
			await saveEngineKey(key);
			if (engineKeyRef.current) engineKeyRef.current.value = "";
			await refreshEngine();
			setEngineMessage("Engine anahtarı Credential Manager'a kaydedildi.");
		} catch (error) {
			setEngineMessage(error instanceof Error ? error.message : "Engine anahtarı kaydedilemedi.");
			setEngineBusy(false);
		}
	};

	const removeKey = async () => {
		setEngineBusy(true);
		try { await deleteEngineKey(); await refreshEngine(); setEngineMessage("Engine anahtarı silindi."); }
		catch (error) { setEngineMessage(error instanceof Error ? error.message : "Engine anahtarı silinemedi."); setEngineBusy(false); }
	};

	const refreshBrowser = useCallback(async () => {
		setBrowserState("loading");
		setBrowserMessage("Chrome durumu okunuyor…");
		try {
			const status = await readBrowserStatus();
			setBrowserStatus(status);
			setBrowserState("ready");
			setBrowserMessage(
				status.connected
					? "İzole Chrome oturumu hazır."
					: "Chrome oturumu kapalı.",
			);
		} catch (error) {
			setBrowserStatus(null);
			setBrowserState("error");
			setBrowserMessage(
				error instanceof Error ? error.message : "Chrome durumu okunamadı.",
			);
		}
	}, []);

	const startBrowser = async () => {
		setBrowserState("loading");
		setBrowserMessage("Chrome bağlantısı hazırlanıyor…");
		try {
			const status = await startBrowserSession();
			setBrowserStatus(status);
			setBrowserState("ready");
			setBrowserMessage(
				"İzole Chrome oturumu 127.0.0.1 güvenlik sınırında başlatıldı.",
			);
		} catch (error) {
			setBrowserState("error");
			setBrowserMessage(
				error instanceof Error ? error.message : "Chrome başlatılamadı.",
			);
		}
	};

	const stopBrowser = async () => {
		setBrowserState("loading");
		setBrowserMessage("Chrome bağlantısı durduruluyor…");
		try {
			await stopBrowserSession();
			setBrowserStatus({
				connected: false,
				isolatedProfile: true,
				tabCount: 0,
			});
			setBrowserState("ready");
			setBrowserMessage("Line AI Chrome oturumu durduruldu.");
		} catch (error) {
			setBrowserState("error");
			setBrowserMessage(
				error instanceof Error ? error.message : "Chrome durdurulamadı.",
			);
		}
	};

	useEffect(() => {
		const timer = window.setTimeout(() => { void refreshEngine(); }, 0);
		return () => window.clearTimeout(timer);
	}, []);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	const activeLabel =
		SECTIONS.find((item) => item.id === section)?.label ?? "Ayarlar";
	const cloudStateLabel =
		cloudState === "connected"
			? "Bağlı"
			: cloudState === "connecting"
				? "Bağlanıyor"
				: cloudState === "unsynced"
					? "Senkron bekliyor"
					: "Çevrimdışı";

	return (
		<div
			className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground/25 p-0 backdrop-blur-sm sm:p-5"
			role="presentation"
		>
			<button
				aria-label="Ayarları kapat"
				className="absolute inset-0 cursor-default"
				onClick={onClose}
				type="button"
			/>
			<motion.section
				animate={{ opacity: 1, scale: 1, y: 0 }}
				aria-label="Line AI ayarları"
				aria-modal="true"
				className="relative flex h-full max-h-[52rem] w-full max-w-5xl flex-col overflow-hidden border border-border bg-background shadow-black/25 shadow-2xl sm:h-[min(86vh,52rem)] sm:rounded-3xl"
				initial={
					shouldReduceMotion
						? { opacity: 1 }
						: { opacity: 0, scale: 0.985, y: 8 }
				}
				role="dialog"
				transition={
					shouldReduceMotion
						? { duration: 0 }
						: { bounce: 0.05, duration: 0.25, type: "spring" }
				}
			>
				<header className="flex h-16 shrink-0 items-center gap-3 border-border/60 border-b px-4 sm:px-6">
					<div className="min-w-0 flex-1">
						<h2 className="font-semibold text-base">Ayarlar</h2>
						<p className="truncate text-muted-foreground text-xs">
							Arayüz tercihleri bu cihazda; sohbet geçmişi Line AI Cloud’da
							saklanır.
						</p>
					</div>
					<button
						aria-label="Ayarları kapat"
						className="rounded-xl border border-border/70 p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						onClick={onClose}
						type="button"
					>
						<X aria-hidden="true" size={18} />
					</button>
				</header>

				<div className="flex min-h-0 flex-1 flex-col sm:flex-row">
					<nav
						aria-label="Ayar bölümleri"
						className="flex shrink-0 gap-1 overflow-x-auto border-border/60 border-b bg-muted/35 p-2 sm:w-64 sm:flex-col sm:overflow-y-auto sm:border-r sm:border-b-0 sm:p-3"
					>
						{SECTION_GROUPS.map((group) => (
							<div className="contents sm:block" key={group.label}>
								<p className="hidden px-3 pt-3 pb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.08em] first:pt-1 sm:block">
									{group.label}
								</p>
								{group.items.map((item) => {
									const Icon = item.icon;
									return (
										<button
											aria-current={section === item.id ? "page" : undefined}
											className={cn(
												"flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors sm:mb-0.5 sm:w-full",
												section === item.id
													? "bg-background text-foreground shadow-black/5 shadow-sm"
													: "text-muted-foreground hover:bg-muted hover:text-foreground",
											)}
											key={item.id}
											onClick={() => {
												setSection(item.id);
												if (item.id === "browser" && browserState === "idle")
													void refreshBrowser();
											}}
											type="button"
										>
											<Icon aria-hidden="true" size={15} />
											{item.label}
										</button>
									);
								})}
							</div>
						))}
					</nav>

					<div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
						<div className="mx-auto max-w-3xl">
							<div className="mb-5 flex items-end justify-between gap-3">
								<div>
									<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
										Line AI
									</p>
									<h3 className="mt-1 font-semibold text-xl">{activeLabel}</h3>
								</div>
								{section === "ai" || section === "browser" ? (
									<button
										className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs hover:bg-muted disabled:opacity-60"
										disabled={
											section === "ai"
												? engineBusy
												: browserState === "loading"
										}
										onClick={() =>
										section === "ai"
											? void refreshEngine()
												: void refreshBrowser()
										}
										type="button"
									>
										<RefreshCw
											aria-hidden="true"
											className={
												(
												section === "ai"
													? engineBusy
														: browserState === "loading"
												)
													? "animate-spin"
													: ""
											}
											size={13}
										/>{" "}
										Yenile
									</button>
								) : null}
							</div>

							{section === "general" ? (
								<div className="grid gap-4 md:grid-cols-2">
									<SummaryCard
										icon={<BrainCircuit size={18} />}
										label="Akıl yürütme"
										value={reasoningLabel(preferences.reasoning)}
										note="Yeni isteklerde kullanılır."
									/>
									<SummaryCard
										icon={<Sparkles size={18} />}
										label="Yapay zekâ motoru"
										value="Line AI Engine"
										note={engineStatus?.configured ? "Bulut API anahtarı hazır" : "API anahtarı bekleniyor"}
									/>
									<SummaryCard
										icon={<Cloud size={18} />}
										label="Bulut geçmişi"
										value={`${conversationCount} sohbet`}
										note={`${messageCount} mesaj · ${cloudStateLabel}`}
									/>
								</div>
							) : null}

							{section === "transfer" ? (
								<div className="space-y-5">
									<SettingsGroup
										description="Sohbetleri ve arayüz tercihlerini taşınabilir bir Line AI JSON paketi olarak dışa aktarın veya daha önce oluşturulmuş paketi geri alın."
										title="Veri taşıma"
									>
										<div className="grid gap-3 sm:grid-cols-2">
											<button
												className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-primary/40"
												onClick={onExportData}
												type="button"
											>
												<Download className="text-primary" size={18} />
												<span>
													<span className="block font-medium text-sm">
														Dışa aktar
													</span>
													<span className="block text-muted-foreground text-xs">
														Sohbetler + tercihler
													</span>
												</span>
											</button>
											<label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-primary/40">
												<Upload className="text-primary" size={18} />
												<span>
													<span className="block font-medium text-sm">
														İçe aktar
													</span>
													<span className="block text-muted-foreground text-xs">
														Line AI JSON paketi
													</span>
												</span>
												<input
													accept="application/json,.json"
													className="hidden"
													onChange={(event) => {
														const file = event.target.files?.[0];
														if (file)
															void onImportData(file)
																.then(() =>
																	setTransferMessage(
																		"Veriler doğrulandı ve içe aktarıldı.",
																	),
																)
																.catch((error: unknown) =>
																	setTransferMessage(
																		error instanceof Error
																			? error.message
																			: "Dosya içe aktarılamadı.",
																	),
																);
														event.target.value = "";
													}}
													type="file"
												/>
											</label>
										</div>
										{transferMessage ? (
											<p
												aria-live="polite"
												className="mt-3 text-muted-foreground text-xs"
											>
												{transferMessage}
											</p>
										) : null}
									</SettingsGroup>
								</div>
							) : null}

							{section === "ai" ? (
								<div className="space-y-5">
									<SettingsGroup
										description="Bu tercih yalnız destekleyen model isteğine eklenir; modelin gizli düşünce zinciri gösterilmez."
										title="Akıl yürütme düzeyi"
									>
										<ChoiceGrid
											onSelect={(value) =>
												onChange(
													updatePreference(
														preferences,
														"reasoning",
														value as ReasoningLevel,
													),
												)
											}
											options={[
												{
													id: "low",
													label: "Hızlı",
													note: "Kısa ve doğrudan görevler",
												},
												{
													id: "medium",
													label: "Dengeli",
													note: "Genel kullanım",
												},
												{
													id: "high",
													label: "Derin",
													note: "Çok adımlı ve karmaşık işler",
												},
											]}
											value={preferences.reasoning}
										/>
									</SettingsGroup>
									<SettingsGroup
										description="Anahtar yalnız Windows Credential Manager'da tutulur. Tercihlere, sohbet geçmişine veya telemetriye yazılmaz."
										title="Line AI Engine"
									>
										<div className="flex flex-wrap items-end gap-2">
											<label className="min-w-[14rem] flex-1 text-sm">
												<span className="mb-1.5 block font-medium">Canlı API anahtarı</span>
												<input aria-label="Line AI Engine API anahtarı" autoComplete="off" className="h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm outline-none transition-colors focus:border-primary" placeholder="lai_sk_live_…" ref={engineKeyRef} spellCheck={false} type="password" />
											</label>
											<button className="h-10 rounded-lg bg-primary px-3 font-medium text-primary-foreground text-sm disabled:opacity-50" disabled={engineBusy} onClick={() => void saveKey()} type="button">Kaydet</button>
											<button className="h-10 rounded-lg border border-border px-3 text-sm hover:bg-muted disabled:opacity-50" disabled={engineBusy || !engineStatus?.configured} onClick={() => void removeKey()} type="button">Anahtarı sil</button>
											<button aria-label="Engine durumunu yenile" className="h-10 rounded-lg border border-border px-3 text-sm hover:bg-muted disabled:opacity-50" disabled={engineBusy} onClick={() => void refreshEngine()} type="button"><RefreshCw className={engineBusy ? "animate-spin" : ""} size={15} /></button>
										</div>
										<p aria-live="polite" className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-muted-foreground text-xs">{engineMessage}</p>
										{engineStatus?.capabilities ? <p className="mt-2 text-xs text-muted-foreground">{engineStatus.capabilities.project.name} · Metin {engineStatus.capabilities.text ? "hazır" : "kapalı"} · Görsel {engineStatus.capabilities.images ? "hazır" : "kapalı"} · Bugün {Math.max(0, engineStatus.capabilities.quota.dailyUnits - engineStatus.capabilities.quota.usedDaily)} birim</p> : null}
									</SettingsGroup>
								</div>
							) : null}

							{section === "appearance" ? (
								<div className="space-y-5">
									<SettingsGroup
										description="Sistem teması Windows tercihini izler. Seçim anında uygulanır ve bu cihazda saklanır."
										title="Renk teması"
									>
										<ChoiceGrid
											onSelect={(value) =>
												onChange(
													updatePreference(
														preferences,
														"theme",
														value as ThemeChoice,
													),
												)
											}
											options={[
												{
													id: "system",
													label: "Sistem",
													note: "Windows ayarını izle",
													icon: <Laptop size={16} />,
												},
												{
													id: "light",
													label: "Açık",
													note: "Aydınlık yüzey",
													icon: <Sun size={16} />,
												},
												{
													id: "dark",
													label: "Koyu",
													note: "Karanlık yüzey",
													icon: <Moon size={16} />,
												},
											]}
											value={preferences.theme}
										/>
									</SettingsGroup>
									<SettingsGroup
										description="Geist Sans arayüzde, Geist Mono kod alanında kullanılır. Boyutlar anında uygulanır."
										title="Yazı tipi ve boyutu"
									>
										<NumberSetting
											label="Arayüz yazısı"
											max={18}
											min={12}
											onChange={(value) =>
												onChange(
													updatePreference(preferences, "uiFontSize", value),
												)
											}
											value={preferences.uiFontSize}
										/>
										<NumberSetting
											label="Sohbet ve chatbox"
											max={20}
											min={13}
											onChange={(value) =>
												onChange(
													updatePreference(preferences, "chatFontSize", value),
												)
											}
											value={preferences.chatFontSize}
										/>
										<NumberSetting
											label="Kod yazısı"
											max={18}
											min={11}
											onChange={(value) =>
												onChange(
													updatePreference(preferences, "codeFontSize", value),
												)
											}
											value={preferences.codeFontSize}
										/>
									</SettingsGroup>
									<SettingsGroup
										description="Sistem seçeneği Windows erişilebilirlik tercihini izler. Azalt seçeneği geçiş ve döngü animasyonlarını kapatır."
										title="Hareket"
									>
										<ChoiceGrid
											onSelect={(value) =>
												onChange(
													updatePreference(
														preferences,
														"motion",
														value as MotionChoice,
													),
												)
											}
											options={[
												{
													id: "system",
													label: "Sistem",
													note: "Windows tercihini izle",
												},
												{
													id: "reduce",
													label: "Azalt",
													note: "Animasyonları en aza indir",
												},
											]}
											value={preferences.motion}
										/>
									</SettingsGroup>
								</div>
							) : null}

							{section === "personalization" ? (
								<div className="space-y-5">
									<SettingsGroup
										description="Yeni Line AI Engine isteklerine eklenir. En fazla 12 KB; sistem ve güvenlik kurallarını geçersiz kılamaz."
										title="Özel talimatlar"
									>
										<textarea
											aria-label="Özel talimatlar"
											className="min-h-40 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
											maxLength={12000}
											onChange={(event) =>
												onChange(
													updatePreference(
														preferences,
														"customInstructions",
														event.target.value,
													),
												)
											}
											placeholder="Örneğin: Teknik yanıtları Türkçe ver, sonucu önce yaz…"
											value={preferences.customInstructions}
										/>
										<p className="mt-2 text-right text-muted-foreground text-xs tabular-nums">
											{preferences.customInstructions.length.toLocaleString(
												"tr-TR",
											)}{" "}
											/ 12.000
										</p>
									</SettingsGroup>
									<SettingsGroup
										description="Yanıtın varsayılan ayrıntı düzeyini belirler; her istekte Line AI Engine'e gönderilir."
										title="Yanıt stili"
									>
										<ChoiceGrid
											onSelect={(value) =>
												onChange(
													updatePreference(
														preferences,
														"responseStyle",
														value as ResponseStyle,
													),
												)
											}
											options={[
												{
													id: "concise",
													label: "Kısa",
													note: "Yoğun ve doğrudan",
												},
												{
													id: "balanced",
													label: "Dengeli",
													note: "Netlik ve bağlam dengesi",
												},
												{
													id: "detailed",
													label: "Detaylı",
													note: "Gerekçe ve edge case'ler",
												},
											]}
											value={preferences.responseStyle}
										/>
									</SettingsGroup>
								</div>
							) : null}

							{section === "browser" ? (
								<div className="space-y-5">
									<SettingsGroup
										description="Line AI, ayrı bir Chrome profili başlatır ve yalnız 127.0.0.1 üzerindeki DevTools bağlantısına izin verir. Kullanıcının normal Chrome profili ve uzantıları kullanılmaz."
										title="Gerçek Chrome entegrasyonu"
									>
										<ToggleRow
											checked={preferences.browserTools}
											label="Sohbette tarayıcı araçlarını kullan"
											note="Okuma doğal dille; tıklama ve yazma yalnız açık /browser komutuyla çalışır"
											onChange={(value) =>
												onChange(
													updatePreference(preferences, "browserTools", value),
												)
											}
										/>
										<div
											className={cn(
												"mt-4 rounded-xl border p-3",
												browserState === "error"
													? "border-destructive/30 bg-destructive/5"
													: browserStatus?.connected
														? "border-emerald-500/25 bg-emerald-500/5"
														: "border-border bg-background",
											)}
											role="status"
										>
											<div className="flex items-start gap-3">
												<ChromeMark
													aria-hidden="true"
													className="mt-0.5 shrink-0"
													size={18}
												/>
												<div className="min-w-0 flex-1">
													<p className="font-medium text-sm">
														{browserStatus?.connected
															? "Chrome bağlı"
															: browserState === "loading"
																? "Bağlantı denetleniyor"
																: "Chrome bağlı değil"}
													</p>
													<p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
														{browserMessage}
													</p>
													{browserStatus?.connected ? (
														<p className="mt-1 text-muted-foreground text-xs">
															{browserStatus.tabCount} sekme · port{" "}
															{browserStatus.port ?? "—"} ·{" "}
															{browserStatus.isolatedProfile
																? "izole profil"
																: "profil doğrulanamadı"}
														</p>
													) : null}
												</div>
											</div>
											<div className="mt-3 flex flex-wrap gap-2">
												<button
													className="rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground text-xs disabled:opacity-50"
													disabled={
														browserState === "loading" ||
														browserStatus?.connected === true
													}
													onClick={() => void startBrowser()}
													type="button"
												>
													Başlat
												</button>
												<button
													className="rounded-lg border border-border bg-background px-3 py-2 text-xs hover:bg-muted disabled:opacity-50"
													disabled={
														browserState === "loading" ||
														browserStatus?.connected !== true
													}
													onClick={() => void stopBrowser()}
													type="button"
												>
													Durdur
												</button>
											</div>
										</div>
									</SettingsGroup>
									<SettingsGroup
										description="Bu komutlar doğrudan masaüstü Rust katmanındaki Chrome DevTools oturumuna gider; durumlar simülasyon değildir."
										title="Sohbette kullanılabilen komutlar"
									>
										<CommandRow
											command="/browser başlat"
											note="İzole Chrome oturumunu açar"
										/>
										<CommandRow
											command="/browser aç https://…"
											note="HTTP/HTTPS adresini açar"
										/>
										<CommandRow
											command="/browser oku"
											note="Aktif sayfanın görünür metnini okur"
										/>
										<CommandRow
											command="/browser tıkla <CSS seçici>"
											note="Belirtilen öğeye tıklar"
										/>
										<CommandRow
											command="/browser yaz <CSS seçici> :: <metin>"
											note="Alana metin yazar"
										/>
									</SettingsGroup>
								</div>
							) : null}

							{section === "shortcuts" ? (
								<SettingsGroup
									description="Uygulama genelinde etkin olan klavye kısayolları."
									title="Klavye kısayolları"
								>
									<ShortcutRow
										keys="Ctrl + K"
										label="Sohbetlerde ara ve komut paleti"
									/>
									<ShortcutRow keys="Ctrl + N" label="Yeni sohbet" />
									<ShortcutRow keys="Ctrl + ," label="Ayarları aç" />
									<ShortcutRow keys="Enter" label="Mesajı gönder" />
									<ShortcutRow keys="Shift + Enter" label="Yeni satır" />
									<ShortcutRow keys="Esc" label="Açık paneli kapat" />
								</SettingsGroup>
							) : null}

							{section === "data" ? (
								<div className="space-y-5">
									<SettingsGroup
										description="Sohbet geçmişi kurulum kimliğine bağlı Line AI Cloud alanında saklanır; erişim secret’ı Windows Credential Manager’dan arayüze taşınmaz."
										title="Line AI Cloud"
									>
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
												<CloudOff
													aria-hidden="true"
													className="mt-0.5 shrink-0 text-amber-500"
													size={17}
												/>
											) : (
												<Cloud
													aria-hidden="true"
													className={cn(
														"mt-0.5 shrink-0",
														cloudState === "connecting"
															? "animate-pulse text-primary"
															: "text-emerald-500",
													)}
													size={17}
												/>
											)}
											<div className="min-w-0 flex-1">
												<p className="font-medium text-sm">{cloudStateLabel}</p>
												<p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
													{cloudMessage}
												</p>
											</div>
											{cloudState === "offline" || cloudState === "unsynced" ? (
												<button
													className="shrink-0 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs hover:bg-muted"
													onClick={onRetryCloud}
													type="button"
												>
													Yeniden dene
												</button>
											) : null}
										</div>
										<div className="grid grid-cols-2 gap-3">
											<Metric label="Sohbet" value={conversationCount} />
											<Metric label="Mesaj" value={messageCount} />
										</div>
									</SettingsGroup>
									<SettingsGroup
										description="Bu işlem Line AI Cloud sohbet geçmişini temizler. Uygulama tercihleri, Engine anahtarı ve kurulum kimliği korunur."
										title="Sohbet geçmişi"
									>
										{confirmClear ? (
											<div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
												<p className="font-medium text-sm">
													Tüm bulut sohbetleri silinsin mi?
												</p>
												<div className="mt-3 flex gap-2">
													<button
														className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted"
														onClick={() => setConfirmClear(false)}
														type="button"
													>
														Vazgeç
													</button>
													<button
														className="rounded-lg bg-destructive px-3 py-2 text-destructive-foreground text-xs"
														onClick={() => {
															onClearHistory();
															setConfirmClear(false);
														}}
														type="button"
													>
														Kalıcı olarak temizle
													</button>
												</div>
											</div>
										) : (
											<button
												className="flex items-center gap-2 rounded-xl border border-destructive/25 px-3 py-2.5 text-destructive text-sm transition-colors hover:bg-destructive/5 disabled:opacity-50"
												disabled={conversationCount === 0}
												onClick={() => setConfirmClear(true)}
												type="button"
											>
												<Trash2 size={15} /> Tüm sohbet geçmişini temizle
											</button>
										)}
									</SettingsGroup>
								</div>
							) : null}

							{section === "archive" ? (
								<SettingsGroup
									description="Arşivlenen sohbetler ana sohbet listesinden gizlenir; içerikleri bulutta korunur ve istendiğinde geri alınır."
									title="Arşivlenen sohbetler"
								>
									{archivedConversations.length ? (
										<ul className="space-y-2">
											{archivedConversations.map((conversation) => (
												<li
													className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"
													key={conversation.id}
												>
													<span className="min-w-0 flex-1">
														<span className="block truncate font-medium text-sm">
															{conversation.title}
														</span>
														<time
															className="text-muted-foreground text-xs"
															dateTime={conversation.updatedAt}
														>
															{new Date(conversation.updatedAt).toLocaleString(
																"tr-TR",
															)}
														</time>
													</span>
													<button
														className="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
														onClick={() => onRestoreArchived(conversation.id)}
														type="button"
													>
														Geri al
													</button>
													<button
														aria-label={`${conversation.title} sohbetini sil`}
														className="rounded-lg p-2 text-destructive hover:bg-destructive/10"
														onClick={() => onDeleteArchived(conversation.id)}
														type="button"
													>
														<Trash2 size={14} />
													</button>
												</li>
											))}
										</ul>
									) : (
										<p className="rounded-xl border border-dashed border-border p-5 text-center text-muted-foreground text-sm">
											Arşivlenmiş sohbet yok.
										</p>
									)}
								</SettingsGroup>
							) : null}

							{section === "about" ? (
								<div className="space-y-4">
									<SettingsGroup
										description="Denetlenebilir Windows yapay zekâ çalışma alanı · güncel sürüm"
									title="Line AI v0.6.1"
									>
										<p className="text-muted-foreground text-sm leading-relaxed">
											Line AI; sohbet, kodlama, dosya bağlamı, Chrome araçları ve
											görsel üretimini tek sade çalışma alanında birleştirir.
										</p>
									</SettingsGroup>
									<SettingsGroup
										description="Masaüstü istemcisi için yönetilen metin, kota ve güvenli anahtar bağlantısı."
										title="Line AI Engine"
									>
										<p className="text-muted-foreground text-sm leading-relaxed">
											Engine anahtarı Windows Credential Manager’da tutulur. Yanıt geri bildirimi
											isteğe bağlıdır; not yalnız açık izin verildiğinde gönderilir. Kota,
											maliyet ve kalite politikası sunucudaki yönetim katmanında izlenir.
										</p>
									</SettingsGroup>
									<SettingsGroup
									description="Bu sürümde kullanıcıya doğrudan ulaşan ana geliştirmeler."
									title="Yenilikler · v0.6.1"
									>
										<ul
										aria-label="v0.6.1 yenilikleri"
											className="space-y-3"
										>
											{RELEASE_HIGHLIGHTS.map((highlight) => {
												const HighlightIcon = highlight.icon;
												return (
													<li
														className="flex gap-3 border-border/60 border-t pt-3 first:border-t-0 first:pt-0"
														key={highlight.title}
													>
														<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
															<HighlightIcon aria-hidden="true" size={16} />
														</span>
														<span className="min-w-0">
															<span className="block font-medium text-sm">
																{highlight.title}
															</span>
															<span className="mt-1 block text-muted-foreground text-xs leading-relaxed">
																{highlight.description}
															</span>
														</span>
													</li>
												);
											})}
										</ul>
										<p className="mt-4 rounded-xl border border-dashed border-primary/35 bg-primary/5 p-3 text-muted-foreground text-xs leading-relaxed">
											<span className="font-medium text-foreground">Arayüz durumu: </span>
											Mission Control, replay ve Jury ekranlarına bağlanma çalışması sürüyor;
											bu altyapılar henüz uygulama içinden tek tek başlatılamaz.
										</p>
									</SettingsGroup>
									<SettingsGroup
										description="Arayüz bileşenlerinin kaynak ve lisans bildirimleri dağıtımdaki THIRD_PARTY_NOTICES.md dosyasında tutulur."
										title="Gizlilik ve lisans"
									>
										<p className="text-muted-foreground text-sm leading-relaxed">
											Engine çalışma anahtarları ve bulut erişim secret’ı React
											katmanına aktarılmaz. Her kurulum kendi kimliğiyle
											ayrılır; geçmiş silinebilir.
										</p>
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

const reasoningLabel = (value: ReasoningLevel) =>
	value === "high" ? "Derin" : value === "medium" ? "Dengeli" : "Hızlı";

const SettingsGroup = ({
	children,
	description,
	title,
}: {
	children: React.ReactNode;
	description: string;
	title: string;
}) => (
	<section className="rounded-2xl border border-border/70 bg-muted/20 p-4">
		<h4 className="font-semibold text-sm">{title}</h4>
		<p className="mt-1 mb-4 text-muted-foreground text-xs leading-relaxed">
			{description}
		</p>
		{children}
	</section>
);

const SummaryCard = ({
	icon,
	label,
	note,
	value,
}: {
	icon: React.ReactNode;
	label: string;
	note: string;
	value: string;
}) => (
	<div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
		<span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
			{icon}
		</span>
		<p className="mt-4 text-muted-foreground text-xs">{label}</p>
		<p className="mt-0.5 font-semibold text-base">{value}</p>
		<p className="mt-1 text-muted-foreground text-xs">{note}</p>
	</div>
);

const ChoiceGrid = ({
	onSelect,
	options,
	value,
}: {
	onSelect: (id: string) => void;
	options: Array<{
		icon?: React.ReactNode;
		id: string;
		label: string;
		note: string;
	}>;
	value: string;
}) => (
	<div className="grid gap-2 sm:grid-cols-3">
		{options.map((option) => (
			<button
				aria-pressed={option.id === value}
				className={cn(
					"relative min-h-20 rounded-xl border p-3 text-left transition-colors",
					option.id === value
						? "border-primary bg-primary/8"
						: "border-border bg-background hover:border-primary/35",
				)}
				key={option.id}
				onClick={() => onSelect(option.id)}
				type="button"
			>
				<span className="flex items-center gap-2 font-medium text-sm">
					{option.icon}
					{option.label}
				</span>
				<span className="mt-1.5 block text-muted-foreground text-xs leading-relaxed">
					{option.note}
				</span>
				{option.id === value ? (
					<Check
						className="absolute top-2.5 right-2.5 text-primary"
						size={14}
					/>
				) : null}
			</button>
		))}
	</div>
);

const ToggleRow = ({
	checked,
	label,
	note,
	onChange,
}: {
	checked: boolean;
	label: string;
	note: string;
	onChange: (checked: boolean) => void;
}) => (
	<button
		aria-pressed={checked}
		className="flex w-full items-center gap-3 text-left"
		onClick={() => onChange(!checked)}
		type="button"
	>
		<span className="min-w-0 flex-1">
			<span className="block font-medium text-sm">{label}</span>
			<span className="block text-muted-foreground text-xs">{note}</span>
		</span>
		<span
			className={cn(
				"relative h-6 w-11 rounded-full transition-colors",
				checked ? "bg-primary" : "bg-muted-foreground/25",
			)}
		>
			<span
				className={cn(
					"absolute top-1 size-4 rounded-full bg-white shadow-sm transition-transform",
					checked ? "translate-x-6" : "translate-x-1",
				)}
			/>
		</span>
	</button>
);

const NumberSetting = ({
	label,
	max,
	min,
	onChange,
	value,
}: {
	label: string;
	max: number;
	min: number;
	onChange: (value: number) => void;
	value: number;
}) => (
	<label className="flex items-center gap-3 border-border/60 border-t py-3 first:border-t-0 first:pt-0 last:pb-0">
		<Type aria-hidden="true" className="text-muted-foreground" size={15} />
		<span className="min-w-0 flex-1 font-medium text-sm">{label}</span>
		<input
			aria-label={`${label} boyutu`}
			className="w-20 accent-primary"
			max={max}
			min={min}
			onChange={(event) => onChange(Number(event.target.value))}
			type="range"
			value={value}
		/>
		<output className="w-11 rounded-lg border border-border bg-background px-2 py-1 text-center text-xs tabular-nums">
			{value}px
		</output>
	</label>
);

const CommandRow = ({ command, note }: { command: string; note: string }) => (
	<div className="flex flex-col gap-1 border-border/60 border-t py-3 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4">
		<code className="shrink-0 rounded-md bg-background px-2 py-1 font-mono text-xs">
			{command}
		</code>
		<span className="text-muted-foreground text-xs">{note}</span>
	</div>
);

const ShortcutRow = ({ keys, label }: { keys: string; label: string }) => (
	<div className="flex items-center gap-3 border-border/60 border-t py-3 first:border-t-0 first:pt-0 last:pb-0">
		<span className="min-w-0 flex-1 text-sm">{label}</span>
		<kbd className="rounded-lg border border-border bg-background px-2 py-1 font-mono text-xs shadow-sm">
			{keys}
		</kbd>
	</div>
);

const Metric = ({ label, value }: { label: string; value: number }) => (
	<div className="rounded-xl border border-border bg-background p-3">
		<p className="font-semibold text-xl tabular-nums">{value}</p>
		<p className="text-muted-foreground text-xs">{label}</p>
	</div>
);

export default SettingsPanel;
