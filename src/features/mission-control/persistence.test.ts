import { beforeEach, describe, expect, it } from "vitest";
import { createTraceSession } from "./session";
import { loadSessions, saveSession, TRACE_STORAGE_KEY } from "./storage";
import { exportProofBundle, parseProofBundle } from "./proof-bundle";
import { upsertMemoryItem } from "./memory";
import { parseWorkflow, runWorkflowStepState } from "./workflow";

const session = () =>
	createTraceSession({
		id: "session-storage",
		prompt: "Sakla",
		startedAt: "2026-09-11T11:00:00.000Z",
		taskType: "build",
	});

beforeEach(() => localStorage.clear());

describe("Trace persistence", () => {
	it("v0.4 sohbet anahtarını değiştirmeden oturumu ayrı anahtarda saklar", () => {
		localStorage.setItem("line-ai.conversations.v1", "user-history");

		saveSession(session());

		expect(localStorage.getItem("line-ai.conversations.v1")).toBe(
			"user-history",
		);
		expect(JSON.parse(localStorage.getItem(TRACE_STORAGE_KEY) ?? "[]")).toHaveLength(
			1,
		);
	});

	it("uygulama kapanırken çalışan kalmış oturumu Interrupted olarak kurtarır", () => {
		saveSession(session());

		const [recovered] = loadSessions();

		expect(recovered.status).toBe("interrupted");
		expect(recovered.events.at(-1)).toMatchObject({
			status: "blocked",
			title: "Oturum beklenmedik şekilde kesildi",
			type: "warning",
		});
	});

	it("bozuk ve bilinmeyen sürümlü kayıtları yüklemez", () => {
		localStorage.setItem(TRACE_STORAGE_KEY, '[{"version":99}]');
		expect(loadSessions()).toEqual([]);
		localStorage.setItem(TRACE_STORAGE_KEY, "not-json");
		expect(loadSessions()).toEqual([]);
	});
});

describe("Proof Bundle", () => {
	it("secret'ları temizleyip SHA-256 bütünlük alanıyla dışa aktarır", async () => {
		const source = session();
		source.evidence.push({
			details: { authorization: "Bearer secret-token-123" },
			id: "e-secret",
			kind: "terminal",
			status: "passed",
			summary: "token=abc123456789",
			timestamp: "2026-09-11T11:01:00.000Z",
		});

		const text = await exportProofBundle(source, "0.5.0");
		const bundle = await parseProofBundle(text);

		expect(text).not.toContain("secret-token-123");
		expect(text).not.toContain("abc123456789");
		expect(bundle.integrity).toMatchObject({ algorithm: "SHA-256" });
		expect(bundle.session.id).toBe("session-storage");
	});

	it("değiştirilmiş ve desteklenmeyen proof bundle'ı reddeder", async () => {
		const text = await exportProofBundle(session(), "0.5.0");
		await expect(
			parseProofBundle(text.replace("Sakla", "Değiştirildi")),
		).rejects.toThrow("bütünlük doğrulaması başarısız");
		await expect(
			parseProofBundle(text.replace('"schemaVersion": 1', '"schemaVersion": 2')),
		).rejects.toThrow("desteklenmeyen proof bundle sürümü");
	});
});

describe(".line workflow", () => {
	const validWorkflow = JSON.stringify({
		description: "Projeyi doğrula",
		expectedEvidence: ["test", "build"],
		inputs: [{ id: "cwd", label: "Proje klasörü", required: true }],
		name: "project-build-check",
		permissions: ["terminal", "git"],
		successCriteria: ["tests", "build"],
		version: 1,
		steps: [
			{ id: "status", kind: "git", title: "Git durumunu oku" },
			{
				command: "pnpm test",
				id: "test",
				kind: "terminal",
				requiresApproval: true,
				title: "Testleri çalıştır",
			},
		],
	});

	it("v1 workflow şemasını okuyup yalnız gerçek sıradaki adımı active yapar", () => {
		const workflow = parseWorkflow(validWorkflow);

		expect(runWorkflowStepState(workflow, [])).toEqual([
			{ id: "status", status: "active" },
			{ id: "test", status: "pending" },
		]);
		expect(runWorkflowStepState(workflow, ["status"])).toEqual([
			{ id: "status", status: "completed" },
			{ id: "test", status: "approval_required" },
		]);
	});

	it("geçersiz sürüm, izin ve steps alanını çalıştırmadan reddeder", () => {
		expect(() => parseWorkflow(validWorkflow.replace('"version":1', '"version":2'))).toThrow(
			"desteklenmeyen workflow sürümü",
		);
		expect(() => parseWorkflow(validWorkflow.replace('"terminal"', '"root"'))).toThrow(
			"geçersiz workflow izni",
		);
		expect(() => parseWorkflow('{"version":1,"steps":[]}')).toThrow(
			"workflow adı geçersiz",
		);
	});
});

describe("Project Memory", () => {
	it("yalnız evidence referanslı bilgi ekler ve aynı kimliği günceller", () => {
		expect(() =>
			upsertMemoryItem([], {
				category: "architecture",
				evidenceIds: [],
				id: "memory-1",
				title: "Tauri",
				value: "Windows runtime",
			}),
		).toThrow("en az bir kanıt");

		const first = upsertMemoryItem([], {
			category: "architecture",
			evidenceIds: ["e-file"],
			id: "memory-1",
			title: "Tauri",
			value: "Windows runtime",
		});
		const updated = upsertMemoryItem(first, {
			...first[0],
			value: "Tauri 2 Windows runtime",
		});

		expect(updated).toHaveLength(1);
		expect(updated[0].value).toBe("Tauri 2 Windows runtime");
	});
});
