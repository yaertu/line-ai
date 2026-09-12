use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    env, fs,
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
#[cfg(not(test))]
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    process::Child,
    sync::Mutex as AsyncMutex,
};

const MAX_COMMAND_BYTES: usize = 16 * 1024;
const MAX_OUTPUT_BYTES: usize = 1024 * 1024;
const MAX_CHECKPOINT_BYTES: u64 = 256 * 1024 * 1024;
const MAX_CHECKPOINT_FILE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_CHECKPOINT_FILES: usize = 20_000;
const SKIPPED_DIRECTORIES: &[&str] = &[
    ".git",
    ".next",
    ".turbo",
    "coverage",
    "dist",
    "node_modules",
    "target",
    "vendor",
];
const SAFE_INHERITED_ENV: &[&str] = &[
    "ALLUSERSPROFILE",
    "APPDATA",
    "COMMONPROGRAMFILES",
    "COMMONPROGRAMFILES(X86)",
    "COMMONPROGRAMW6432",
    "COMSPEC",
    "HOMEDRIVE",
    "HOMEPATH",
    "LOCALAPPDATA",
    "OS",
    "PATH",
    "PATHEXT",
    "PROCESSOR_ARCHITECTURE",
    "PROCESSOR_IDENTIFIER",
    "PROCESSOR_LEVEL",
    "PROCESSOR_REVISION",
    "PROGRAMDATA",
    "PROGRAMFILES",
    "PROGRAMFILES(X86)",
    "PROGRAMW6432",
    "PSModulePath",
    "PUBLIC",
    "SYSTEMDRIVE",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "USERDOMAIN",
    "USERNAME",
    "USERPROFILE",
    "WINDIR",
];
const ALLOWED_REQUEST_ENV: &[&str] = &["CI", "NO_COLOR", "RUST_BACKTRACE", "TERM"];

