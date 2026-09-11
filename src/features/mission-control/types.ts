export const TRACE_SCHEMA_VERSION = 1 as const;

export type TaskType = "build" | "fix" | "research" | "audit" | "automate";

export type TraceEventType =
	| "plan"
	| "reasoning-summary"
	| "read"
	| "write"
	| "patch"
	| "search"
	| "browser"
	| "terminal"
	| "git"
	| "provider"
	| "artifact"
	| "diff"
	| "checkpoint"
	| "approval"
	| "security"
	| "test"
	| "build"
	| "verify"
	| "warning"
	| "error"
	| "result";

export type TraceEventStatus =
	| "pending"
	| "running"
	| "completed"
	| "failed"
	| "blocked"
	| "cancelled";

export type SessionStatus =
	| "running"
	| "awaiting_approval"
	| "completed"
	| "failed"
	| "blocked"
	| "interrupted";

export type ResultStatus =
	| "verified"
	| "partially_verified"
	| "unverified"
	| "failed"
	| "blocked";

export type EvidenceStatus = "passed" | "failed" | "blocked" | "unverified";

export type EvidenceKind =
	| "terminal"
	| "test"
	| "build"
	| "browser"
	| "file"
	| "diff"
	| "git"
	| "provider"
	| "artifact"
	| "checkpoint"
	| "security"
	| "network"
	| "source"
	| "approval";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type ApprovalScope =
	| "file_read"
	| "file_write"
	| "terminal"
	| "network"
	| "browser"
	| "git"
	| "external_app";

export type ApprovalState = "not_required" | "pending" | "approved" | "denied";

export type TraceEvent = {
	id: string;
	sessionId: string;
	sequence: number;
	timestamp: string;
	type: TraceEventType;
	status: TraceEventStatus;
	title: string;
	description?: string;
	provider?: string;
	model?: string;
	attempt?: number;
	tool?: string;
	command?: string;
	cwd?: string;
	files?: string[];
	urls?: string[];
	diffReference?: string;
	artifactReference?: string;
	checkpointReference?: string;
	exitCode?: number;
	stdoutPreview?: string;
	stderrPreview?: string;
	durationMs?: number;
	transferredBytes?: number;
	evidenceIds?: string[];
	risk?: RiskLevel;
	approvalState?: ApprovalState;
};

export type TraceEventInput = Omit<TraceEvent, "sequence" | "sessionId">;

export type Evidence = {
	id: string;
	kind: EvidenceKind;
	status: EvidenceStatus;
	summary: string;
	timestamp: string;
	criterionIds?: string[];
	traceEventId?: string;
	hash?: string;
	details?: unknown;
};

export type TaskPlanStatus =
	| "pending"
	| "active"
	| "completed"
	| "blocked"
	| "failed"
	| "approval_required";

export type TaskPlanItem = {
	id: string;
	label: string;
	status: TaskPlanStatus;
	traceEventIds: string[];
};

export type TraceSession = {
	version: typeof TRACE_SCHEMA_VERSION;
	id: string;
	prompt: string;
	taskType: TaskType;
	startedAt: string;
	endedAt?: string;
	status: SessionStatus;
	events: TraceEvent[];
	evidence: Evidence[];
	plan: TaskPlanItem[];
};

export type VerificationCriterion = {
	id: string;
	label: string;
	required: boolean;
};

export type VerificationResult = {
	status: ResultStatus;
	passed: number;
	total: number;
	failed: string[];
	missing: string[];
};

