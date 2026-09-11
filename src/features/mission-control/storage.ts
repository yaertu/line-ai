import { TRACE_SCHEMA_VERSION, type TraceEvent, type TraceSession } from "./types";

export const TRACE_STORAGE_KEY = "line-ai.trace-sessions.v1";
const MAX_STORED_SESSIONS = 50;

const isTraceSession = (value: unknown): value is TraceSession => {
	if (!value || typeof value !== "object") return false;
	const item = value as Partial<TraceSession>;
	return (
		item.version === TRACE_SCHEMA_VERSION &&
		typeof item.id === "string" &&
		typeof item.prompt === "string" &&
		typeof item.startedAt === "string" &&
		Array.isArray(item.events) &&
		Array.isArray(item.evidence) &&
		Array.isArray(item.plan)
	);
};

const recoverInterruptedSession = (session: TraceSession): TraceSession => {
	if (session.status !== "running" && session.status !== "awaiting_approval") {
		return session;
	}
	const warning: TraceEvent = {
		id: `interrupted-${session.id}`,
		sessionId: session.id,
		sequence: session.events.length + 1,
		status: "blocked",
		timestamp: new Date().toISOString(),
		title: "Oturum beklenmedik şekilde kesildi",
		type: "warning",
	};
	return {
		...session,
		status: "interrupted",
		events: [...session.events, warning],
	};
};

export const loadSessions = (): TraceSession[] => {
	try {
		const parsed = JSON.parse(localStorage.getItem(TRACE_STORAGE_KEY) ?? "[]");
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isTraceSession).map(recoverInterruptedSession);
	} catch {
		return [];
	}
};

export const saveSession = (session: TraceSession) => {
	const stored = loadSessions().filter((item) => item.id !== session.id);
	localStorage.setItem(
		TRACE_STORAGE_KEY,
		JSON.stringify([session, ...stored].slice(0, MAX_STORED_SESSIONS)),
	);
};

