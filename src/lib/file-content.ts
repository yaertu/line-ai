export type FileContentKind = "binary" | "text";

export type BrowserFilePreview = {
	content: string;
	contentKind: FileContentKind;
	mimeType: string;
	truncated: boolean;
};

const BINARY_MAGIC: ReadonlyArray<ReadonlyArray<number>> = [
	[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
	[0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
	[0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
	[0x25, 0x50, 0x44, 0x46, 0x2d],
	[0x50, 0x4b, 0x03, 0x04],
	[0x4d, 0x5a],
	[0x7f, 0x45, 0x4c, 0x46],
];

const extensionOf = (name: string) =>
	name.includes(".")
		? (name.split(".").pop()?.toLocaleLowerCase("en-US") ?? "")
		: "";

const startsWithBytes = (bytes: Uint8Array, signature: ReadonlyArray<number>) =>
	bytes.length >= signature.length &&
	signature.every((value, index) => bytes[index] === value);

export const looksLikeBinary = (bytes: Uint8Array) => {
	if (bytes.length === 0) return false;
	if (
		startsWithBytes(bytes, [0xef, 0xbb, 0xbf]) ||
		startsWithBytes(bytes, [0xff, 0xfe]) ||
		startsWithBytes(bytes, [0xfe, 0xff])
	) {
		return false;
	}
	if (BINARY_MAGIC.some((signature) => startsWithBytes(bytes, signature)))
		return true;

	const sample = bytes.subarray(0, Math.min(bytes.length, 8 * 1024));
	let controls = 0;
	for (const byte of sample) {
		if (byte === 0 || byte < 0x08 || (byte > 0x0d && byte < 0x20))
			controls += 1;
	}
	return controls * 100 > sample.length * 3;
};

const decodeUtf16 = (bytes: Uint8Array, littleEndian: boolean) => {
	const length = Math.floor(bytes.byteLength / 2);
	const units = new Uint16Array(length);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	for (let index = 0; index < length; index += 1) {
		units[index] = view.getUint16(index * 2, littleEndian);
	}
	return String.fromCharCode(...units);
};

export const decodeTextBytes = (
	bytes: Uint8Array,
	tolerateTrailingTruncation = false,
): string | null => {
	try {
		if (startsWithBytes(bytes, [0xef, 0xbb, 0xbf])) {
			return new TextDecoder("utf-8", { fatal: true }).decode(
				bytes.subarray(3),
			);
		}
		if (startsWithBytes(bytes, [0xff, 0xfe]))
			return decodeUtf16(bytes.subarray(2), true);
		if (startsWithBytes(bytes, [0xfe, 0xff]))
			return decodeUtf16(bytes.subarray(2), false);
		try {
			return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		} catch {
			if (!tolerateTrailingTruncation) return null;
			return new TextDecoder("utf-8").decode(bytes).replace(/�$/, "");
		}
	} catch {
		return null;
	}
};

export const mimeTypeForFile = (
	name: string,
	browserMime: string,
	binary: boolean,
) => {
	if (browserMime) return browserMime;
	const extension = extensionOf(name);
	const mimeTypes: Record<string, string> = {
		cjs: "text/javascript",
		css: "text/css",
		csv: "text/csv",
		cts: "text/typescript",
		gif: "image/gif",
		gz: "application/gzip",
		htm: "text/html",
		html: "text/html",
		jpeg: "image/jpeg",
		jpg: "image/jpeg",
		js: "text/javascript",
		json: "application/json",
		jsonl: "application/x-ndjson",
		jsx: "text/javascript",
		mjs: "text/javascript",
		mp3: "audio/mpeg",
		mp4: "video/mp4",
		mts: "text/typescript",
		ndjson: "application/x-ndjson",
		pdf: "application/pdf",
		png: "image/png",
		svg: "application/xml",
		toml: "application/toml",
		ts: "text/typescript",
		tsx: "text/typescript",
		wav: "audio/wav",
		webp: "image/webp",
		xml: "application/xml",
		yaml: "application/yaml",
		yml: "application/yaml",
		zip: "application/zip",
	};
	return (
		mimeTypes[extension] ?? (binary ? "application/octet-stream" : "text/plain")
	);
};

export const readBrowserFilePreview = async (
	file: File,
	maxContextBytes: number,
): Promise<BrowserFilePreview> => {
	const bytes = new Uint8Array(
		await file.slice(0, maxContextBytes).arrayBuffer(),
	);
	const binary = looksLikeBinary(bytes);
	const decoded = binary
		? null
		: decodeTextBytes(bytes, file.size > maxContextBytes);
	const contentKind: FileContentKind =
		decoded === null && file.size > 0 ? "binary" : "text";
	return {
		content: contentKind === "text" ? (decoded ?? "") : "",
		contentKind,
		mimeType: mimeTypeForFile(file.name, file.type, contentKind === "binary"),
		truncated: contentKind === "text" && file.size > maxContextBytes,
	};
};
