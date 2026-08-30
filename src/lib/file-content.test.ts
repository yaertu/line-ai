import { describe, expect, it } from "vitest";
import {
	decodeTextBytes,
	looksLikeBinary,
	mimeTypeForFile,
} from "./file-content";

describe("file content classification", () => {
	it("accepts unknown extensions when their content is UTF-8 text", () => {
		const bytes = new TextEncoder().encode("query Viewer { viewer { id } }");

		expect(looksLikeBinary(bytes)).toBe(false);
		expect(decodeTextBytes(bytes)).toContain("query Viewer");
		expect(mimeTypeForFile("schema.graphql", "", false)).toBe("text/plain");
	});

	it("decodes UTF-16 little-endian files with a BOM", () => {
		const bytes = new Uint8Array([
			0xff, 0xfe, 0x54, 0x00, 0xfc, 0x00, 0x72, 0x00, 0x6b, 0x00, 0xe7, 0x00,
			0x65, 0x00,
		]);

		expect(looksLikeBinary(bytes)).toBe(false);
		expect(decodeTextBytes(bytes)).toBe("Türkçe");
	});

	it("classifies common binary signatures without exposing their bytes as text", () => {
		const png = new Uint8Array([
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
		]);

		expect(looksLikeBinary(png)).toBe(true);
		expect(mimeTypeForFile("image.png", "", true)).toBe("image/png");
	});

	it("keeps a UTF-8 preview when truncation cuts the final code point", () => {
		const complete = new TextEncoder().encode("metin €");
		const truncated = complete.subarray(0, complete.length - 1);

		expect(decodeTextBytes(truncated, true)).toBe("metin ");
	});
});
