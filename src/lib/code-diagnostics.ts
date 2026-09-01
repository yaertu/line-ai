import type { CodeArtifactFile } from "@/components/line-ai/chat-template/chat-data";

export type CodeDiagnostic = {
	line?: number;
	message: string;
	severity: "error" | "warning";
};

const lineAt = (source: string, offset: number) =>
	source.slice(0, offset).split("\n").length;

const VOID_TAGS = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
]);

const checkHtml = (source: string): CodeDiagnostic[] => {
	const diagnostics: CodeDiagnostic[] = [];
	if (!/^\s*<!doctype\s+html/i.test(source)) {
		diagnostics.push({
			line: 1,
			message: "HTML5 doctype bildirimi eksik.",
			severity: "warning",
		});
	}
	for (const tag of ["html", "head", "body"] as const) {
		if (!new RegExp(`<${tag}(?:\\s|>)`, "i").test(source)) {
			diagnostics.push({
				message: `<${tag}> kök bölümü bulunamadı.`,
				severity: "warning",
			});
		}
	}
	if (!/<meta\s+[^>]*name=["']viewport["']/i.test(source)) {
		diagnostics.push({
			message: "Mobil görünüm için viewport meta etiketi eksik.",
			severity: "warning",
		});
	}

	const ids = new Map<string, number>();
	for (const match of source.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)) {
		const id = match[1];
		if (!id) continue;
		if (ids.has(id)) {
			diagnostics.push({
				line: lineAt(source, match.index),
				message: `Yinelenen id değeri: ${id}`,
				severity: "error",
			});
		} else {
			ids.set(id, match.index);
		}
	}

	const sanitized = source
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(
			/<(script|style)\b([^>]*)>[\s\S]*?<\/\1>/gi,
			(_block, tag: string, attributes: string) =>
				`<${tag}${attributes}></${tag}>`,
		);
	const stack: Array<{ name: string; line: number }> = [];
	for (const match of sanitized.matchAll(/<\/?([a-z][\w:-]*)\b[^>]*>/gi)) {
		const raw = match[0];
		const name = (match[1] ?? "").toLowerCase();
		if (!name || raw.startsWith("<!") || raw.startsWith("<?")) continue;
		const closing = /^<\//.test(raw);
		const selfClosing = /\/>$/.test(raw) || VOID_TAGS.has(name);
		if (!closing && !selfClosing) {
			stack.push({ name, line: lineAt(sanitized, match.index) });
			continue;
		}
		if (!closing) continue;
		const opened = stack.at(-1);
		if (!opened) {
			diagnostics.push({
				line: lineAt(sanitized, match.index),
				message: `Eşleşmeyen kapanış etiketi: </${name}>`,
				severity: "error",
			});
			continue;
		}
		if (opened.name !== name) {
			diagnostics.push({
				line: lineAt(sanitized, match.index),
				message: `<${opened.name}> kapanmadan </${name}> bulundu.`,
				severity: "error",
			});
			const matchingIndex = stack.map((item) => item.name).lastIndexOf(name);
			if (matchingIndex >= 0) stack.splice(matchingIndex);
			continue;
		}
		stack.pop();
	}
	for (const opened of stack.slice(-8)) {
		diagnostics.push({
			line: opened.line,
			message: `Kapanmayan etiket: <${opened.name}>`,
			severity: "error",
		});
	}
	return diagnostics;
};

const checkBalancedBrackets = (source: string): CodeDiagnostic[] => {
	const stripped = source.replace(
		/\/\*[\s\S]*?\*\/|\/\/[^\n]*|`(?:\\.|[^`])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
		"",
	);
	const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
	const stack: Array<{ bracket: string; index: number }> = [];
	for (let index = 0; index < stripped.length; index += 1) {
		const character = stripped[index] ?? "";
		if (["(", "[", "{"].includes(character)) {
			stack.push({ bracket: character, index });
		} else if (pairs[character]) {
			const opened = stack.pop();
			if (!opened || opened.bracket !== pairs[character]) {
				return [
					{
						line: lineAt(stripped, index),
						message: `Eşleşmeyen ${character} işareti.`,
						severity: "error",
					},
				];
			}
		}
	}
	const opened = stack.at(-1);
	return opened
		? [
				{
					line: lineAt(stripped, opened.index),
					message: `Kapanmayan ${opened.bracket} işareti.`,
					severity: "error",
				},
			]
		: [];
};

export const inspectCodeFile = (file?: CodeArtifactFile): CodeDiagnostic[] => {
	if (!file || !file.content.trim()) {
		return [{ message: "Dosya içeriği boş.", severity: "warning" }];
	}
	const extension = file.name.split(".").pop()?.toLowerCase();
	if (extension === "html" || file.language === "html") {
		return checkHtml(file.content);
	}
	if (extension === "json" || file.language === "json") {
		try {
			JSON.parse(file.content);
			return [];
		} catch (error) {
			return [
				{
					message:
						error instanceof Error ? error.message : "JSON ayrıştırılamadı.",
					severity: "error",
				},
			];
		}
	}
	if (
		["css", "js", "jsx", "ts", "tsx"].includes(extension ?? "") ||
		["css", "javascript", "js", "jsx", "typescript", "ts", "tsx"].includes(
			file.language,
		)
	) {
		return checkBalancedBrackets(file.content);
	}
	return [];
};
