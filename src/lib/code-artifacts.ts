import type {
	CodeArtifact,
	CodeArtifactFile,
} from "@/components/line-ai/chat-template/chat-data";

const FENCE_PATTERN = /```([^\r\n`]*)\r?\n([\s\S]*?)```/g;
const DIFF_LANGUAGES = new Set(["diff", "patch"]);
const FILE_EXTENSION_BY_LANGUAGE: Record<string, string> = {
	bash: "sh",
	css: "css",
	html: "html",
	javascript: "js",
	js: "js",
	jsx: "jsx",
	json: "json",
	markdown: "md",
	md: "md",
	python: "py",
	py: "py",
	rust: "rs",
	rs: "rs",
	shell: "sh",
	sh: "sh",
	toml: "toml",
	tsx: "tsx",
	typescript: "ts",
	ts: "ts",
	xml: "xml",
	yaml: "yaml",
	yml: "yml",
};

const cleanFileName = (value: string) =>
	value
		.trim()
		.replace(/^['"]|['"]$/g, "")
		.replace(/\\/g, "/")
		.split("/")
		.filter(Boolean)
		.pop()
		?.replace(/[^\p{L}\p{N}._ -]/gu, "")
		.slice(0, 120) ?? "";

const inferFileName = (language: string, index: number) => {
	if (language === "html") return index === 0 ? "index.html" : `sayfa-${index + 1}.html`;
	if (language === "css") return index === 0 ? "styles.css" : `stil-${index + 1}.css`;
	if (["js", "javascript"].includes(language)) return index === 0 ? "script.js" : `script-${index + 1}.js`;
	if (["ts", "typescript"].includes(language)) return index === 0 ? "index.ts" : `dosya-${index + 1}.ts`;
	if (language === "tsx") return index === 0 ? "App.tsx" : `Bilesen-${index + 1}.tsx`;
	const extension = FILE_EXTENSION_BY_LANGUAGE[language] ?? "txt";
	return `dosya-${index + 1}.${extension}`;
};

const parseFenceInfo = (rawInfo: string, index: number) => {
	const info = rawInfo.trim();
	const language = (info.match(/^([\w.+-]+)/)?.[1] ?? "text").toLowerCase();
	const fileMatch = info.match(/(?:^|\s)(?:file|filename)=((?:"[^"]+")|(?:'[^']+')|\S+)/i);
	const colonMatch = info.match(/^[\w.+-]+:([^\s]+)$/);
	const requestedName = fileMatch?.[1] ?? colonMatch?.[1] ?? "";
	return {
		fileName: cleanFileName(requestedName) || inferFileName(language, index),
		language,
	};
};

export type ExtractedCodeArtifact = {
	artifact?: CodeArtifact;
	visibleText: string;
};

export const extractCodeArtifact = (message: string): ExtractedCodeArtifact => {
	const files: CodeArtifactFile[] = [];
	const visibleText = message
		.replace(FENCE_PATTERN, (block, rawInfo: string, rawContent: string) => {
			const parsed = parseFenceInfo(rawInfo, files.length);
			if (DIFF_LANGUAGES.has(parsed.language)) return block;
			if (!rawInfo.trim() && !rawContent.trim()) return block;
			files.push({
				content: rawContent.replace(/\r\n/g, "\n").trimEnd(),
				language: parsed.language,
				name: parsed.fileName,
			});
			return "";
		})
		.replace(/\n{3,}/g, "\n\n")
		.trim();

	if (!files.length) return { visibleText: message };
	const primary = files.find((file) => file.name.toLowerCase() === "index.html") ?? files[0];
	return {
		artifact: {
			createdAt: new Date().toISOString(),
			files,
			id: crypto.randomUUID(),
			title: primary?.name ?? "Kod çıktısı",
		},
		visibleText:
			visibleText ||
			`${files.length} kod dosyası hazırlandı. Ayrıntılar KOD · ÖNİZLE panelinde.`,
	};
};

const safeInlineScript = (content: string) => content.replace(/<\/script/gi, "<\\/script");
const safeInlineStyle = (content: string) => content.replace(/<\/style/gi, "<\\/style");

export const buildArtifactPreview = (artifact: CodeArtifact): string | null => {
	const html = artifact.files.find((file) => file.name.toLowerCase().endsWith(".html"));
	if (!html) return null;
	const styles = artifact.files
		.filter((file) => file.name.toLowerCase().endsWith(".css"))
		.map((file) => `\n<style data-line-ai-file="${file.name}">${safeInlineStyle(file.content)}</style>`)
		.join("");
	const scripts = artifact.files
		.filter((file) => /\.(?:js|mjs|cjs)$/i.test(file.name))
		.map((file) => `\n<script data-line-ai-file="${file.name}">${safeInlineScript(file.content)}</script>`)
		.join("");
	const policy =
		"default-src 'none'; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'";
	const head = `<meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width, initial-scale=1">${styles}`;
	let output = html.content;
	output = /<head[\s>]/i.test(output)
		? output.replace(/<head([^>]*)>/i, `<head$1>${head}`)
		: `${head}${output}`;
	output = /<\/body>/i.test(output)
		? output.replace(/<\/body>/i, `${scripts}</body>`)
		: `${output}${scripts}`;
	return output;
};
