import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import {
	cancelTerminal,
	createWorkspaceCheckpoint,
	executeTerminal,
	inspectWorkspaceCheckpoint,
	readGitStatus,
	restoreWorkspaceCheckpoint,
} from "./workspace";

describe("native workspace IPC", () => {
	beforeEach(() => {
		invoke.mockReset();
		Object.defineProperty(window, "__TAURI_INTERNALS__", {
			configurable: true,
			value: {},
		});
	});

	it("terminal isteğini izin, timeout, cwd ve allowlist environment ile native katmana gönderir", async () => {
		invoke.mockResolvedValueOnce({
			cancelled: false,
			command: "pnpm test",
			commandId: "command-1",
			durationMs: 20,
			endedAtMs: 2,
			exitCode: 0,
			risk: "medium",
			startedAtMs: 1,
			stderr: "",
			stdout: "PASS",
			timedOut: false,
			workingDirectory: "C:\\repo",
		});

		await executeTerminal({
			approved: true,
			command: "pnpm test",
			commandId: "command-1",
			environment: { CI: "1" },
			timeoutMs: 30_000,
			workingDirectory: "C:\\repo",
		});

		expect(invoke).toHaveBeenCalledWith("execute_terminal", {
			request: {
				approved: true,
				command: "pnpm test",
				commandId: "command-1",
				environment: { CI: "1" },
				timeoutMs: 30_000,
				workingDirectory: "C:\\repo",
			},
		});
	});

	it("terminal iptal ve Git durum komutlarını ayrı native çağrılarla yürütür", async () => {
		invoke.mockResolvedValue(undefined);
		await cancelTerminal("command-1");
		await readGitStatus("C:\\repo");

		expect(invoke).toHaveBeenNthCalledWith(1, "cancel_terminal", {
			commandId: "command-1",
		});
		expect(invoke).toHaveBeenNthCalledWith(2, "read_git_status", {
			workspacePath: "C:\\repo",
		});
	});

	it("checkpoint create/inspect/restore çağrılarını explicit restore onayıyla gönderir", async () => {
		invoke.mockResolvedValue(undefined);
		await createWorkspaceCheckpoint("C:\\repo", "checkpoint-1");
		await inspectWorkspaceCheckpoint("C:\\repo", "checkpoint-1");
		await restoreWorkspaceCheckpoint("C:\\repo", "checkpoint-1", true);

		expect(invoke).toHaveBeenNthCalledWith(1, "create_workspace_checkpoint", {
			checkpointId: "checkpoint-1",
			workspacePath: "C:\\repo",
		});
		expect(invoke).toHaveBeenNthCalledWith(2, "inspect_workspace_checkpoint", {
			checkpointId: "checkpoint-1",
			workspacePath: "C:\\repo",
		});
		expect(invoke).toHaveBeenNthCalledWith(3, "restore_workspace_checkpoint", {
			approved: true,
			checkpointId: "checkpoint-1",
			workspacePath: "C:\\repo",
		});
	});

	it("web build içinde native çalışma motoru varmış gibi davranmaz", async () => {
		delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

		await expect(readGitStatus("C:\\repo")).rejects.toThrow(
			"yalnız Line AI masaüstü uygulamasında",
		);
		expect(invoke).not.toHaveBeenCalled();
	});
});
