import type { ApprovalScope, TaskPlanStatus } from "./types";

const WORKFLOW_VERSION = 1 as const;
const MAX_WORKFLOW_BYTES = 512 * 1024;
const MAX_STEPS = 50;
const APPROVAL_SCOPES = new Set<ApprovalScope>([
	"file_read",
	"file_write",
	"terminal",
	"network",
	"browser",
	"git",
	"external_app",
]);
const STEP_KINDS = new Set(["prompt", "terminal", "git", "browser", "checkpoint"]);

export type WorkflowStep = {
	id: string;
	title: string;
	kind: "prompt" | "terminal" | "git" | "browser" | "checkpoint";
	command?: string;
	prompt?: string;
	requiresApproval?: boolean;
};

export type LineWorkflow = {
	version: typeof WORKFLOW_VERSION;
	name: string;
	description: string;
	inputs: Array<{ id: string; label: string; required: boolean }>;
	permissions: ApprovalScope[];
	steps: WorkflowStep[];
	expectedEvidence: string[];
	successCriteria: string[];
};

const isStringArray = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((item) => typeof item === "string");

export const parseWorkflow = (text: string): LineWorkflow => {
	if (new TextEncoder().encode(text).byteLength > MAX_WORKFLOW_BYTES) {
		throw new Error("workflow boyut sınırını aşıyor");
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error("workflow geçerli JSON değil");
	}
	if (!parsed || typeof parsed !== "object") throw new Error("workflow geçersiz");
	const workflow = parsed as Partial<LineWorkflow>;
	if (workflow.version !== WORKFLOW_VERSION) {
		throw new Error("desteklenmeyen workflow sürümü");
	}
	if (typeof workflow.name !== "string" || !/^[a-z0-9][a-z0-9-]{1,79}$/u.test(workflow.name)) {
		throw new Error("workflow adı geçersiz");
	}
	if (
		!Array.isArray(workflow.permissions) ||
		workflow.permissions.some((scope) => !APPROVAL_SCOPES.has(scope))
	) {
		throw new Error("geçersiz workflow izni");
	}
	if (
		!Array.isArray(workflow.steps) ||
		workflow.steps.length === 0 ||
		workflow.steps.length > MAX_STEPS ||
		workflow.steps.some(
			(step) =>
				!step ||
				typeof step.id !== "string" ||
				typeof step.title !== "string" ||
				!STEP_KINDS.has(step.kind),
		)
	) {
		throw new Error("workflow adımları geçersiz");
	}
	if (
		!isStringArray(workflow.expectedEvidence) ||
		!isStringArray(workflow.successCriteria) ||
		!Array.isArray(workflow.inputs)
	) {
		throw new Error("workflow doğrulama alanları geçersiz");
	}
	return workflow as LineWorkflow;
};

export const runWorkflowStepState = (
	workflow: LineWorkflow,
	completedIds: string[],
): Array<{ id: string; status: TaskPlanStatus }> => {
	const next = workflow.steps.find((step) => !completedIds.includes(step.id));
	return workflow.steps.map((step) => ({
		id: step.id,
		status: completedIds.includes(step.id)
			? "completed"
			: step.id !== next?.id
				? "pending"
				: step.requiresApproval
					? "approval_required"
					: "active",
	}));
};

