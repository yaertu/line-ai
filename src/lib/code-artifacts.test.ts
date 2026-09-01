import { describe, expect, it } from "vitest";
import {
	buildArtifactPreview,
	extractCodeArtifact,
	extractStreamingCodeArtifact,
} from "./code-artifacts";

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
		expect(preview).toMatch(/^<!doctype html>/i);
	});

	it("doctype içermeyen tam HTML belgesini güvenli önizleme için normalize eder", () => {
		const result = extractCodeArtifact(
			"```html file=index.html\n<html lang=\"tr\"><head><title>Oyuncu</title></head><body><main>Hafıza</main></body></html>\n```",
		);
		const preview = buildArtifactPreview(result.artifact!);
		expect(preview).toMatch(/^<!doctype html>/i);
		expect(preview).toContain("Content-Security-Policy");
		expect(preview).toContain("<main>Hafıza</main>");
	});

	it("HTML parçasını ağ erişimi kapalı tam belgeye sarar", () => {
		const result = extractCodeArtifact(
			"```html file=index.html\n<section>Önizleme</section>\n```",
		);
		const preview = buildArtifactPreview(result.artifact!);
		expect(preview).toMatch(/^<!doctype html><html><head>/i);
		expect(preview).toContain("<body><section>Önizleme</section>");
	});

	it("SVG logo artifact'ını sohbet kodu yerine ağsız görsel önizlemeye dönüştürür", () => {
		const result = extractCodeArtifact(
			"Logo hazır.\n```svg file=line-ai-logo.svg\n<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><title>Line AI</title><circle cx=\"32\" cy=\"32\" r=\"28\" fill=\"#5eead4\"/></svg>\n```",
		);
		const preview = buildArtifactPreview(result.artifact!);

		expect(result.visibleText).toBe("Logo hazır.");
		expect(result.artifact?.files[0]?.name).toBe("line-ai-logo.svg");
		expect(preview).toMatch(/^<!doctype html>/i);
		expect(preview).toContain("connect-src 'none'");
		expect(preview).toContain("data:image/svg+xml;charset=utf-8,");
		expect(preview).toContain("%3Csvg");
		expect(preview).not.toContain("<svg xmlns=");
	});

	it("yalnız SVG artifact geldiğinde sohbeti kod mesajıyla doldurmaz", () => {
		const result = extractCodeArtifact(
			"```svg file=line-ai-logo.svg\n<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"></svg>\n```",
		);

		expect(result.visibleText).toBe(
			"SVG görsel hazırlandı. ÖNİZLE panelinden görüntüleyip indirebilirsiniz.",
		);
		expect(result.visibleText).not.toContain("kod");
	});

	it("kapanmamış kod bloğunu gerçek delta içeriğiyle canlı çalışma alanına taşır", () => {
		const artifact = extractStreamingCodeArtifact(
			"Plan hazır.\n```html file=index.html\n<!doctype html>\n<h1>Oyuncu",
		);
		expect(artifact?.id).toBe("line-ai-live-code");
		expect(artifact?.files).toEqual([
			expect.objectContaining({
				content: "<!doctype html>\n<h1>Oyuncu",
				language: "html",
				name: "index.html",
			}),
		]);
	});

	it("canlı akışta tamamlanan ve devam eden birden çok dosyayı birlikte okur", () => {
		const artifact = extractStreamingCodeArtifact(
			"```html file=index.html\n<main></main>\n```\n```css file=styles.css\nmain { color: cyan;",
		);
		expect(artifact?.files.map((file) => file.name)).toEqual([
			"index.html",
			"styles.css",
		]);
		expect(artifact?.files[1]?.content).toBe("main { color: cyan;");
	});

	it("diff deltalarını canlı kod çalışma alanına taşımaz", () => {
		expect(
			extractStreamingCodeArtifact("```diff\n-old\n+new"),
		).toBeUndefined();
	});
});
