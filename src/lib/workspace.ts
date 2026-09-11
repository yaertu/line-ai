import { invoke } from "@tauri-apps/api/core";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type TerminalRequest = {
	approved: boolean;
	command: string;
	commandId: string;
	environment: Record<string, string>;
	timeoutMs: number;
	workingDirectory: string;
};

export type TerminalResult = {
	commandId: string;
	command: string;
	workingDirectory: string;
	startedAtMs: number;
	endedAtMs: number;
	stdout: string;
	stderr: string;
	exitCode: number | null;
	cancelled: boolean;
	timedOut: boolean;
	durationMs: number;
	risk: RiskLevel;
};

export type GitCommitMetadata = {
	sha: string;
	author: string;
	authoredAt: string;
	subject: string;
};

export type GitStatusResult = {
	repositoryRoot: string;
	branch: string;
	head: string;
	modifiedFiles: string[];
	stagedFiles: string[];
	untrackedFiles: string[];
	diffSummary: string;
	commit: GitCommitMetadata | null;
};

export type CheckpointResult = {
	id: string;
	workspace: string;
	createdAtMs: number;
	fileCount: number;
	totalBytes: number;
};

export type CheckpointPreview = {
	id: string;
	affectedFiles: string[];
};

export type RestoreResult = {
	id: string;
	restoredFiles: number;
	removedFiles: number;
};

const requireDesktop = () => {
	if (!("__TAURI_INTERNALS__" in window)) {
		throw new Error(
			"Çalışma alanı motoru yalnız Line AI masaüstü uygulamasında kullanılabilir.",
		);
	}
};

export const executeTerminal = async (request: TerminalRequest) => {
	requireDesktop();
	return invoke<TerminalResult>("execute_terminal", { request });
};

export const cancelTerminal = async (commandId: string) => {
	requireDesktop();
	await invoke("cancel_terminal", { commandId });
};

export const readGitStatus = async (workspacePath: string) => {
	requireDesktop();
	return invoke<GitStatusResult>("read_git_status", { workspacePath });
};

export const createWorkspaceCheckpoint = async (
	workspacePath: string,
	checkpointId: string,
) => {
	requireDesktop();
	return invoke<CheckpointResult>("create_workspace_checkpoint", {
		checkpointId,
		workspacePath,
	});
};

export const inspectWorkspaceCheckpoint = async (
	workspacePath: string,
	checkpointId: string,
) => {
	requireDesktop();
	return invoke<CheckpointPreview>("inspect_workspace_checkpoint", {
		checkpointId,
		workspacePath,
	});
};

export const restoreWorkspaceCheckpoint = async (
	workspacePath: string,
	checkpointId: string,
	approved: boolean,
) => {
	requireDesktop();
	return invoke<RestoreResult>("restore_workspace_checkpoint", {
		approved,
		checkpointId,
		workspacePath,
	});
};

