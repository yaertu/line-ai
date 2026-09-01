"use client";

import {
	AlertTriangle,
	Check,
	CircleCheck,
	Code2,
	Copy,
	Download,
	Eye,
	FileCode2,
	GitCompareArrows,
	X,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import {
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { CodeArtifact } from "@/components/line-ai/chat-template/chat-data";
import { buildArtifactPreview } from "@/lib/code-artifacts";
import { inspectCodeFile } from "@/lib/code-diagnostics";
import { buildLineDiff, type LineDiffRow } from "@/lib/line-diff";
import { cn } from "@/lib/utils";

type WorkspacePane = "code" | "diff" | "preview";

const TOKEN_PATTERN =
	/(<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/|\/\/[^\n]*|`(?:\\.|[^`])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|<!doctype[^>]*>|<\/?[a-zA-Z][^>]*>|#[\da-fA-F]{3,8}\b|\b(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|class|extends|new|import|export|from|async|await|try|catch|finally|throw|interface|type|enum|public|private|protected|static|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b)/g;

const tokenClass = (token: string) => {
	if (/^(?:<!--|\/\*|\/\/)/.test(token)) return "text-[#71717a] italic";
	if (/^["'`]/.test(token)) return "text-[#a7d88d]";
	if (/^<(!doctype|\/?[a-z])/i.test(token)) return "text-[#67d4df]";
	if (/^#[\da-f]{3,8}$/i.test(token)) return "text-[#e7a5ff]";
	if (/^\d/.test(token)) return "text-[#e7b86f]";
	return "text-[#c7a6ff]";
};

const highlightLine = (line: string, lineIndex: number) => {
	const nodes: ReactNode[] = [];
	let cursor = 0;
	for (const match of line.matchAll(TOKEN_PATTERN)) {
		if (match.index > cursor) nodes.push(line.slice(cursor, match.index));
		const token = match[0];
		nodes.push(
			<span className={tokenClass(token)} key={`${lineIndex}-${match.index}`}>
				{token}
			</span>,
		);
		cursor = match.index + token.length;
	}
	if (cursor < line.length) nodes.push(line.slice(cursor));
	return nodes;
};

const HighlightedCode = ({ content }: { content: string }) => (
	<>
		{content.split("\n").map((line, index) => (
			<span className="block min-h-6" key={`${index}-${line.length}`}>
				<span
					aria-hidden="true"
					className="mr-5 inline-block w-8 select-none text-right text-[#52525b]"
				>
					{index + 1}
				</span>
				{highlightLine(line, index)}
			</span>
		))}
	</>
);

const DIFF_KIND_LABEL = {
	added: "Eklenen",
	context: "Bağlam",
	removed: "Silinen",
} as const;

const DiffLine = ({ row }: { row: LineDiffRow }) => {
	const oldLine = row.oldLine ?? "yok";
	const newLine = row.newLine ?? "yok";
	return (
		<div
			aria-label={`${DIFF_KIND_LABEL[row.kind]}: eski ${oldLine}, yeni ${newLine}: ${row.content}`}
			className={cn(
				"grid min-h-6 grid-cols-[3rem_3rem_1.5rem_minmax(max-content,1fr)] border-transparent border-l-2",
				row.kind === "added" &&
					"border-l-emerald-500 bg-emerald-500/12 text-emerald-100",
				row.kind === "removed" &&
					"border-l-rose-500 bg-rose-500/12 text-rose-100",
				row.kind === "context" && "text-zinc-300",
			)}
			data-diff-kind={row.kind}
			data-new-line={row.newLine ?? ""}
			data-old-line={row.oldLine ?? ""}
		>
			<span
				aria-hidden="true"
				className="select-none border-white/5 border-r px-2 text-right text-zinc-500"
			>
				{row.oldLine ?? ""}
			</span>
			<span
				aria-hidden="true"
				className="select-none border-white/5 border-r px-2 text-right text-zinc-500"
			>
				{row.newLine ?? ""}
			</span>
			<span aria-hidden="true" className="select-none text-center">
				{row.kind === "added" ? "+" : row.kind === "removed" ? "−" : " "}
			</span>
			<span className="whitespace-pre px-2">{row.content || " "}</span>
		</div>
	);
};

export type CodeWorkspaceProps = {
	artifact: CodeArtifact;
	isStreaming?: boolean;
	onClose: () => void;
	previousArtifact?: CodeArtifact;
};

const CodeWorkspace = ({
	artifact,
	isStreaming = false,
	onClose,
	previousArtifact,
}: CodeWorkspaceProps) => {
	const shouldReduceMotion = useReducedMotion();
	const codeScrollRef = useRef<HTMLPreElement>(null);
	const wasStreamingRef = useRef(isStreaming);
	const [activeFileName, setActiveFileName] = useState(
		artifact.files[0]?.name ?? "",
	);
	const [pane, setPane] = useState<WorkspacePane>("code");
	const [copied, setCopied] = useState(false);
	const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
	const preview = useMemo(() => buildArtifactPreview(artifact), [artifact]);
	const activeFile =
		artifact.files.find((file) => file.name === activeFileName) ??
		artifact.files[0];
	const previousFile = previousArtifact?.files.find(
		(file) => file.name === activeFile?.name,
	);
	const diffRows = useMemo(
		() =>
			previousArtifact && activeFile
				? buildLineDiff(previousFile?.content ?? "", activeFile.content)
				: undefined,
		[activeFile, previousArtifact, previousFile?.content],
	);
	const visiblePane: WorkspacePane = isStreaming ? "code" : pane;
	const diagnostics = useMemo(
		() => (isStreaming ? [] : inspectCodeFile(activeFile)),
		[activeFile, isStreaming],
	);
	const errorCount = diagnostics.filter(
		(diagnostic) => diagnostic.severity === "error",
	).length;

	const downloadActiveFile = () => {
		if (!activeFile || isStreaming) return;
		const isHtml = /\.html?$/i.test(activeFile.name);
		const isSvg = /\.svg$/i.test(activeFile.name);
		const content = isHtml && preview ? preview : activeFile.content;
		const blob = new Blob([content], {
			type: isHtml
				? "text/html;charset=utf-8"
				: isSvg
					? "image/svg+xml;charset=utf-8"
					: "text/plain;charset=utf-8",
		});
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = activeFile.name.replace(/[^\p{L}\p{N}._ -]/gu, "_");
		anchor.click();
		window.setTimeout(() => URL.revokeObjectURL(url), 0);
	};

	useEffect(() => {
		if (isStreaming) {
			wasStreamingRef.current = true;
			return;
		}
		if (!wasStreamingRef.current || !preview) return;
		wasStreamingRef.current = false;
		const frame = window.requestAnimationFrame(() => setPane("preview"));
		return () => window.cancelAnimationFrame(frame);
	}, [isStreaming, preview]);

	useEffect(() => {
		if (!isStreaming || visiblePane !== "code") return;
		const node = codeScrollRef.current;
		if (node) node.scrollTop = node.scrollHeight;
	}, [activeFile?.content, isStreaming, visiblePane]);

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
			transition={
				shouldReduceMotion
					? { duration: 0 }
					: { bounce: 0, duration: 0.26, type: "spring" }
			}
		>
			<header className="flex h-14 shrink-0 items-center gap-3 border-border/70 border-b px-3">
				<span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
					<FileCode2 aria-hidden="true" size={16} />
				</span>
				<div className="min-w-0 flex-1">
					<strong className="block truncate font-semibold text-xs tracking-[0.08em]">
						KOD · ÖNİZLE · DIFF
					</strong>
					<span className="flex items-center gap-1.5 truncate text-muted-foreground text-[0.68rem]">
						{isStreaming ? (
							<span className="relative flex size-2" aria-hidden="true">
								<span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-40" />
								<span className="relative inline-flex size-2 rounded-full bg-primary" />
							</span>
						) : null}
						<span className="truncate">
							{artifact.title} · {artifact.files.length} dosya · {isStreaming ? "gerçek akış yazılıyor" : "tamamlandı"}
						</span>
					</span>
				</div>
				<div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
					<div className="flex" role="tablist">
					<button
						aria-selected={visiblePane === "code"}
						className={cn(
							"flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs",
							visiblePane === "code"
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground",
						)}
						onClick={() => setPane("code")}
						role="tab"
						type="button"
					>
						<Code2 size={13} /> Kod
					</button>
					<button
						aria-disabled={!preview || isStreaming}
						aria-selected={visiblePane === "preview"}
						className={cn(
							"flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs",
							visiblePane === "preview"
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground",
							(!preview || isStreaming) && "cursor-not-allowed opacity-45",
						)}
						disabled={!preview || isStreaming}
						onClick={() => setPane("preview")}
						role="tab"
						type="button"
					>
						<Eye size={13} /> Önizle
					</button>
					<button
						aria-disabled={isStreaming}
						aria-selected={visiblePane === "diff"}
						className={cn(
							"flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs",
							visiblePane === "diff"
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground",
							isStreaming && "cursor-not-allowed opacity-45",
						)}
						disabled={isStreaming}
						onClick={() => setPane("diff")}
						role="tab"
						type="button"
					>
						<GitCompareArrows size={13} /> DIFF
					</button>
					</div>
					<button
						aria-label="Etkin dosyayı indir"
						className={cn(
							"flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-background hover:text-foreground",
							isStreaming && "cursor-not-allowed opacity-45",
						)}
						disabled={isStreaming || !activeFile}
						onClick={downloadActiveFile}
						title="Etkin dosyayı indir"
						type="button"
					>
						<Download size={13} />
						<span className="hidden xl:inline">İndir</span>
					</button>
				</div>
				<button
					aria-label="Kod panelini kapat"
					className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
					onClick={onClose}
					type="button"
				>
					<X size={16} />
				</button>
			</header>

			<div className="shrink-0 border-border/60 border-b bg-muted/20 px-3 py-2">
				{isStreaming ? (
					<div className="flex items-center gap-2 text-muted-foreground text-xs">
						<span className="relative flex size-2" aria-hidden="true">
							<span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-40" />
							<span className="relative inline-flex size-2 rounded-full bg-primary" />
						</span>
						Kod akıyor; bütünlük denetimi tamamlanınca çalışacak.
					</div>
				) : diagnostics.length === 0 ? (
					<div
						aria-label="Kod denetimi başarılı"
						className="flex items-center gap-2 text-emerald-600 text-xs dark:text-emerald-400"
					>
						<CircleCheck aria-hidden="true" size={14} />
						{activeFile?.name} bütünlük denetiminden geçti.
					</div>
				) : (
					<div>
						<button
							aria-expanded={diagnosticsOpen}
							className={cn(
								"flex w-full items-center gap-2 text-left text-xs",
								errorCount > 0
									? "text-rose-600 dark:text-rose-400"
									: "text-amber-600 dark:text-amber-400",
							)}
							onClick={() => setDiagnosticsOpen((current) => !current)}
							type="button"
						>
							<AlertTriangle aria-hidden="true" size={14} />
							<span className="flex-1">
								{errorCount > 0
									? `${errorCount} hata`
									: `${diagnostics.length} uyarı`} bulundu · ayrıntıları {diagnosticsOpen ? "gizle" : "göster"}
							</span>
						</button>
						{diagnosticsOpen ? (
							<ul className="mt-2 grid gap-1.5 border-border/60 border-t pt-2 text-xs">
								{diagnostics.map((diagnostic, index) => (
									<li className="flex gap-2" key={`${diagnostic.message}-${index}`}>
										<span className="font-mono text-muted-foreground">
											{diagnostic.line ? `L${diagnostic.line}` : "—"}
										</span>
										<span>{diagnostic.message}</span>
									</li>
								))}
							</ul>
						) : null}
					</div>
				)}
			</div>

			{visiblePane === "code" ? (
				<div className="flex min-h-0 flex-1 flex-col">
					<div className="flex shrink-0 items-center gap-1 overflow-x-auto border-border/60 border-b px-2 pt-2">
						{artifact.files.map((file) => (
							<button
								aria-selected={file.name === activeFile?.name}
								className={cn(
									"shrink-0 rounded-t-lg border border-transparent px-3 py-2 font-mono text-xs",
									file.name === activeFile?.name
										? "border-border border-b-background bg-background text-foreground"
										: "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
								)}
								key={file.name}
								onClick={() => setActiveFileName(file.name)}
								role="tab"
								type="button"
							>
								{file.name}
							</button>
						))}
						<button
							aria-label={copied ? "Kod kopyalandı" : "Etkin dosyayı kopyala"}
							className="ml-auto shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
							onClick={() => {
								if (!activeFile) return;
								void navigator.clipboard
									.writeText(activeFile.content)
									.then(() => setCopied(true));
							}}
							type="button"
						>
							{copied ? <Check size={14} /> : <Copy size={14} />}
						</button>
					</div>
					<pre
						aria-label={isStreaming ? "Canlı yazılan kod" : "Tamamlanan kod"}
						className="min-h-0 flex-1 overflow-auto bg-[oklch(0.17_0_0)] p-5 font-mono text-[length:var(--line-ai-code-font-size)] text-[oklch(0.92_0_0)] leading-6"
						ref={codeScrollRef}
					>
						<code className="block min-w-max">
							<HighlightedCode content={activeFile?.content ?? ""} />
						</code>
						{isStreaming ? (
							<motion.span
								animate={shouldReduceMotion ? undefined : { opacity: [1, 0.2, 1] }}
								aria-hidden="true"
								className="ml-0.5 inline-block h-[1.05em] w-[0.16em] translate-y-[0.14em] rounded-full bg-primary"
								transition={{ duration: 0.72, repeat: Number.POSITIVE_INFINITY }}
							/>
						) : null}
					</pre>
				</div>
			) : visiblePane === "diff" ? (
				<div
					aria-label={`Yerel artifact değişiklikleri: ${activeFile?.name ?? artifact.title}`}
					className="flex min-h-0 flex-1 flex-col bg-[oklch(0.17_0_0)]"
					role="region"
				>
					<div className="grid shrink-0 grid-cols-[3rem_3rem_1.5rem_minmax(0,1fr)] border-white/10 border-b bg-black/20 py-2 font-mono text-[0.68rem] text-zinc-500 uppercase tracking-wider">
						<span className="text-center">Eski</span>
						<span className="text-center">Yeni</span>
						<span />
						<span className="px-2">{activeFile?.name}</span>
					</div>
					{diffRows ? (
						<div className="min-h-0 flex-1 overflow-auto font-mono text-[length:var(--line-ai-code-font-size)] leading-6">
							<div className="min-w-max py-2">
								{diffRows.map((row, index) => (
									<DiffLine
										key={`${row.kind}-${row.oldLine}-${row.newLine}-${index}`}
										row={row}
									/>
								))}
							</div>
						</div>
					) : (
						<div className="flex flex-1 items-center justify-center p-8 text-center">
							<div className="max-w-sm">
								<GitCompareArrows
									aria-hidden="true"
									className="mx-auto mb-3 text-zinc-600"
									size={24}
								/>
								<p className="font-medium text-sm text-zinc-200">
									Karşılaştırılacak önceki sürüm yok
								</p>
								<p className="mt-1 text-xs text-zinc-500">
									İkinci kararlı artifact sürümünde değişiklikler burada
									görünecek.
								</p>
							</div>
						</div>
					)}
				</div>
			) : (
				<div className="min-h-0 flex-1 bg-[linear-gradient(45deg,var(--border)_25%,transparent_25%),linear-gradient(-45deg,var(--border)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,var(--border)_75%),linear-gradient(-45deg,transparent_75%,var(--border)_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px] p-3">
					<iframe
						className="h-full w-full rounded-xl border border-border bg-white shadow-sm"
						referrerPolicy="no-referrer"
						sandbox="allow-scripts"
						srcDoc={preview ?? ""}
						title={`${artifact.title} güvenli canlı önizlemesi`}
					/>
				</div>
			)}
		</motion.aside>
	);
};

export default CodeWorkspace;
