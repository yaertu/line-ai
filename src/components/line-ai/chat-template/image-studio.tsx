"use client";

import { Download, ImageIcon, LoaderCircle, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import {
	deleteEngineImage,
	downloadEngineAsset,
	generateEngineImage,
	getEngineAsset,
	getEngineImage,
	readEngineStatus,
} from "@/lib/ai";
import type { EngineImageJob, EngineStatus } from "./chat-data";

type AspectRatio = "1:1" | "3:2" | "2:3";
type Quality = "low" | "medium" | "high";
type Style = "natural" | "illustration" | "product" | "poster";

const label = (status: EngineStatus | null) => {
	if (!status?.configured) return "Engine anahtarı gerekli";
	if (!status.capabilities?.enabled || !status.capabilities.images) {
		return status.capabilities?.imageUnavailableReason ?? status.message;
	}
	const quota = status.capabilities.quota;
	return `${status.capabilities.project.name} · Bugün ${Math.max(0, quota.dailyUnits - quota.usedDaily)} birim kaldı`;
};

export default function ImageStudio({ onClose }: { onClose: () => void }) {
	const reduceMotion = useReducedMotion();
	const [status, setStatus] = useState<EngineStatus | null>(null);
	const [prompt, setPrompt] = useState("");
	const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
	const [quality, setQuality] = useState<Quality>("medium");
	const [style, setStyle] = useState<Style>("natural");
	const [job, setJob] = useState<EngineImageJob | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [busy, setBusy] = useState<"idle" | "loading" | "generating" | "saving" | "deleting">("loading");
	const [message, setMessage] = useState("Engine durumu okunuyor…");

	const refreshStatus = useCallback(async () => {
		setBusy("loading");
		try {
			const next = await readEngineStatus();
			setStatus(next);
			setMessage(label(next));
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Engine durumu okunamadı.");
		} finally {
			setBusy("idle");
		}
	}, []);

	const refreshJob = useCallback(async () => {
		if (!job) return;
		setBusy("loading");
		try {
			const next = await getEngineImage(job.id);
			setJob(next);
			if (next.status === "completed" && next.assetId) {
				setPreviewUrl(await getEngineAsset(next.assetId));
				setMessage("Görsel hazır. Önizleme bağlantısı kısa süreliğine geçerlidir.");
			} else {
				setMessage(`Görsel işi: ${next.status}`);
			}
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Görsel işi yenilenemedi.");
		} finally {
			setBusy("idle");
		}
	}, [job]);

	useEffect(() => {
		const timer = window.setTimeout(() => { void refreshStatus(); }, 0);
		return () => window.clearTimeout(timer);
	}, [refreshStatus]);
	useEffect(() => {
		if (!job || job.status === "completed" || job.status === "failed" || job.status === "cancelled") return;
		const timer = window.setInterval(() => { void refreshJob(); }, 3500);
		return () => window.clearInterval(timer);
	}, [job, refreshJob]);

	const generate = async () => {
		if (!prompt.trim() || !status?.capabilities?.images || busy !== "idle") return;
		setBusy("generating");
		setPreviewUrl(null);
		setMessage("Görsel işi sunucuda oluşturuluyor…");
		try {
			const next = await generateEngineImage({ prompt: prompt.trim(), aspectRatio, quality, style });
			setJob(next);
			if (next.status === "completed" && next.assetId) setPreviewUrl(await getEngineAsset(next.assetId));
			setMessage(next.status === "completed" ? "Görsel hazır." : `Görsel işi: ${next.status}`);
			void refreshStatus();
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Görsel üretilemedi.");
		} finally {
			setBusy("idle");
		}
	};

	const download = async () => {
		if (!job?.assetId) return;
		setBusy("saving");
		try {
			const saved = await downloadEngineAsset(job.assetId, `line-ai-${job.id}.png`);
			setMessage(`Görsel kaydedildi: ${saved.path}`);
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Görsel kaydedilemedi.");
		} finally { setBusy("idle"); }
	};

	const remove = async () => {
		if (!job || busy !== "idle") return;
		setBusy("deleting");
		try { await deleteEngineImage(job.id); setJob(null); setPreviewUrl(null); setMessage("Görsel işi silindi."); }
		catch (error) { setMessage(error instanceof Error ? error.message : "Görsel silinemedi."); }
		finally { setBusy("idle"); }
	};

	const canGenerate = Boolean(prompt.trim() && status?.capabilities?.images && busy === "idle");
	return (
		<div className="fixed inset-0 z-[90] flex items-center justify-center bg-foreground/30 p-0 backdrop-blur-sm sm:p-6" role="presentation">
			<button aria-label="Image Studioyu kapat" className="absolute inset-0 cursor-default" onClick={onClose} type="button" />
			<motion.section animate={{ opacity: 1, scale: 1, y: 0 }} initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.985, y: 10 }} transition={reduceMotion ? { duration: 0 } : { duration: 0.22 }} className="relative grid h-full max-h-[48rem] w-full max-w-5xl overflow-hidden border border-border bg-background shadow-2xl sm:h-[min(84vh,48rem)] sm:grid-cols-[0.94fr_1.06fr] sm:rounded-3xl" aria-label="Line AI Image Studio" aria-modal="true" role="dialog">
				<div className="flex min-h-0 flex-col border-border/70 border-b p-5 sm:border-r sm:border-b-0 sm:p-7">
					<div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-2 font-medium text-primary text-xs uppercase tracking-[0.16em]"><Sparkles size={14} /> Image Studio</p><h2 className="mt-2 font-semibold text-2xl tracking-tight">Fikri görsele dönüştür</h2></div><button aria-label="Kapat" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onClose} type="button"><X size={18} /></button></div>
					<p className="mt-3 text-muted-foreground text-sm leading-6">Üretim Line AI Engine üzerinde yapılır. İsteminiz yalnız bu işi oluşturmak için gönderilir.</p>
					<div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground"><div className="flex items-center justify-between gap-3"><span className="min-w-0 truncate">{message}</span><button aria-label="Engine durumunu yenile" className="shrink-0 rounded-md p-1 hover:bg-background" disabled={busy !== "idle"} onClick={() => void refreshStatus()} type="button"><RefreshCw className={busy === "loading" ? "animate-spin" : ""} size={14} /></button></div>{status?.capabilities ? <p className="mt-1.5 text-foreground/80">Politika {status.capabilities.policyVersion} · Aylık {Math.max(0, status.capabilities.quota.monthlyUnits - status.capabilities.quota.usedMonthly)} birim</p> : null}</div>
					<label className="mt-5 block"><span className="font-medium text-sm">Görsel istemi</span><textarea aria-label="Görsel istemi" className="mt-2 min-h-32 w-full resize-y rounded-2xl border border-border bg-muted/35 p-3 text-sm outline-none transition focus:border-primary/55 focus:ring-2 focus:ring-primary/15" maxLength={8000} onChange={(event) => setPrompt(event.target.value)} placeholder="Örn. gece ışıkları altında, yalın bir teknoloji dergisi kapağı…" value={prompt} /><span className="mt-1 block text-right text-muted-foreground text-xs">{prompt.length}/8000</span></label>
					<OptionRow label="Oran" options={["1:1", "3:2", "2:3"] as AspectRatio[]} value={aspectRatio} onChange={setAspectRatio} />
					<OptionRow label="Kalite" options={["low", "medium", "high"] as Quality[]} value={quality} onChange={setQuality} />
					<OptionRow label="Stil" options={["natural", "illustration", "product", "poster"] as Style[]} value={style} onChange={setStyle} />
					<button className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-medium text-primary-foreground text-sm shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45" disabled={!canGenerate} onClick={() => void generate()} type="button">{busy === "generating" ? <LoaderCircle className="animate-spin" size={17} /> : <Sparkles size={17} />} Görsel üret</button>
				</div>
				<div className="flex min-h-0 flex-col bg-muted/20 p-5 sm:p-7"><div className="flex items-center justify-between"><span className="font-medium text-sm">Son üretim</span>{job ? <span className="rounded-full border border-border bg-background px-2 py-1 text-[0.68rem] text-muted-foreground">{job.status}</span> : null}</div><div className="mt-4 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-3xl border border-dashed border-border/90 bg-background/60 p-3">{previewUrl ? <img alt={prompt || "Line AI üretimi"} className="max-h-full max-w-full rounded-2xl object-contain shadow-lg" src={previewUrl} /> : <div className="max-w-xs text-center text-muted-foreground"><ImageIcon className="mx-auto mb-3 opacity-55" size={36} /><p className="font-medium text-foreground">Henüz görsel yok</p><p className="mt-1 text-sm leading-5">Üretim tamamlandığında güvenli, kısa süreli varlık bağlantısından önizleme burada görünür.</p></div>}</div>{job ? <div className="mt-4 flex flex-wrap gap-2"><button className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50" disabled={busy !== "idle"} onClick={() => void refreshJob()} type="button"><RefreshCw size={15} /> Yenile</button><button className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50" disabled={!job.assetId || busy !== "idle"} onClick={() => void download()} type="button"><Download size={15} /> İndir</button><button className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-destructive text-sm hover:bg-destructive/10 disabled:opacity-50" disabled={busy !== "idle"} onClick={() => void remove()} type="button"><Trash2 size={15} /> Sil</button></div> : null}</div>
			</motion.section>
		</div>
	);
}

function OptionRow<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: T; onChange: (value: T) => void }) {
	return <div className="mt-4"><span className="font-medium text-sm">{label}</span><div className="mt-2 flex flex-wrap gap-1.5">{options.map((option) => <button className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${value === option ? "border-primary/50 bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted"}`} key={option} onClick={() => onChange(option)} type="button">{option}</button>)}</div></div>;
}
