import { describe, expect, it } from "vitest";
import {
	TASK_DEFINITIONS,
	prepareTaskPrompt,
	reduceTaskPlan,
} from "./task-types";
import type { TaskPlanItem, TraceEvent } from "./types";

const event = (
	id: string,
	status: TraceEvent["status"],
	overrides: Partial<TraceEvent> = {},
): TraceEvent => ({
	id,
	sessionId: "session-1",
	sequence: 1,
	status,
	timestamp: "2026-09-11T12:00:00.000Z",
	title: "Gerçek çalışma olayı",
	type: "terminal",
	...overrides,
});

const plan = (status: TaskPlanItem["status"] = "pending"): TaskPlanItem[] => [
	{ id: "inspect", label: "Projeyi incele", status, traceEventIds: [] },
];

describe("görev tanımları", () => {
	it("BUILD, FIX, RESEARCH, AUDIT ve AUTOMATE için Türkçe tanımlar sağlar", () => {
		expect(Object.keys(TASK_DEFINITIONS)).toEqual([
			"build",
			"fix",
			"research",
			"audit",
			"automate",
		]);
		expect(TASK_DEFINITIONS.build.label).toBe("Oluştur");
		expect(TASK_DEFINITIONS.fix.label).toBe("Düzelt");
		expect(TASK_DEFINITIONS.research.label).toBe("Araştır");
		expect(TASK_DEFINITIONS.audit.label).toBe("Denetle");
		expect(TASK_DEFINITIONS.automate.label).toBe("Otomatikleştir");
	});

	it("görev istemini düz metne indirger ve boş/uygunsuz girdi için güvenli varsayılanı kullanır", () => {
		const prepared = prepareTaskPrompt("fix", "  <b>Giriş</b> akışını düzelt  ");

		expect(prepared).toContain("Hata düzeltme görevi");
		expect(prepared).toContain("Giriş akışını düzelt");
		expect(prepared).not.toContain("<b>");
		expect(prepareTaskPrompt("audit", { instruction: "çalıştır" })).toContain(
			"İncelenecek kapsam belirtilmedi.",
		);
	});
});

describe("trace destekli plan reducer'ı", () => {
	it("yalnız gerçek bir running olayla pending adımı active yapar", () => {
		const next = reduceTaskPlan(plan(), {
			event: event("trace-running", "running"),
			planItemId: "inspect",
			type: "trace_event",
		});

		expect(next).toEqual([
			{
				id: "inspect",
				label: "Projeyi incele",
				status: "active",
				traceEventIds: ["trace-running"],
			},
		]);
	});

	it("synthetic tamamlanmayı reddeder; completed olay yalnız active adımdan sonra geçerlidir", () => {
		const pending = reduceTaskPlan(plan(), {
			event: event("trace-completed", "completed"),
			planItemId: "inspect",
			type: "trace_event",
		});
		expect(pending).toEqual(plan());

		const active = reduceTaskPlan(plan(), {
			event: event("trace-running", "running"),
			planItemId: "inspect",
			type: "trace_event",
		});
		const completed = reduceTaskPlan(active, {
			event: event("trace-completed", "completed"),
			planItemId: "inspect",
			type: "trace_event",
		});
		expect(completed[0]).toMatchObject({
			status: "completed",
			traceEventIds: ["trace-running", "trace-completed"],
		});
	});

	it("approval olaylarıyla bekletir, onaydan sonra çalıştırır ve terminal durumlara geri dönmez", () => {
		const waiting = reduceTaskPlan(plan(), {
			event: event("approval-pending", "pending", {
				approvalState: "pending",
				type: "approval",
			}),
			planItemId: "inspect",
			type: "trace_event",
		});
		expect(waiting[0]).toMatchObject({ status: "approval_required" });

		const active = reduceTaskPlan(waiting, {
			event: event("approval-approved", "running", {
				approvalState: "approved",
				type: "approval",
			}),
			planItemId: "inspect",
			type: "trace_event",
		});
		expect(active[0]).toMatchObject({ status: "active" });

		const failed = reduceTaskPlan(active, {
			event: event("trace-failed", "failed"),
			planItemId: "inspect",
			type: "trace_event",
		});
		expect(failed[0]).toMatchObject({ status: "failed" });
		expect(
			reduceTaskPlan(failed, {
				event: event("late-running", "running"),
				planItemId: "inspect",
				type: "trace_event",
			}),
		).toEqual(failed);
	});

	it("bilinmeyen plan adımını ve yinelenen trace olayını değiştirmeden bırakır", () => {
		const started = reduceTaskPlan(plan(), {
			event: event("trace-running", "running"),
			planItemId: "inspect",
			type: "trace_event",
		});

		expect(
			reduceTaskPlan(started, {
				event: event("missing", "running"),
				planItemId: "missing",
				type: "trace_event",
			}),
		).toEqual(started);
		expect(
			reduceTaskPlan(started, {
				event: event("trace-running", "running"),
				planItemId: "inspect",
				type: "trace_event",
			}),
		).toEqual(started);
	});
});
