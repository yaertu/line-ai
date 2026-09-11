const SENSITIVE_KEY =
	/(?:authorization|cookie|password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)/iu;

const STRING_REDACTIONS: Array<[RegExp, string]> = [
	[/\b(?:sk|rk|pk)-(?:project-)?[A-Za-z0-9_-]{10,}\b/gu, "[REDACTED]"],
	[
		/(\$env:[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)\s*=\s*['"])[^'"]+(['"])/giu,
		"$1[REDACTED]$2",
	],
	[
		/\b((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret)\s*[=:]\s*)[^\s,;]+/giu,
		"$1[REDACTED]",
	],
	[/(Bearer\s+)[A-Za-z0-9._~+/-]{8,}/giu, "$1[REDACTED]"],
];

export const sanitizeEvidenceText = (value: string) =>
	STRING_REDACTIONS.reduce(
		(current, [pattern, replacement]) => current.replace(pattern, replacement),
		value,
	);

export const sanitizeEvidenceValue = (value: unknown): unknown => {
	if (typeof value === "string") return sanitizeEvidenceText(value);
	if (Array.isArray(value)) return value.map(sanitizeEvidenceValue);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitizeEvidenceValue(item),
			]),
		);
	}
	return value;
};
