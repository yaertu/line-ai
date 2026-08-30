import { describe, expect, it } from "vitest";
import { buildArtifactPreview, extractCodeArtifact } from "./code-artifacts";

describe("extractCodeArtifact", () => {
	it("dosyalı kod bloklarını sohbet metninden ayırır", () => {
		const result = extractCodeArtifact(
			"Hazır.\n\n```html file=index.html\n<h1>Merhaba</h1>\n```\n```css file=styles.css\nh1 { color: red; }\n```",
		);
		expect(result.visibleText).toBe("Hazır.");
		expect(result.artifact?.files.map((file) => file.name)).toEqual([
			"index.html",
			"styles.css",
		]);
	});

	it("diff bloklarını mesajda bırakır", () => {
		const result = extractCodeArtifact("```diff\n-old\n+new\n```");
		expect(result.artifact).toBeUndefined();
		expect(result.visibleText).toContain("+new");
	});

	it("önizlemeyi ağsız CSP ve yerel stillerle üretir", () => {
		const result = extractCodeArtifact(
			"```html file=index.html\n<html><body><main>Test</main></body></html>\n```\n```css file=styles.css\nmain{color:red}\n```",
		);
		const preview = buildArtifactPreview(result.artifact!);
		expect(preview).toContain("connect-src 'none'");
		expect(preview).toContain("main{color:red}");
	});
});
