import { sanitizeEvidenceValue } from "./sanitize";
import { TRACE_SCHEMA_VERSION, type TraceSession } from "./types";

const PROOF_SCHEMA_VERSION = 1 as const;
const MAX_PROOF_BYTES = 5 * 1024 * 1024;

type ProofPayload = {
	schemaVersion: typeof PROOF_SCHEMA_VERSION;
	lineAiVersion: string;
	exportedAt: string;
	session: TraceSession;
};

export type ProofBundle = ProofPayload & {
	integrity: { algorithm: "SHA-256"; hash: string };
};

const sha256 = async (value: string) => {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
};

const canonicalJson = (value: unknown): string => {
	if (Array.isArray(value)) {
		return `[${value.map(canonicalJson).join(",")}]`;
	}
	if (value && typeof value === "object") {
		return `{${Object.keys(value)
			.sort()
			.map(
				(key) =>
					`${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
			)
			.join(",")}}`;
	}
	return JSON.stringify(value);
};

const payloadOf = (bundle: ProofBundle): ProofPayload => ({
	schemaVersion: bundle.schemaVersion,
	lineAiVersion: bundle.lineAiVersion,
	exportedAt: bundle.exportedAt,
	session: bundle.session,
});

export const exportProofBundle = async (
	session: TraceSession,
	lineAiVersion: string,
): Promise<string> => {
	const payload = sanitizeEvidenceValue({
		exportedAt: new Date().toISOString(),
		lineAiVersion,
		schemaVersion: PROOF_SCHEMA_VERSION,
		session,
	}) as ProofPayload;
	const hash = await sha256(canonicalJson(payload));
	return JSON.stringify(
		{ ...payload, integrity: { algorithm: "SHA-256", hash } },
		null,
		2,
	);
};

export const parseProofBundle = async (text: string): Promise<ProofBundle> => {
	if (new TextEncoder().encode(text).byteLength > MAX_PROOF_BYTES) {
		throw new Error("proof bundle boyut sınırını aşıyor");
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error("proof bundle geçerli JSON değil");
	}
	if (!parsed || typeof parsed !== "object") {
		throw new Error("proof bundle nesnesi geçersiz");
	}
	const bundle = parsed as ProofBundle;
	if (bundle.schemaVersion !== PROOF_SCHEMA_VERSION) {
		throw new Error("desteklenmeyen proof bundle sürümü");
	}
	if (
		bundle.session?.version !== TRACE_SCHEMA_VERSION ||
		bundle.integrity?.algorithm !== "SHA-256" ||
		typeof bundle.integrity.hash !== "string"
	) {
		throw new Error("proof bundle şeması geçersiz");
	}
	const expected = await sha256(canonicalJson(payloadOf(bundle)));
	if (expected !== bundle.integrity.hash) {
		throw new Error("proof bundle bütünlük doğrulaması başarısız");
	}
	return bundle;
};