#[derive(Default)]
pub struct WorkspaceRuntime {
    processes: Mutex<HashMap<String, Arc<AsyncMutex<Child>>>>,
    cancelled: Mutex<HashSet<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalRequest {
    pub approved: bool,
    pub command: String,
    pub command_id: String,
    #[serde(default)]
    pub environment: BTreeMap<String, String>,
    pub timeout_ms: u64,
    pub working_directory: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalOutputEvent {
    command_id: String,
    stream: String,
    text: String,
}

type OutputEmitter = Arc<dyn Fn(TerminalOutputEvent) + Send + Sync>;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalResult {
    pub command_id: String,
    pub command: String,
    pub working_directory: String,
    pub started_at_ms: u64,
    pub ended_at_ms: u64,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub cancelled: bool,
    pub timed_out: bool,
    pub duration_ms: u64,
    pub risk: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitMetadata {
    pub sha: String,
    pub author: String,
    pub authored_at: String,
    pub subject: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResult {
    pub repository_root: String,
    pub branch: String,
    pub head: String,
    pub modified_files: Vec<String>,
    pub staged_files: Vec<String>,
    pub untracked_files: Vec<String>,
    pub diff_summary: String,
    pub commit: Option<GitCommitMetadata>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotFile {
    relative_path: String,
    size: u64,
    sha256: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CheckpointManifest {
    version: u8,
    id: String,
    workspace: String,
    created_at_ms: u64,
    files: Vec<SnapshotFile>,
    total_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointResult {
    pub id: String,
    pub workspace: String,
    pub created_at_ms: u64,
    pub file_count: usize,
    pub total_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointPreview {
    pub id: String,
    pub affected_files: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    pub id: String,
    pub restored_files: usize,
    pub removed_files: usize,
}

fn unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn classify_terminal_risk(command: &str) -> &'static str {
    let normalized = command.to_ascii_lowercase();
    if normalized.contains("git reset --hard")
        || normalized.contains("clear-disk")
        || normalized.contains("format-volume")
        || normalized.contains("remove-item -recurse")
    {
        return "critical";
    }
    if normalized.contains("remove-item")
        || normalized.contains(" del ")
        || normalized.starts_with("del ")
        || normalized.contains("rm ")
        || normalized.contains("git push")
        || normalized.contains("git commit")
    {
        return "high";
    }
    if normalized.trim_start().starts_with("get-")
        || normalized.trim_start().starts_with("git status")
        || normalized.trim_start().starts_with("git diff")
        || normalized.trim_start().starts_with("pwd")
    {
        return "low";
    }
    "medium"
}

fn redact_after_prefix(mut text: String, prefix: &str) -> String {
    let mut offset = 0;
    while let Some(found) = text[offset..].find(prefix) {
        let start = offset + found;
        let token_start = start + prefix.len();
        let token_end = text[token_start..]
            .find(|character: char| {
                character.is_whitespace() || matches!(character, '\'' | '"' | ',' | ';')
            })
            .map(|end| token_start + end)
            .unwrap_or(text.len());
        if token_end <= token_start + 6 {
            offset = token_end;
            continue;
        }
        text.replace_range(token_start..token_end, "[GİZLENDİ]");
        offset = token_start + "[GİZLENDİ]".len();
    }
    text
}

pub fn redact_terminal_output(output: &str, secrets: &[&str]) -> String {
    let redacted = secrets
        .iter()
        .filter(|secret| secret.len() >= 4)
        .fold(output.to_owned(), |safe, secret| {
            safe.replace(secret, "[GİZLENDİ]")
        });
    let redacted = redact_after_prefix(redacted, "Bearer ");
    redact_after_prefix(redacted, "sk-")
}

fn known_secret_values() -> Vec<String> {
    env::vars()
        .filter(|(name, value)| {
            !value.is_empty()
                && (name.contains("KEY")
                    || name.contains("TOKEN")
                    || name.contains("SECRET")
                    || name.contains("PASSWORD"))
        })
        .map(|(_, value)| value)
        .collect()
}

fn canonical_directory(path: &str) -> Result<PathBuf, String> {
    let directory = fs::canonicalize(path)
        .map_err(|_| "Çalışma klasörü bulunamadı veya erişilemiyor.".to_owned())?;
    if !directory.is_dir() {
        return Err("Çalışma yolu bir klasör değil.".to_owned());
    }
    Ok(directory)
}

fn validate_terminal_request(request: &TerminalRequest) -> Result<(PathBuf, &'static str), String> {
    if request.command.trim().is_empty() || request.command.len() > MAX_COMMAND_BYTES {
        return Err("Terminal komutu boş veya boyut sınırını aşıyor.".to_owned());
    }
    if request.command_id.is_empty()
        || !request
            .command_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err("Terminal işlem kimliği geçersiz.".to_owned());
    }
    if !(50..=600_000).contains(&request.timeout_ms) {
        return Err("Terminal timeout değeri 50–600000 ms arasında olmalı.".to_owned());
    }
    if request
        .environment
        .keys()
        .any(|key| !ALLOWED_REQUEST_ENV.contains(&key.as_str()))
    {
        return Err("Terminal environment allowlist dışında alan içeriyor.".to_owned());
    }
    let risk = classify_terminal_risk(&request.command);
    if risk != "low" && !request.approved {
        return Err(format!(
            "{risk} riskli terminal komutu kullanıcı onayı gerektiriyor."
        ));
    }
    Ok((canonical_directory(&request.working_directory)?, risk))
}

async fn capture_output<R: AsyncRead + Unpin>(
    mut reader: R,
    command_id: String,
    stream: &'static str,
    secrets: Arc<Vec<String>>,
    emitter: Option<OutputEmitter>,
) -> Vec<u8> {
    let mut captured = Vec::new();
    let mut buffer = [0_u8; 4096];
    loop {
        let read = match reader.read(&mut buffer).await {
            Ok(0) | Err(_) => break,
            Ok(read) => read,
        };
        let remaining = MAX_OUTPUT_BYTES.saturating_sub(captured.len());
        captured.extend_from_slice(&buffer[..read.min(remaining)]);
        if let Some(emitter) = emitter.as_ref() {
            let text = String::from_utf8_lossy(&buffer[..read]);
            let secret_refs = secrets.iter().map(String::as_str).collect::<Vec<_>>();
            emitter(TerminalOutputEvent {
                command_id: command_id.clone(),
                stream: stream.to_owned(),
                text: redact_terminal_output(&text, &secret_refs),
            });
        }
    }
    captured
}

async fn run_terminal_process(
    request: TerminalRequest,
    runtime: &WorkspaceRuntime,
    emitter: Option<OutputEmitter>,
) -> Result<TerminalResult, String> {
    let (working_directory, risk) = validate_terminal_request(&request)?;
    let secrets = Arc::new(known_secret_values());
    let mut command = tokio::process::Command::new("powershell.exe");
    command
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &request.command,
        ])
        .current_dir(&working_directory)
        .env_clear()
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for name in SAFE_INHERITED_ENV {
        if let Some(value) = env::var_os(name) {
            command.env(name, value);
        }
    }
    for (name, value) in &request.environment {
        command.env(name, value);
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("PowerShell işlemi başlatılamadı: {error}"))?;
    // The caller's timeout applies to the command after Windows has created the
    // process. PowerShell's cold-start work can otherwise consume the entire
    // budget before the child gets a chance to run or write output.
    let started_at_ms = unix_ms();
    let started = Instant::now();
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Terminal stdout kanalı açılamadı.".to_owned())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Terminal stderr kanalı açılamadı.".to_owned())?;
    let child = Arc::new(AsyncMutex::new(child));
    runtime
        .processes
        .lock()
        .map_err(|_| "Terminal süreç kaydı kilitlenemedi.".to_owned())?
        .insert(request.command_id.clone(), child.clone());

    let stdout_task = tokio::spawn(capture_output(
        stdout,
        request.command_id.clone(),
        "stdout",
        secrets.clone(),
        emitter.clone(),
    ));
    let stderr_task = tokio::spawn(capture_output(
        stderr,
        request.command_id.clone(),
        "stderr",
        secrets.clone(),
        emitter,
    ));
    let deadline = Duration::from_millis(request.timeout_ms);
    let mut timed_out = false;
    let exit_status = loop {
        if started.elapsed() >= deadline {
            timed_out = true;
            let mut process = child.lock().await;
            let _ = process.kill().await;
            break process.wait().await.ok();
        }
        let status = child
            .lock()
            .await
            .try_wait()
            .map_err(|error| format!("Terminal süreç durumu okunamadı: {error}"))?;
        if status.is_some() {
            break status;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    };
    runtime
        .processes
        .lock()
        .map_err(|_| "Terminal süreç kaydı kilitlenemedi.".to_owned())?
        .remove(&request.command_id);
    let cancelled = runtime
        .cancelled
        .lock()
        .map_err(|_| "Terminal iptal kaydı kilitlenemedi.".to_owned())?
        .remove(&request.command_id);
    let stdout_bytes = stdout_task.await.unwrap_or_default();
    let stderr_bytes = stderr_task.await.unwrap_or_default();
    let secret_refs = secrets.iter().map(String::as_str).collect::<Vec<_>>();
    let stdout = redact_terminal_output(&String::from_utf8_lossy(&stdout_bytes), &secret_refs);
    let stderr = redact_terminal_output(&String::from_utf8_lossy(&stderr_bytes), &secret_refs);
    let ended_at_ms = unix_ms();

    Ok(TerminalResult {
        command_id: request.command_id,
        command: redact_terminal_output(&request.command, &secret_refs),
        working_directory: working_directory.to_string_lossy().into_owned(),
        started_at_ms,
        ended_at_ms,
        stdout,
        stderr,
        exit_code: exit_status.and_then(|status| status.code()),
        cancelled,
        timed_out,
        duration_ms: started.elapsed().as_millis() as u64,
        risk: risk.to_owned(),
    })
}

#[cfg(not(test))]
#[tauri::command]
pub async fn execute_terminal(
    request: TerminalRequest,
    runtime: State<'_, WorkspaceRuntime>,
    app: AppHandle,
) -> Result<TerminalResult, String> {
    let event_app = app.clone();
    let emitter: OutputEmitter = Arc::new(move |payload| {
        let _ = event_app.emit("line-ai://terminal-output", payload);
    });
    run_terminal_process(request, runtime.inner(), Some(emitter)).await
}

#[cfg(not(test))]
#[tauri::command]
pub async fn cancel_terminal(
    command_id: String,
    runtime: State<'_, WorkspaceRuntime>,
) -> Result<(), String> {
    cancel_terminal_process(&command_id, runtime.inner()).await
}

async fn cancel_terminal_process(
    command_id: &str,
    runtime: &WorkspaceRuntime,
) -> Result<(), String> {
    let child = runtime
        .processes
        .lock()
        .map_err(|_| "Terminal süreç kaydı kilitlenemedi.".to_owned())?
        .get(command_id)
        .cloned()
        .ok_or_else(|| "Çalışan terminal işlemi bulunamadı.".to_owned())?;
    runtime
        .cancelled
        .lock()
        .map_err(|_| "Terminal iptal kaydı kilitlenemedi.".to_owned())?
        .insert(command_id.to_owned());
    let result = child
        .lock()
        .await
        .start_kill()
        .map_err(|error| format!("Terminal işlemi iptal edilemedi: {error}"));
    result
}

fn git_output(workspace: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(workspace)
        .args(args)
        .stdin(Stdio::null())
        .output()
        .map_err(|_| "Git çalıştırılamadı veya PATH üzerinde bulunamadı.".to_owned())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

fn git_output_raw(workspace: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(workspace)
        .args(args)
        .stdin(Stdio::null())
        .output()
        .map_err(|_| "Git çalıştırılamadı veya PATH üzerinde bulunamadı.".to_owned())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

pub fn read_git_status_at(workspace: &Path) -> Result<GitStatusResult, String> {
    let workspace = fs::canonicalize(workspace)
        .map_err(|_| "Çalışma klasörü bulunamadı veya erişilemiyor.".to_owned())?;
    let repository_root = git_output(&workspace, &["rev-parse", "--show-toplevel"])
        .map_err(|_| "Git repository bulunamadı.".to_owned())?;
    let branch = git_output(&workspace, &["branch", "--show-current"])?;
    let head = git_output(&workspace, &["rev-parse", "HEAD"])?;
    let porcelain = git_output_raw(&workspace, &["status", "--porcelain=v1"])?;
    let mut modified_files = Vec::new();
    let mut staged_files = Vec::new();
    let mut untracked_files = Vec::new();
    for line in porcelain.lines().filter(|line| line.len() >= 3) {
        let bytes = line.as_bytes();
        let path = line[3..]
            .split(" -> ")
            .last()
            .unwrap_or_default()
            .to_owned();
        if &line[..2] == "??" {
            untracked_files.push(path);
            continue;
        }
        if bytes[0] != b' ' {
            staged_files.push(path.clone());
        }
        if bytes[1] != b' ' {
            modified_files.push(path);
        }
    }
    let diff_summary = git_output(&workspace, &["diff", "--shortstat"])?;
    let commit_raw = git_output(
        &workspace,
        &["log", "-1", "--format=%H%x1f%an%x1f%aI%x1f%s"],
    )?;
    let commit_parts = commit_raw.splitn(4, '\u{1f}').collect::<Vec<_>>();
    let commit = (commit_parts.len() == 4).then(|| GitCommitMetadata {
        sha: commit_parts[0].to_owned(),
        author: commit_parts[1].to_owned(),
        authored_at: commit_parts[2].to_owned(),
        subject: commit_parts[3].to_owned(),
    });
    Ok(GitStatusResult {
        repository_root,
        branch,
        head,
        modified_files,
        staged_files,
        untracked_files,
        diff_summary,
        commit,
    })
}

#[cfg(not(test))]
#[tauri::command]
pub fn read_git_status(workspace_path: String) -> Result<GitStatusResult, String> {
    read_git_status_at(Path::new(&workspace_path))
}

fn valid_checkpoint_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 100
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|error| format!("Dosya okunamadı: {error}"))?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn relative_string(root: &Path, path: &Path) -> Result<String, String> {
    path.strip_prefix(root)
        .map(|relative| relative.to_string_lossy().replace('\\', "/"))
        .map_err(|_| "Checkpoint yolu çalışma alanının dışında.".to_owned())
}

fn collect_workspace_files(root: &Path) -> Result<Vec<SnapshotFile>, String> {
    fn visit(
        root: &Path,
        current: &Path,
        files: &mut Vec<SnapshotFile>,
        total: &mut u64,
    ) -> Result<(), String> {
        let mut entries = fs::read_dir(current)
            .map_err(|error| format!("Checkpoint klasörü okunamadı: {error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("Checkpoint girdisi okunamadı: {error}"))?;
        entries.sort_by_key(|entry| entry.path());
        for entry in entries {
            let file_type = entry
                .file_type()
                .map_err(|error| format!("Dosya türü okunamadı: {error}"))?;
            let path = entry.path();
            if file_type.is_symlink() {
                return Err(format!(
                    "Symlink/reparse noktası checkpoint'e alınamaz: {}",
                    path.display()
                ));
            }
            if file_type.is_dir() {
                let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
                if SKIPPED_DIRECTORIES.iter().any(|skipped| *skipped == name) {
                    continue;
                }
                visit(root, &path, files, total)?;
                continue;
            }
            if !file_type.is_file() {
                continue;
            }
            let size = entry
                .metadata()
                .map_err(|error| format!("Dosya metadata'sı okunamadı: {error}"))?
                .len();
            if size > MAX_CHECKPOINT_FILE_BYTES {
                return Err(format!(
                    "Checkpoint dosya boyutu sınırı aşıldı: {}",
                    path.display()
                ));
            }
            *total = total.saturating_add(size);
            if *total > MAX_CHECKPOINT_BYTES || files.len() >= MAX_CHECKPOINT_FILES {
                return Err("Checkpoint toplam boyut veya dosya sayısı sınırını aşıyor.".to_owned());
            }
            files.push(SnapshotFile {
                relative_path: relative_string(root, &path)?,
                size,
                sha256: sha256_file(&path)?,
            });
        }
        Ok(())
    }

    let mut files = Vec::new();
    let mut total = 0;
    visit(root, root, &mut files, &mut total)?;
    Ok(files)
}

fn safe_relative_join(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative_path = Path::new(relative);
    if relative_path.is_absolute()
        || relative_path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("Checkpoint manifest yolu geçersiz.".to_owned());
    }
    Ok(root.join(relative_path))
}

fn manifest_path(store: &Path, id: &str) -> Result<PathBuf, String> {
    if !valid_checkpoint_id(id) {
        return Err("Checkpoint kimliği geçersiz.".to_owned());
    }
    Ok(store.join(id).join("manifest.json"))
}

fn read_manifest(store: &Path, id: &str) -> Result<CheckpointManifest, String> {
    let text = fs::read_to_string(manifest_path(store, id)?)
        .map_err(|_| "Checkpoint manifest bulunamadı.".to_owned())?;
    let manifest: CheckpointManifest =
        serde_json::from_str(&text).map_err(|_| "Checkpoint manifest geçersiz.".to_owned())?;
    if manifest.version != 1 || manifest.id != id {
        return Err("Checkpoint manifest sürümü veya kimliği geçersiz.".to_owned());
    }
    Ok(manifest)
}

pub fn create_checkpoint_at(
    workspace: &Path,
    store: &Path,
    id: &str,
) -> Result<CheckpointResult, String> {
    if !valid_checkpoint_id(id) {
        return Err("Checkpoint kimliği geçersiz.".to_owned());
    }
    let workspace = fs::canonicalize(workspace)
        .map_err(|_| "Çalışma klasörü bulunamadı veya erişilemiyor.".to_owned())?;
    fs::create_dir_all(store)
        .map_err(|error| format!("Checkpoint alanı oluşturulamadı: {error}"))?;
    let checkpoint_root = store.join(id);
    if checkpoint_root.exists() {
        return Err("Checkpoint kimliği zaten var.".to_owned());
    }
    let files = collect_workspace_files(&workspace)?;
    let files_root = checkpoint_root.join("files");
    fs::create_dir_all(&files_root)
        .map_err(|error| format!("Checkpoint dosya alanı oluşturulamadı: {error}"))?;
    for file in &files {
        let source = safe_relative_join(&workspace, &file.relative_path)?;
        let target = safe_relative_join(&files_root, &file.relative_path)?;
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Checkpoint alt klasörü oluşturulamadı: {error}"))?;
        }
        fs::copy(source, target)
            .map_err(|error| format!("Checkpoint dosyası kopyalanamadı: {error}"))?;
    }
    let created_at_ms = unix_ms();
    let total_bytes = files.iter().map(|file| file.size).sum();
    let manifest = CheckpointManifest {
        version: 1,
        id: id.to_owned(),
        workspace: workspace.to_string_lossy().into_owned(),
        created_at_ms,
        files,
        total_bytes,
    };
    fs::write(
        checkpoint_root.join("manifest.json"),
        serde_json::to_vec_pretty(&manifest)
            .map_err(|_| "Checkpoint manifest serileştirilemedi.".to_owned())?,
    )
    .map_err(|error| format!("Checkpoint manifest yazılamadı: {error}"))?;
    Ok(CheckpointResult {
        id: manifest.id,
        workspace: manifest.workspace,
        created_at_ms,
        file_count: manifest.files.len(),
        total_bytes,
    })
}

pub fn inspect_checkpoint_at(
    workspace: &Path,
    store: &Path,
    id: &str,
) -> Result<CheckpointPreview, String> {
    let workspace = fs::canonicalize(workspace)
        .map_err(|_| "Çalışma klasörü bulunamadı veya erişilemiyor.".to_owned())?;
    let manifest = read_manifest(store, id)?;
    if manifest.workspace != workspace.to_string_lossy() {
        return Err("Checkpoint başka bir çalışma alanına ait.".to_owned());
    }
    let snapshot = manifest
        .files
        .iter()
        .map(|file| (file.relative_path.clone(), file.sha256.clone()))
        .collect::<BTreeMap<_, _>>();
    let current = collect_workspace_files(&workspace)?
        .into_iter()
        .map(|file| (file.relative_path, file.sha256))
        .collect::<BTreeMap<_, _>>();
    let mut affected = snapshot
        .keys()
        .chain(current.keys())
        .filter(|path| snapshot.get(*path) != current.get(*path))
        .cloned()
        .collect::<Vec<_>>();
    affected.sort();
    affected.dedup();
    Ok(CheckpointPreview {
        id: id.to_owned(),
        affected_files: affected,
    })
}

pub fn restore_checkpoint_at(
    workspace: &Path,
    store: &Path,
    id: &str,
    approved: bool,
) -> Result<RestoreResult, String> {
    if !approved {
        return Err("Checkpoint restore kullanıcı onayı gerektiriyor.".to_owned());
    }
    let workspace = fs::canonicalize(workspace)
        .map_err(|_| "Çalışma klasörü bulunamadı veya erişilemiyor.".to_owned())?;
    let manifest = read_manifest(store, id)?;
    if manifest.workspace != workspace.to_string_lossy() {
        return Err("Checkpoint başka bir çalışma alanına ait.".to_owned());
    }
    let files_root = store.join(id).join("files");
    let snapshot_paths = manifest
        .files
        .iter()
        .map(|file| file.relative_path.clone())
        .collect::<HashSet<_>>();
    let current = collect_workspace_files(&workspace)?;
    let mut removed_files = 0;
    for file in current {
        if !snapshot_paths.contains(&file.relative_path) {
            fs::remove_file(safe_relative_join(&workspace, &file.relative_path)?)
                .map_err(|error| format!("Checkpoint sonrası dosya kaldırılamadı: {error}"))?;
            removed_files += 1;
        }
    }
    for file in &manifest.files {
        let source = safe_relative_join(&files_root, &file.relative_path)?;
        if sha256_file(&source)? != file.sha256 {
            return Err("Checkpoint dosya bütünlüğü doğrulanamadı.".to_owned());
        }
        let target = safe_relative_join(&workspace, &file.relative_path)?;
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Restore klasörü oluşturulamadı: {error}"))?;
        }
        fs::copy(source, target)
            .map_err(|error| format!("Checkpoint dosyası geri yüklenemedi: {error}"))?;
    }
    Ok(RestoreResult {
        id: id.to_owned(),
        restored_files: manifest.files.len(),
        removed_files,
    })
}

#[cfg(not(test))]
fn checkpoint_store(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join("checkpoints"))
        .map_err(|error| format!("Uygulama checkpoint dizini çözülemedi: {error}"))
}

#[cfg(not(test))]
#[tauri::command]
pub fn create_workspace_checkpoint(
    app: AppHandle,
    workspace_path: String,
    checkpoint_id: String,
) -> Result<CheckpointResult, String> {
    create_checkpoint_at(
        Path::new(&workspace_path),
        &checkpoint_store(&app)?,
        &checkpoint_id,
    )
}

#[cfg(not(test))]
#[tauri::command]
pub fn inspect_workspace_checkpoint(
    app: AppHandle,
    workspace_path: String,
    checkpoint_id: String,
) -> Result<CheckpointPreview, String> {
    inspect_checkpoint_at(
        Path::new(&workspace_path),
        &checkpoint_store(&app)?,
        &checkpoint_id,
    )
}

#[cfg(not(test))]
#[tauri::command]
pub fn restore_workspace_checkpoint(
    app: AppHandle,
    workspace_path: String,
    checkpoint_id: String,
    approved: bool,
) -> Result<RestoreResult, String> {
    restore_checkpoint_at(
        Path::new(&workspace_path),
        &checkpoint_store(&app)?,
        &checkpoint_id,
        approved,
    )
}

#[cfg(test)]
mod tests {
    use super::{
        cancel_terminal_process, classify_terminal_risk, create_checkpoint_at,
        inspect_checkpoint_at, read_git_status_at, redact_terminal_output, restore_checkpoint_at,
        run_terminal_process, TerminalRequest, WorkspaceRuntime,
    };
    use std::{
        fs,
        path::PathBuf,
        process::Command,
        sync::Mutex,
        time::{SystemTime, UNIX_EPOCH},
    };

    static TERMINAL_TEST_LOCK: Mutex<()> = Mutex::new(());

    fn temp_root(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("line-ai-{label}-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn classifies_mutating_and_destructive_terminal_commands() {
        assert_eq!(classify_terminal_risk("Get-ChildItem"), "low");
        assert_eq!(classify_terminal_risk("pnpm test"), "medium");
        assert_eq!(classify_terminal_risk("Remove-Item notes.txt"), "high");
        assert_eq!(classify_terminal_risk("git reset --hard"), "critical");
    }

    #[test]
    fn redacts_known_and_shaped_secrets_from_terminal_output() {
        let output = "Authorization: Bearer private-value\nLINE_AI_RUNTIME_KEY=known-secret\nsk-project-abcdefghijkl";
        let redacted = redact_terminal_output(output, &["private-value", "known-secret"]);

        assert!(!redacted.contains("private-value"));
        assert!(!redacted.contains("known-secret"));
        assert!(!redacted.contains("sk-project-abcdefghijkl"));
        assert!(redacted.contains("[GİZLENDİ]"));
    }

    #[test]
    fn returns_real_stdout_stderr_exit_code_and_timeout() {
        let _terminal_test_guard = TERMINAL_TEST_LOCK.lock().unwrap();
        tauri::async_runtime::block_on(async {
            let root = temp_root("terminal");
            let runtime = WorkspaceRuntime::default();
            let result = run_terminal_process(
                TerminalRequest {
                    approved: true,
                    command: "Write-Output 'out-ok'; [Console]::Error.WriteLine('err-ok'); exit 7"
                        .to_owned(),
                    command_id: "terminal-result".to_owned(),
                    environment: Default::default(),
                    timeout_ms: 120_000,
                    working_directory: root.to_string_lossy().into_owned(),
                },
                &runtime,
                None,
            )
            .await
            .unwrap();
            assert!(
                result.stdout.contains("out-ok"),
                "stdout={:?}, stderr={:?}, timed_out={}, exit_code={:?}",
                result.stdout,
                result.stderr,
                result.timed_out,
                result.exit_code
            );
            assert!(
                result.stderr.contains("err-ok"),
                "stdout={:?}, stderr={:?}, timed_out={}, exit_code={:?}",
                result.stdout,
                result.stderr,
                result.timed_out,
                result.exit_code
            );
            assert_eq!(result.exit_code, Some(7));
            assert!(!result.timed_out);
            assert!(!result.cancelled);

            let timed_out = run_terminal_process(
                TerminalRequest {
                    approved: true,
                    command: "Start-Sleep -Seconds 2".to_owned(),
                    command_id: "terminal-timeout".to_owned(),
                    environment: Default::default(),
                    timeout_ms: 100,
                    working_directory: root.to_string_lossy().into_owned(),
                },
                &runtime,
                None,
            )
            .await
            .unwrap();
            assert!(timed_out.timed_out);
            assert_ne!(timed_out.exit_code, Some(0));
            fs::remove_dir_all(root).unwrap();
        });
    }

    #[test]
    fn cancels_a_running_terminal_process_and_never_reports_success() {
        let _terminal_test_guard = TERMINAL_TEST_LOCK.lock().unwrap();
        tauri::async_runtime::block_on(async {
            let root = temp_root("terminal-cancel");
            let runtime = std::sync::Arc::new(WorkspaceRuntime::default());
            let task_runtime = runtime.clone();
            let working_directory = root.to_string_lossy().into_owned();
            let task = tokio::spawn(async move {
                run_terminal_process(
                    TerminalRequest {
                        approved: true,
                        command: "Start-Sleep -Seconds 5".to_owned(),
                        command_id: "terminal-cancel".to_owned(),
                        environment: Default::default(),
                        timeout_ms: 10_000,
                        working_directory,
                    },
                    &task_runtime,
                    None,
                )
                .await
                .unwrap()
            });
            tokio::time::sleep(std::time::Duration::from_millis(150)).await;
            cancel_terminal_process("terminal-cancel", &runtime)
                .await
                .unwrap();
            let result = task.await.unwrap();

            assert!(result.cancelled);
            assert_ne!(result.exit_code, Some(0));
            fs::remove_dir_all(root).unwrap();
        });
    }

    #[test]
    fn reports_non_repository_and_dirty_git_state_without_mutation() {
        let plain = temp_root("plain");
        let missing = read_git_status_at(&plain).unwrap_err();
        assert!(missing.contains("Git repository bulunamadı"));

        let repo = temp_root("git");
        assert!(Command::new("git")
            .arg("init")
            .arg(&repo)
            .status()
            .unwrap()
            .success());
        Command::new("git")
            .args([
                "-C",
                repo.to_str().unwrap(),
                "config",
                "user.email",
                "line@example.test",
            ])
            .status()
            .unwrap();
        Command::new("git")
            .args([
                "-C",
                repo.to_str().unwrap(),
                "config",
                "user.name",
                "Line Test",
            ])
            .status()
            .unwrap();
        fs::write(repo.join("tracked.txt"), "before").unwrap();
        Command::new("git")
            .args(["-C", repo.to_str().unwrap(), "add", "tracked.txt"])
            .status()
            .unwrap();
        Command::new("git")
            .args(["-C", repo.to_str().unwrap(), "commit", "-m", "initial"])
            .status()
            .unwrap();
        fs::write(repo.join("tracked.txt"), "user change").unwrap();
        fs::write(repo.join("untracked.txt"), "new").unwrap();

        let status = read_git_status_at(&repo).unwrap();
        assert!(status.modified_files.contains(&"tracked.txt".to_owned()));
        assert!(status.untracked_files.contains(&"untracked.txt".to_owned()));
        assert!(!status.head.is_empty());

        fs::remove_dir_all(plain).unwrap();
        fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn checkpoint_restore_preserves_preexisting_user_content_and_removes_later_files() {
        let workspace = temp_root("checkpoint-workspace");
        let store = temp_root("checkpoint-store");
        fs::write(workspace.join("user.txt"), "user change before AI").unwrap();
        fs::create_dir_all(workspace.join("node_modules")).unwrap();
        fs::write(workspace.join("node_modules").join("cache.txt"), "ignored").unwrap();

        let checkpoint = create_checkpoint_at(&workspace, &store, "checkpoint-1").unwrap();
        fs::write(workspace.join("user.txt"), "AI overwrite").unwrap();
        fs::write(workspace.join("ai-created.txt"), "created later").unwrap();

        let preview = inspect_checkpoint_at(&workspace, &store, &checkpoint.id).unwrap();
        assert!(preview.affected_files.contains(&"user.txt".to_owned()));
        assert!(preview
            .affected_files
            .contains(&"ai-created.txt".to_owned()));

        restore_checkpoint_at(&workspace, &store, &checkpoint.id, true).unwrap();
        assert_eq!(
            fs::read_to_string(workspace.join("user.txt")).unwrap(),
            "user change before AI"
        );
        assert!(!workspace.join("ai-created.txt").exists());
        assert!(workspace.join("node_modules").join("cache.txt").exists());

        fs::remove_dir_all(workspace).unwrap();
        fs::remove_dir_all(store).unwrap();
    }
}
