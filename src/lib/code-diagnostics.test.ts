import { describe, expect, it } from "vitest";
import { inspectCodeFile } from "./code-diagnostics";

describe("inspectCodeFile", () => {
	it("accepts a structurally complete HTML document", () => {
		expect(
			inspectCodeFile({
				content:
					'<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body><main id="app"></main></body></html>',
				language: "html",
				name: "index.html",
			}),
		).toEqual([]);
	});

	it("reports duplicate ids and mismatched HTML tags", () => {
		const diagnostics = inspectCodeFile({
			content:
				'<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body><main id="app"><section id="app"></main></body></html>',
			language: "html",
			name: "index.html",
		});
		expect(diagnostics.some((item) => item.message.includes("Yinelenen id"))).toBe(
			true,
		);
		expect(diagnostics.some((item) => item.message.includes("kapanmadan"))).toBe(
			true,
		);
	});

	it("reports invalid JSON", () => {
		const diagnostics = inspectCodeFile({
			content: '{"name": }',
			language: "json",
			name: "package.json",
		});
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]?.severity).toBe("error");
	});
});
