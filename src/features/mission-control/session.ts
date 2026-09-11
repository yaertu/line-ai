import { sanitizeEvidenceValue } from "./sanitize";
import {
	TRACE_SCHEMA_VERSION,
	type Evidence,
	type SessionStatus,
	type TaskType,
	type TraceEventInput,
	type TraceSession,
} from "./types";

const TERMINAL_SESSION_STATUSES = new Set<SessionStatus>([
	"completed",
	"failed",
	"blocked",
	"interrupted",
]);

const ALLOWED_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
	running: ["awaiting_approval", "completed", "failed", "blocked", "interrupted"],
	awaiting_approval: ["running", "failed", "blocked", "interrupted"],
	completed: [],
	failed: [],
	blocked: [],
	interrupted: ["running", "failed", "blocked"],
};

export const createTraceSession = ({
	id,
	prompt,
	startedAt,
	taskType,
}: {
	id: string;
	prompt: string;
	startedAt: string;
	taskType: TaskType;
}): TraceSession => ({
	version: TRACE_SCHEMA_VERSION,
	id,
	prompt,
	taskType,
	startedAt,
	status: "running",
	events: [],
	evidence: [],
	plan: [],
});

export const transitionSession = (
	session: TraceSession,
	status: SessionStatus,
	metadata: { endedAt?: string } = {},
): TraceSession => {
	if (session.status === status) return session;
	if (!ALLOWED_TRANSITIONS[session.status].includes(status)) {
		throw new Error(`${session.status} durumundan ${status} durumuna geçilemez`);
	}
	return {
		...session,
		...metadata,
		status,
	};
};

export const appendTraceEvent = (
	session: TraceSession,
	event: TraceEventInput,
): TraceSession => {
	if (TERMINAL_SESSION_STATUSES.has(session.status)) {
		throw new Error(`${session.status} oturumuna yeni Trace olayı eklenemez`);
	}
	const next = {
		...event,
		sessionId: session.id,
		sequence: session.events.length + 1,
	};
	return {
		...session,
		events: [...session.events, next],
		status:
			event.status === "failed"
				? "failed"
				: event.status === "blocked"
					? "blocked"
					: session.status,
	};
};

export const appendEvidence = (
	session: TraceSession,
	evidence: Evidence,
): TraceSession => ({
	...session,
	evidence: [
		...session.evidence,
		{
			...evidence,
			details: sanitizeEvidenceValue(evidence.details),
			summary: sanitizeEvidenceValue(evidence.summary) as string,
		},
	],
});

