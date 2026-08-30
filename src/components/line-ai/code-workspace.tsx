"use client";

import { Check, Code2, Copy, Eye, FileCode2, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { CodeArtifact } from "@/components/line-ai/chat-template/chat-data";
import { buildArtifactPreview } from "@/lib/code-artifacts";
import { cn } from "@/lib/utils";

type WorkspacePane = "code" | "preview";

export type CodeWorkspaceProps = {
	artifact: CodeArtifact;
	onClose: () => void;
};

const CodeWorkspace = ({ artifact, onClose }: CodeWorkspaceProps) => {
	const shouldReduceMotion = useReducedMotion();
	const [activeFileName, setActiveFileName] = useState(artifact.files[0]?.name ?? "");
	const [pane, setPane] = useState<WorkspacePane>("code");
	const [copied, setCopied] = useState(false);
	const preview = useMemo(() => buildArtifactPreview(artifact), [artifact]);
	const activeFile = artifact.files.find((file) => file.name === activeFileName) ?? artifact.files[0];

	useEffect(() => {
		if (!copied) return;
		const timer = window.setTimeout(() => setCopied(false), 1600);
		return () => window.clearTimeout(timer);
	}, [copied]);

	return (
		<motion.aside
			animate={{ opacity: 1, x: 0 }}
			aria-label="Kod ve canlı önizleme çalışma alanı"
			className="absolute inset-y-0 right-0 z-40 flex w-full min-w-0 flex-col border-border border-l bg-background shadow-2xl shadow-black/15 sm:w-[min(48rem,62vw)] lg:relative lg:z-0 lg:w-[min(44rem,46vw)] lg:shrink-0 lg:shadow-none"
			exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 28 }}
			initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 28 }}
			transition={shouldReduceMotion ? { duration: 0 } : { bounce: 0, duration: 0.26, type: "spring" }}
		>
			<header className="flex h-14 shrink-0 items-center gap-3 border-border/70 border-b px-3">
				<span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
					<FileCode2 aria-hidden="true" size={16} />
				</span>
				<div className="min-w-0 flex-1">
					<strong className="block truncate font-semibold text-xs tracking-[0.08em]">KOD · ÖNİZLE</strong>
					<span className="block truncate text-muted-foreground text-[0.68rem]">{artifact.title} · {artifact.files.length} dosya</span>
				</div>
				<div className="flex rounded-lg bg-muted p-0.5" role="tablist">
					<button aria-selected={pane === "code"} className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs", pane === "code" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")} onClick={() => setPane("code")} role="tab" type="button"><Code2 size={13} /> Kod</button>
					<button aria-disabled={!preview} aria-selected={pane === "preview"} className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs", pane === "preview" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground", !preview && "cursor-not-allowed opacity-45")} disabled={!preview} onClick={() => setPane("preview")} role="tab" type="button"><Eye size={13} /> Önizle</button>
				</div>
				<button aria-label="Kod panelini kapat" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onClose} type="button"><X size={16} /></button>
			</header>

			{pane === "code" ? (
				<div className="flex min-h-0 flex-1 flex-col">
					<div className="flex shrink-0 items-center gap-1 overflow-x-auto border-border/60 border-b px-2 pt-2">
						{artifact.files.map((file) => (
							<button aria-selected={file.name === activeFile?.name} className={cn("shrink-0 rounded-t-lg border border-transparent px-3 py-2 font-mono text-xs", file.name === activeFile?.name ? "border-border border-b-background bg-background text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")} key={file.name} onClick={() => setActiveFileName(file.name)} role="tab" type="button">{file.name}</button>
						))}
						<button aria-label={copied ? "Kod kopyalandı" : "Etkin dosyayı kopyala"} className="ml-auto shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => { if (!activeFile) return; void navigator.clipboard.writeText(activeFile.content).then(() => setCopied(true)); }} type="button">{copied ? <Check size={14} /> : <Copy size={14} />}</button>
					</div>
					<pre className="min-h-0 flex-1 overflow-auto bg-[oklch(0.17_0_0)] p-5 font-mono text-[0.78rem] text-[oklch(0.92_0_0)] leading-6"><code>{activeFile?.content}</code></pre>
				</div>
			) : (
				<div className="min-h-0 flex-1 bg-[linear-gradient(45deg,var(--border)_25%,transparent_25%),linear-gradient(-45deg,var(--border)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,var(--border)_75%),linear-gradient(-45deg,transparent_75%,var(--border)_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px] p-3">
					<iframe className="h-full w-full rounded-xl border border-border bg-white shadow-sm" referrerPolicy="no-referrer" sandbox="allow-scripts" srcDoc={preview ?? ""} title={`${artifact.title} güvenli canlı önizlemesi`} />
				</div>
			)}
		</motion.aside>
	);
};

export default CodeWorkspace;
