import { describe, expect, it } from "vitest";
import { sanitizeEvidenceValue } from "./sanitize";
import {
	appendEvidence,
	appendTraceEvent,
	createTraceSession,
	transitionSession,
} from "./session";
import { calculateResult } from "./verification";

const started = () =>
	createTraceSession({
		id: "session-1",
		prompt: "Projeyi doğrula",
		startedAt: "2026-09-11T10:00:00.000Z",
		taskType: "audit",
	});

describe("Trace session", () => {
	it("gerçek olayları eklenme sırasıyla numaralandırır ve provider metadata'sını korur", () => {
		const first = appendTraceEvent(started(), {
			id: "event-1",
			status: "running",
			timestamp: "2026-09-11T10:00:01.000Z",
			title: "Provider çağrısı",
			type: "provider",
			provider: "openai",
			model: "gpt-test",
			attempt: 1,
		});
		const second = appendTraceEvent(first, {
			id: "event-2",
			status: "completed",
			timestamp: "2026-09-11T10:00:02.000Z",
			title: "Yanıt alındı",
			type: "result",
		});

		expect(second.events.map((event) => event.sequence)).toEqual([1, 2]);
		expect(second.events[0]).toMatchObject({
			attempt: 1,
			model: "gpt-test",
			provider: "openai",
			sessionId: "session-1",
		});
	});

	it("terminal başarısızlığını oturum başarısızlığına taşır", () => {
		const session = appendTraceEvent(started(), {
			exitCode: 1,
			id: "event-failed",
			status: "failed",
			timestamp: "2026-09-11T10:00:03.000Z",
			title: "Test komutu başarısız",
			type: "terminal",
		});

		expect(session.status).toBe("failed");
	});

	it("terminal durumdan sonra yeniden çalışan duruma geçişi reddeder", () => {
		const completed = transitionSession(started(), "completed", {
			endedAt: "2026-09-11T10:01:00.000Z",
		});

		expect(() => transitionSession(completed, "running")).toThrow(
			"completed durumundan running durumuna geçilemez",
		);
	});
});

describe("kanıt sanitization", () => {
	it("anahtarları, Authorization/Cookie header'larını ve iç içe secret alanlarını maskeler", () => {
		const value = sanitizeEvidenceValue({
			authorization: "Bearer sk-live-1234567890",
			command: "$env:OPENAI_API_KEY='secret-value'; echo ok",
			cookie: "session=very-private-cookie",
			nested: { password: "correct-horse", safe: "exit 1" },
			stdout: "token=abc123456789 and sk-project-abcdefghijkl",
		});

		expect(value).toEqual({
			authorization: "[REDACTED]",
			command: "$env:OPENAI_API_KEY='[REDACTED]'; echo ok",
			cookie: "[REDACTED]",
			nested: { password: "[REDACTED]", safe: "exit 1" },
			stdout: "token=[REDACTED] and [REDACTED]",
		});
	});
});

describe("result verification", () => {
	it("bütün zorunlu kriterlerde başarılı gerçek kanıt varsa VERIFIED döndürür", () => {
		let session = started();
		session = appendEvidence(session, {
			criterionIds: ["tests"],
			id: "e-tests",
			kind: "test",
			status: "passed",
			summary: "50 test geçti",
			timestamp: "2026-09-11T10:02:00.000Z",
		});
		session = appendEvidence(session, {
			criterionIds: ["build"],
			id: "e-build",
			kind: "build",
			status: "passed",
			summary: "Build exit 0",
			timestamp: "2026-09-11T10:03:00.000Z",
		});

		expect(
			calculateResult(session, [
				{ id: "tests", label: "Testler", required: true },
				{ id: "build", label: "Build", required: true },
			]),
		).toMatchObject({
				passed: 2,
				status: "verified",
				total: 2,
			});
	});

	it("kanıtların bir bölümü eksikse PARTIALLY_VERIFIED döndürür", () => {
		const session = appendEvidence(started(), {
			criterionIds: ["tests"],
			id: "e-tests",
			kind: "test",
			status: "passed",
			summary: "Testler geçti",
			timestamp: "2026-09-11T10:02:00.000Z",
		});

		expect(
			calculateResult(session, [
				{ id: "tests", label: "Testler", required: true },
				{ id: "browser", label: "Tarayıcı", required: true },
			]),
		).toMatchObject({ missing: ["browser"], status: "partially_verified" });
	});

	it("provider yanıtını kriter kanıtı yokken UNVERIFIED tutar", () => {
		const session = appendEvidence(started(), {
			id: "e-provider",
			kind: "provider",
			status: "passed",
			summary: "Provider yanıt verdi",
			timestamp: "2026-09-11T10:02:00.000Z",
		});

		expect(
			calculateResult(session, [
				{ id: "tests", label: "Testler", required: true },
			]),
		).toMatchObject({ status: "unverified" });
	});

	it("başarısız ve engellenmiş terminal durumlarını başarıdan üstün tutar", () => {
		const failed = transitionSession(started(), "failed");
		const blocked = transitionSession(started(), "blocked");

		expect(calculateResult(failed, [])).toMatchObject({ status: "failed" });
		expect(calculateResult(blocked, [])).toMatchObject({ status: "blocked" });
	});
});
