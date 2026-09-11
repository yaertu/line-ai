import type { TaskPlanItem, TaskPlanStatus, TaskType, TraceEvent } from "./types";

export type TaskDefinition = {
	id: TaskType;
	code: Uppercase<TaskType>;
	label: string;
	description: string;
	promptHeading: string;
	fallbackRequest: string;
};

export const TASK_DEFINITIONS = {
	build: {
		id: "build",
		code: "BUILD",
		label: "Oluştur",
		description: "Yeni bir özellik, ekran veya çıktı oluştur.",
		promptHeading: "Oluşturma görevi",
		fallbackRequest: "Oluşturulacak kapsam belirtilmedi.",
	},
	fix: {
		id: "fix",
		code: "FIX",
		label: "Düzelt",
		description: "Bir hatayı bul, düzelt ve doğrula.",
		promptHeading: "Hata düzeltme görevi",
		fallbackRequest: "Düzeltilecek sorun belirtilmedi.",
	},
	research: {
		id: "research",
		code: "RESEARCH",
		label: "Araştır",
		description: "Bir konuyu kanıtlarıyla araştır ve bulguları sun.",
		promptHeading: "Araştırma görevi",
		fallbackRequest: "Araştırılacak konu belirtilmedi.",
	},
	audit: {
		id: "audit",
		code: "AUDIT",
		label: "Denetle",
		description: "Mevcut işi incele, riskleri ve doğrulama kanıtını raporla.",
		promptHeading: "Denetim görevi",
		fallbackRequest: "İncelenecek kapsam belirtilmedi.",
	},
	automate: {
		id: "automate",
		code: "AUTOMATE",
		label: "Otomatikleştir",
		description: "Tekrarlanan bir süreci güvenli ve doğrulanabilir hale getir.",
		promptHeading: "Otomasyon görevi",
		fallbackRequest: "Otomatikleştirilecek süreç belirtilmedi.",
	},
} as const satisfies Record<TaskType, TaskDefinition>;

const MAX_PROMPT_LENGTH = 12_000;

const removeControlCharacters = (value: string): string =>
	Array.from(value, (character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		return (codePoint < 32 && codePoint !== 9 && codePoint !== 10 && codePoint !== 13) ||
			codePoint === 127
			? " "
			: character;
	}).join("");

const toPlainText = (value: unknown): string | undefined => {
	if (typeof value !== "string") return undefined;
	const source = value.slice(0, MAX_PROMPT_LENGTH);
	const parsed = new DOMParser().parseFromString(source, "text/html");
	const plainText = removeControlCharacters(parsed.body.textContent ?? "")
		.replace(/\s+/gu, " ")
		.trim();
	return plainText || undefined;
};

/**
 * Prepares a bounded, plain-text request for the task runner. It deliberately
 * avoids passing markup or object serialization into the task prompt.
 */
export const prepareTaskPrompt = (taskType: TaskType, request: unknown): string => {
	const definition = TASK_DEFINITIONS[taskType];
	const taskRequest = toPlainText(request) ?? definition.fallbackRequest;

	return [
		definition.promptHeading,
		"",
		"İstek:",
		taskRequest,
		"",
		"Bu isteği uygula; gerçek olayları ve doğrulanmış kanıtları raporla.",
	].join("\n");
};

export type TaskPlanAction = {
	type: "trace_event";
	planItemId: string;
	event: TraceEvent;
};

const TERMINAL_PLAN_STATUSES = new Set<TaskPlanStatus>([
	"completed",
	"blocked",
	"failed",
]);

const isTransitionAllowed = (
	from: TaskPlanStatus,
	to: TaskPlanStatus,
): boolean => {
	if (TERMINAL_PLAN_STATUSES.has(from)) return false;
	if (from === "pending") {
		return to === "active" || to === "blocked" || to === "failed" || to === "approval_required";
	}
	if (from === "active") {
		return to === "completed" || to === "blocked" || to === "failed" || to === "approval_required";
	}
	return to === "active" || to === "blocked" || to === "failed";
};

const statusFromTraceEvent = (
	current: TaskPlanStatus,
	event: TraceEvent,
): TaskPlanStatus | undefined => {
	if (event.type === "approval") {
		if (event.approvalState === "pending") return "approval_required";
		if (event.approvalState === "approved" && current === "approval_required" && event.status === "running") {
			return "active";
		}
		if (event.approvalState === "denied") return "blocked";
		return undefined;
	}

	if (event.status === "running") return "active";
	if (event.status === "completed") return "completed";
	if (event.status === "blocked") return "blocked";
	if (event.status === "failed") return "failed";
	return undefined;
};

/**
 * Applies one recorded trace event to one plan item. Completion is never
 * inferred: an item can only become completed from active on a completed event.
 */
export const reduceTaskPlan = (
	plan: TaskPlanItem[],
	action: TaskPlanAction,
): TaskPlanItem[] => {
	const { event, planItemId } = action;
	if (!event.id.trim()) return plan;
	const item = plan.find((candidate) => candidate.id === planItemId);
	if (!item || item.traceEventIds.includes(event.id)) return plan;

	const nextStatus = statusFromTraceEvent(item.status, event);
	if (!nextStatus || !isTransitionAllowed(item.status, nextStatus)) return plan;

	return plan.map((candidate) =>
		candidate.id !== planItemId
			? candidate
			: {
				...candidate,
				status: nextStatus,
				traceEventIds: [...candidate.traceEventIds, event.id],
			},
	);
};
