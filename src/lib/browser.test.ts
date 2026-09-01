import { describe, expect, it } from "vitest";
import { parseBrowserIntent } from "@/lib/browser";

describe("parseBrowserIntent", () => {
	it("parses explicit read-only and mutating browser commands", () => {
		expect(parseBrowserIntent("/browser oku")).toMatchObject({
			direct: true,
			kind: "tool",
			request: { action: "read_page" },
		});
		expect(parseBrowserIntent("/browser tıkla #submit")).toMatchObject({
			request: { action: "click", selector: "#submit" },
		});
		expect(
			parseBrowserIntent("/browser yaz input[name=q] :: Line AI"),
		).toMatchObject({
			request: { action: "type", selector: "input[name=q]", text: "Line AI" },
		});
	});

	it("detects natural read-only URL inspection", () => {
		expect(
			parseBrowserIntent("https://example.com sayfasını incele"),
		).toMatchObject({
			direct: false,
			kind: "tool",
			request: { action: "open_url", url: "https://example.com" },
		});
	});

	it("does not infer page mutation from ordinary chat", () => {
		expect(parseBrowserIntent("Giriş düğmesine tıklar mısın?")).toEqual({
			kind: "none",
		});
	});

	it("reports unsupported explicit commands instead of pretending to show status", () => {
		expect(parseBrowserIntent("/browser bilinmeyen")).toMatchObject({
			direct: true,
			kind: "invalid",
		});
	});
});
