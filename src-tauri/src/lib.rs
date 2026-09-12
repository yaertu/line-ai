#![cfg_attr(test, allow(dead_code))]

mod browser;
mod cloud;
mod engine;
mod workspace;

use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

const MAX_PROMPT_BYTES: usize = 100_000;
const MAX_CUSTOM_INSTRUCTIONS_BYTES: usize = 12_000;
const MAX_TRANSCRIPT_TURNS: usize = 80;
const MAX_TRANSCRIPT_BYTES: usize = 600_000;
const MAX_ATTACHMENTS: usize = 30;
const MAX_ATTACHMENT_SOURCE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_ATTACHMENT_CONTEXT_BYTES: usize = 64 * 1024;
const MAX_TOTAL_ATTACHMENT_CONTEXT_BYTES: usize = 2 * 1024 * 1024;
const ARCHIVE_EXTENSIONS: &[&str] = &[
    "7z", "bz2", "cab", "cpio", "gz", "rar", "tar", "tbz", "tbz2", "tgz", "txz", "xz", "zip",
];
const SKIPPED_DIRECTORY_NAMES: &[&str] = &[
    ".git",
    ".next",
    ".turbo",
    ".venv",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
    "vendor",
    "venv",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExecuteAiPromptRequest {
    attachments: Option<Vec<PromptAttachment>>,
    #[serde(default)]
    custom_instructions: Option<String>,
    prompt: String,
    provider: String,
    reasoning: String,
    #[serde(default)]
    response_style: Option<String>,
    transcript: Vec<TranscriptTurn>,
    truth_mode: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PromptAttachment {
    content: String,
    #[serde(default = "default_content_kind")]
    content_kind: String,
    mime_type: String,
    name: String,
    size: u64,
    truncated: bool,
}

#[derive(Debug, Deserialize)]
struct TranscriptTurn {
    role: String,
    content: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WebSource {
    id: String,
    snippet: Option<String>,
    title: String,
    url: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum ExecuteAiPromptEvent {
    Status { label: String },
    TextDelta { text: String },
}

#[derive(Debug, Serialize)]
struct ExecuteAiPromptResult {
    message: String,
    model: String,
    provider: String,
    #[serde(rename = "requestId", skip_serializing_if = "Option::is_none")]
    request_id: Option<String>,
    sources: Vec<WebSource>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DroppedTextFile {
    content: String,
    content_kind: String,
    mime_type: String,
    name: String,
    size: u64,
    truncated: bool,
}

#[derive(Debug, Eq, PartialEq)]
struct FilePreview {
    content: String,
    content_kind: &'static str,
    truncated: bool,
}

fn default_content_kind() -> String {
    "text".to_owned()
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Reasoning {
    Low,
    Medium,
    High,
}

impl Reasoning {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "low" => Ok(Self::Low),
            "medium" => Ok(Self::Medium),
            "high" => Ok(Self::High),
            _ => Err("Desteklenmeyen akıl yürütme seviyesi.".to_owned()),
        }
    }
}

#[tauri::command]
async fn execute_ai_prompt(
    mut request: ExecuteAiPromptRequest,
    on_event: tauri::ipc::Channel<ExecuteAiPromptEvent>,
) -> Result<ExecuteAiPromptResult, String> {
    #[cfg(debug_assertions)]
    eprintln!(
        "[line-ai] execute_ai_prompt engine=lineai prompt_chars={}",
        request.prompt.chars().count()
    );
    // The desktop app owns a single product route. Legacy preferences are
    // accepted by the UI migration layer but never executed natively.
    request.provider = "lineai".to_owned();
    request.truth_mode = true;
    validate_request(&request)?;

    Reasoning::parse(&request.reasoning)?;
    let current_prompt = compose_prompt(&request.prompt, request.attachments.as_deref());
    run_line_ai(&request, &current_prompt, &on_event).await
}

#[tauri::command]
async fn read_dropped_text_files(paths: Vec<String>) -> Result<Vec<DroppedTextFile>, String> {
    if paths.is_empty() {
        return Ok(Vec::new());
    }
    tauri::async_runtime::spawn_blocking(move || read_dropped_text_files_impl(&paths))
        .await
        .map_err(|_| "Bırakılan dosyalar güvenli şekilde okunamadı.".to_owned())?
}

fn read_dropped_text_files_impl(paths: &[String]) -> Result<Vec<DroppedTextFile>, String> {
    let candidates = collect_dropped_files(paths)?;
    let mut output = Vec::with_capacity(candidates.len());

    for (canonical_path, name) in candidates {
        let extension = canonical_path
            .extension()
            .map(|value| value.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default();
        let metadata = fs::metadata(&canonical_path)
            .map_err(|_| format!("{name} dosyasının boyutu okunamadı."))?;
        if metadata.len() > MAX_ATTACHMENT_SOURCE_BYTES {
            return Err(format!("{name} 512 MiB dosya sınırını aşıyor."));
        }

        if is_supported_archive(&canonical_path, &extension) {
            let archive_entries = read_archive_entries(
                &canonical_path,
                &name,
                MAX_ATTACHMENTS.saturating_sub(output.len()),
            )?;
            output.extend(archive_entries);
            continue;
        }

        let preview = read_file_preview(&canonical_path, &name)?;
        output.push(DroppedTextFile {
            content: preview.content,
            content_kind: preview.content_kind.to_owned(),
            mime_type: mime_type_for_extension(&extension, preview.content_kind == "binary")
                .to_owned(),
            name,
            size: metadata.len(),
            truncated: preview.truncated,
        });
    }

    Ok(output)
}

fn is_supported_archive(path: &Path, extension: &str) -> bool {
    if ARCHIVE_EXTENSIONS.contains(&extension) {
        return true;
    }
    let lower_name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    lower_name.ends_with(".tar.gz")
        || lower_name.ends_with(".tar.bz2")
        || lower_name.ends_with(".tar.xz")
}

fn read_archive_entries(
    archive_path: &Path,
    archive_name: &str,
    remaining_slots: usize,
) -> Result<Vec<DroppedTextFile>, String> {
    if remaining_slots == 0 {
        return Err("Tek işlemde en fazla 30 dosya eklenebilir.".to_owned());
    }

    let names_output = Command::new("tar")
        .arg("-tf")
        .arg(archive_path)
        .output()
        .map_err(|_| "Windows arşiv okuyucusu (bsdtar) başlatılamadı.".to_owned())?;
    if !names_output.status.success() {
        return Err(format!(
            "{archive_name} arşivi açılamadı; ZIP, RAR, 7z, TAR ve sıkıştırılmış TAR biçimleri desteklenir."
        ));
    }
    let verbose_output = Command::new("tar")
        .arg("-tvf")
        .arg(archive_path)
        .output()
        .map_err(|_| format!("{archive_name} arşiv bilgisi okunamadı."))?;
    if !verbose_output.status.success() {
        return Err(format!("{archive_name} arşiv girişleri doğrulanamadı."));
    }

    let names = String::from_utf8_lossy(&names_output.stdout)
        .lines()
        .map(str::trim_end)
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    let sizes = String::from_utf8_lossy(&verbose_output.stdout)
        .lines()
        .map(|line| {
            line.split_whitespace()
                .nth(4)
                .and_then(|value| value.parse::<u64>().ok())
                .unwrap_or(0)
        })
        .collect::<Vec<_>>();

    let mut files = Vec::new();
    for (index, entry_name) in names.into_iter().enumerate() {
        if entry_name.ends_with('/') || entry_name.ends_with('\\') {
            continue;
        }
        validate_archive_entry_name(&entry_name, archive_name)?;
        if files.len() >= remaining_slots {
            return Err(
                "Tek işlemde en fazla 30 dosya eklenebilir; arşiv içeriği de bu sınıra dahildir."
                    .to_owned(),
            );
        }
        let size = sizes.get(index).copied().unwrap_or(0);
        if size > MAX_ATTACHMENT_SOURCE_BYTES {
            return Err(format!(
                "{archive_name}/{entry_name} 512 MiB dosya sınırını aşıyor."
            ));
        }

        let preview = read_archive_entry_preview(archive_path, &entry_name, size, archive_name)?;
        let extension = Path::new(&entry_name)
            .extension()
            .map(|value| value.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default();
        files.push(DroppedTextFile {
            content: preview.content,
            content_kind: preview.content_kind.to_owned(),
            mime_type: mime_type_for_extension(&extension, preview.content_kind == "binary")
                .to_owned(),
            name: format!("{archive_name}/{entry_name}"),
            size,
            truncated: preview.truncated,
        });
    }

    if files.is_empty() {
        return Err(format!(
            "{archive_name} içinde eklenebilecek normal bir dosya bulunamadı."
        ));
    }
    Ok(files)
}

fn validate_archive_entry_name(entry_name: &str, archive_name: &str) -> Result<(), String> {
    let entry_path = Path::new(entry_name);
    let unsafe_path = entry_path.is_absolute()
        || entry_path.components().any(|component| {
            matches!(
                component,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        });
    if unsafe_path {
        return Err(format!(
            "{archive_name} güvenli olmayan bir dosya yolu içeriyor ve engellendi."
        ));
    }
    Ok(())
}

fn read_archive_entry_preview(
    archive_path: &Path,
    entry_name: &str,
    source_size: u64,
    archive_name: &str,
) -> Result<FilePreview, String> {
    let mut child = Command::new("tar")
        .arg("-xOf")
        .arg(archive_path)
        .arg("--")
        .arg(entry_name)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| format!("{archive_name}/{entry_name} arşivden okunamadı."))?;
    let mut bytes = Vec::with_capacity(MAX_ATTACHMENT_CONTEXT_BYTES + 1);
    if let Some(stdout) = child.stdout.take() {
        stdout
            .take((MAX_ATTACHMENT_CONTEXT_BYTES + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|_| format!("{archive_name}/{entry_name} önizlemesi okunamadı."))?;
    }
    if bytes.len() > MAX_ATTACHMENT_CONTEXT_BYTES {
        let _ = child.kill();
    }
    let status = child
        .wait()
        .map_err(|_| format!("{archive_name}/{entry_name} arşiv işlemi tamamlanamadı."))?;
    if !status.success() && bytes.is_empty() {
        return Err(format!(
            "{archive_name}/{entry_name} arşivden çıkarılamadı."
        ));
    }

    let truncated = source_size > MAX_ATTACHMENT_CONTEXT_BYTES as u64
        || bytes.len() > MAX_ATTACHMENT_CONTEXT_BYTES;
    if bytes.len() > MAX_ATTACHMENT_CONTEXT_BYTES {
        bytes.truncate(MAX_ATTACHMENT_CONTEXT_BYTES);
    }
    if looks_binary(&bytes) {
        return Ok(FilePreview {
            content: String::new(),
            content_kind: "binary",
            truncated: false,
        });
    }
    let content = decode_text_preview(bytes, truncated).unwrap_or_default();
    if content.is_empty() && source_size > 0 {
        return Ok(FilePreview {
            content: String::new(),
            content_kind: "binary",
            truncated: false,
        });
    }
    Ok(FilePreview {
        content,
        content_kind: "text",
        truncated,
    })
}

fn collect_dropped_files(paths: &[String]) -> Result<Vec<(PathBuf, String)>, String> {
    let mut files = Vec::new();
    let mut seen = HashSet::new();

    for raw_path in paths {
        let requested_path = Path::new(raw_path);
        if !requested_path.is_absolute() {
            return Err("Bırakılan dosya yolu geçerli değil.".to_owned());
        }

        let canonical_path = requested_path
            .canonicalize()
            .map_err(|_| "Bırakılan dosya veya klasörlerden biri bulunamadı.".to_owned())?;
        let metadata = fs::symlink_metadata(&canonical_path)
            .map_err(|_| "Bırakılan öğenin türü okunamadı.".to_owned())?;
        if metadata.file_type().is_symlink() {
            return Err("Sembolik bağlantılar güvenlik nedeniyle eklenemez.".to_owned());
        }

        if metadata.is_file() {
            let name = canonical_path
                .file_name()
                .map(|value| value.to_string_lossy().into_owned())
                .ok_or_else(|| "Bırakılan dosyanın adı okunamadı.".to_owned())?;
            push_candidate(&mut files, &mut seen, canonical_path, name)?;
        } else if metadata.is_dir() {
            let root_name = canonical_path
                .file_name()
                .map(|value| value.to_string_lossy().into_owned())
                .unwrap_or_else(|| "klasör".to_owned());
            collect_directory_files(
                &canonical_path,
                &canonical_path,
                &root_name,
                &mut files,
                &mut seen,
            )?;
        } else {
            return Err("Bırakılan öğe desteklenen bir dosya veya klasör değil.".to_owned());
        }
    }

    if files.is_empty() && !paths.is_empty() {
        return Err("Klasörde eklenebilecek normal bir dosya bulunamadı.".to_owned());
    }
    Ok(files)
}

fn collect_directory_files(
    root: &Path,
    directory: &Path,
    root_name: &str,
    files: &mut Vec<(PathBuf, String)>,
    seen: &mut HashSet<PathBuf>,
) -> Result<(), String> {
    let mut entries = fs::read_dir(directory)
        .map_err(|_| format!("{} klasörü okunamadı.", directory.display()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| format!("{} klasörünün içeriği okunamadı.", directory.display()))?;
    entries.sort_by_key(|entry| entry.path());

    for entry in entries {
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|_| format!("{} öğesinin türü okunamadı.", path.display()))?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            if path
                .file_name()
                .map(|name| {
                    SKIPPED_DIRECTORY_NAMES
                        .iter()
                        .any(|skipped| name.eq_ignore_ascii_case(skipped))
                })
                .unwrap_or(false)
            {
                continue;
            }
            collect_directory_files(root, &path, root_name, files, seen)?;
            continue;
        }
        if !metadata.is_file() {
            continue;
        }

        let canonical_path = path
            .canonicalize()
            .map_err(|_| format!("{} dosyası doğrulanamadı.", path.display()))?;
        if !canonical_path.starts_with(root) {
            return Err("Klasör dışına çıkan bir dosya yolu engellendi.".to_owned());
        }
        let relative = canonical_path
            .strip_prefix(root)
            .map_err(|_| "Klasör içindeki dosya yolu çözülemedi.".to_owned())?;
        let name = Path::new(root_name)
            .join(relative)
            .to_string_lossy()
            .replace('\\', "/");
        push_candidate(files, seen, canonical_path, name)?;
    }
    Ok(())
}

fn push_candidate(
    files: &mut Vec<(PathBuf, String)>,
    seen: &mut HashSet<PathBuf>,
    path: PathBuf,
    name: String,
) -> Result<(), String> {
    if seen.insert(path.clone()) {
        files.push((path, name));
    }
    if files.len() > MAX_ATTACHMENTS {
        return Err("Tek işlemde en fazla 30 dosya eklenebilir.".to_owned());
    }
    Ok(())
}

fn read_file_preview(path: &Path, name: &str) -> Result<FilePreview, String> {
    let mut bytes = Vec::with_capacity(MAX_ATTACHMENT_CONTEXT_BYTES + 1);
    File::open(path)
        .and_then(|file| {
            file.take((MAX_ATTACHMENT_CONTEXT_BYTES + 1) as u64)
                .read_to_end(&mut bytes)
        })
        .map_err(|_| format!("{name} güvenli şekilde okunamadı."))?;

    let truncated = bytes.len() > MAX_ATTACHMENT_CONTEXT_BYTES;
    if truncated {
        bytes.truncate(MAX_ATTACHMENT_CONTEXT_BYTES);
    }
    if looks_binary(&bytes) {
        return Ok(FilePreview {
            content: String::new(),
            content_kind: "binary",
            truncated: false,
        });
    }

    let content = decode_text_preview(bytes, truncated).unwrap_or_default();
    if content.is_empty() && fs::metadata(path).map(|value| value.len()).unwrap_or(0) > 0 {
        return Ok(FilePreview {
            content: String::new(),
            content_kind: "binary",
            truncated: false,
        });
    }
    Ok(FilePreview {
        content,
        content_kind: "text",
        truncated,
    })
}

fn decode_text_preview(mut bytes: Vec<u8>, truncated: bool) -> Option<String> {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        bytes.drain(..3);
    }
    if bytes.starts_with(&[0xFF, 0xFE]) {
        return Some(decode_utf16(&bytes[2..], true));
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        return Some(decode_utf16(&bytes[2..], false));
    }

    match String::from_utf8(bytes) {
        Ok(content) => Some(content),
        Err(error) if truncated && error.utf8_error().error_len().is_none() => {
            let valid_up_to = error.utf8_error().valid_up_to();
            String::from_utf8(error.into_bytes()[..valid_up_to].to_vec()).ok()
        }
        Err(_) => None,
    }
}

fn decode_utf16(bytes: &[u8], little_endian: bool) -> String {
    let units = bytes.chunks_exact(2).map(|pair| {
        if little_endian {
            u16::from_le_bytes([pair[0], pair[1]])
        } else {
            u16::from_be_bytes([pair[0], pair[1]])
        }
    });
    char::decode_utf16(units)
        .map(|item| item.unwrap_or(char::REPLACEMENT_CHARACTER))
        .collect()
}

fn looks_binary(bytes: &[u8]) -> bool {
    if bytes.is_empty() {
        return false;
    }
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF])
        || bytes.starts_with(&[0xFF, 0xFE])
        || bytes.starts_with(&[0xFE, 0xFF])
    {
        return false;
    }
    let known_binary = [
        b"\x89PNG\r\n\x1a\n".as_slice(),
        b"GIF87a".as_slice(),
        b"GIF89a".as_slice(),
        b"%PDF-".as_slice(),
        b"PK\x03\x04".as_slice(),
        b"MZ".as_slice(),
        b"\x7fELF".as_slice(),
    ];
    if known_binary.iter().any(|magic| bytes.starts_with(magic)) {
        return true;
    }
    let sample = &bytes[..bytes.len().min(8 * 1024)];
    let controls = sample
        .iter()
        .filter(|byte| **byte == 0 || (**byte < 0x08) || (**byte > 0x0D && **byte < 0x20))
        .count();
    controls * 100 > sample.len() * 3
}

fn mime_type_for_extension(extension: &str, binary: bool) -> &'static str {
    match extension {
        "json" => "application/json",
        "jsonl" | "ndjson" => "application/x-ndjson",
        "csv" => "text/csv",
        "htm" | "html" => "text/html",
        "css" => "text/css",
        "js" | "jsx" | "mjs" | "cjs" => "text/javascript",
        "ts" | "tsx" | "mts" | "cts" => "text/typescript",
        "toml" => "application/toml",
        "yaml" | "yml" => "application/yaml",
        "xml" | "svg" => "application/xml",
        "pdf" => "application/pdf",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "mp4" => "video/mp4",
        "zip" => "application/zip",
        "rar" => "application/vnd.rar",
        "7z" => "application/x-7z-compressed",
        "tar" => "application/x-tar",
        "bz2" | "tbz" | "tbz2" => "application/x-bzip2",
        "xz" | "txz" => "application/x-xz",
        "gz" => "application/gzip",
        _ if binary => "application/octet-stream",
        _ => "text/plain",
    }
}

async fn run_line_ai(
    request: &ExecuteAiPromptRequest,
    current_prompt: &str,
    on_event: &tauri::ipc::Channel<ExecuteAiPromptEvent>,
) -> Result<ExecuteAiPromptResult, String> {
    emit_event(
        on_event,
        ExecuteAiPromptEvent::Status {
            label: "Line AI Engine yanıtı hazırlanıyor".to_owned(),
        },
    );
    let response = engine::generate_text(engine::EngineTextRequest {
        prompt: current_prompt.to_owned(),
        transcript: request
            .transcript
            .iter()
            .map(|turn| engine::EngineTranscriptTurn {
                role: turn.role.clone(),
                content: turn.content.clone(),
            })
            .collect(),
        custom_instructions: request.custom_instructions.clone(),
        response_style: request.response_style.clone(),
        reasoning: request.reasoning.clone(),
        truth_mode: request.truth_mode,
    })
    .await?;
    emit_event(
        on_event,
        ExecuteAiPromptEvent::TextDelta {
            text: response.message.clone(),
        },
    );
    Ok(ExecuteAiPromptResult {
        message: response.message,
        model: response.model,
        provider: "lineai".to_owned(),
        request_id: Some(response.request_id),
        sources: Vec::new(),
    })
}

fn emit_event(channel: &tauri::ipc::Channel<ExecuteAiPromptEvent>, event: ExecuteAiPromptEvent) {
    if let Err(_error) = channel.send(event) {
        #[cfg(debug_assertions)]
        eprintln!("[line-ai] event_channel_error: {_error}");
    }
}

fn validate_request(request: &ExecuteAiPromptRequest) -> Result<(), String> {
    if request.prompt.trim().is_empty() {
        return Err("Mesaj boş olamaz.".to_owned());
    }
    if request.prompt.len() > MAX_PROMPT_BYTES {
        return Err("Mesaj 100 KB sınırını aşıyor.".to_owned());
    }
    if request.transcript.len() > MAX_TRANSCRIPT_TURNS {
        return Err("Sohbet geçmişi 80 ileti sınırını aşıyor.".to_owned());
    }
    if request
        .custom_instructions
        .as_deref()
        .is_some_and(|value| value.len() > MAX_CUSTOM_INSTRUCTIONS_BYTES)
    {
        return Err("Özel talimatlar 12 KB sınırını aşıyor.".to_owned());
    }
    if request
        .response_style
        .as_deref()
        .is_some_and(|value| !matches!(value, "balanced" | "concise" | "detailed"))
    {
        return Err("Yanıt stili geçersiz.".to_owned());
    }

    let transcript_bytes: usize = request
        .transcript
        .iter()
        .map(|turn| turn.content.len())
        .sum();
    if transcript_bytes > MAX_TRANSCRIPT_BYTES {
        return Err("Sohbet geçmişi güvenli boyut sınırını aşıyor.".to_owned());
    }

    for turn in &request.transcript {
        if turn.role != "user" && turn.role != "assistant" {
            return Err("Sohbet geçmişinde geçersiz rol bulundu.".to_owned());
        }
    }

    if let Some(attachments) = &request.attachments {
        if attachments.len() > MAX_ATTACHMENTS {
            return Err("Tek işlemde en fazla 30 dosya eklenebilir.".to_owned());
        }
        if attachments
            .iter()
            .any(|attachment| attachment.size > MAX_ATTACHMENT_SOURCE_BYTES)
        {
            return Err("Eklenen dosyalardan biri 512 MiB sınırını aşıyor.".to_owned());
        }
        if attachments
            .iter()
            .any(|attachment| attachment.content.len() > MAX_ATTACHMENT_CONTEXT_BYTES)
        {
            return Err("Eklenen dosya önizlemesi güvenli bağlam sınırını aşıyor.".to_owned());
        }
        let total_attachment_bytes: usize = attachments
            .iter()
            .map(|attachment| attachment.content.len())
            .sum();
        if total_attachment_bytes > MAX_TOTAL_ATTACHMENT_CONTEXT_BYTES {
            return Err(
                "Eklenen dosyaların toplam metin bağlamı 2 MiB sınırını aşıyor.".to_owned(),
            );
        }
        if attachments.iter().any(|attachment| {
            attachment.content_kind != "text" && attachment.content_kind != "binary"
        }) {
            return Err("Eklenen dosyalardan birinin içerik türü geçersiz.".to_owned());
        }
        if attachments
            .iter()
            .any(|attachment| attachment.content_kind == "binary" && !attachment.content.is_empty())
        {
            return Err("İkili dosya baytları metin bağlamına eklenemez.".to_owned());
        }
    }

    Ok(())
}

fn compose_prompt(prompt: &str, attachments: Option<&[PromptAttachment]>) -> String {
    let mut output = prompt.trim().to_owned();
    for attachment in attachments.unwrap_or_default() {
        let safe_name = attachment
            .name
            .replace(['\r', '\n'], " ")
            .chars()
            .take(180)
            .collect::<String>();
        let safe_mime = attachment
            .mime_type
            .replace(['\r', '\n'], " ")
            .chars()
            .take(100)
            .collect::<String>();
        let preview_note = if attachment.content_kind == "binary" {
            format!(
                "\n[İkili dosya: {} bayt. Ham baytlar güvenlik ve bağlam sınırları nedeniyle Engine'e gönderilmedi; dosya adı, MIME türü ve boyutu kullanılabilir.]",
                attachment.size
            )
        } else if attachment.truncated {
            format!(
                "\n[Not: Kaynak {} bayt; güvenli bağlam için ilk {} baytlık metin önizlemesi kullanılıyor.]",
                attachment.size, MAX_ATTACHMENT_CONTEXT_BYTES
            )
        } else {
            String::new()
        };
        output.push_str(&format!(
            "\n\n--- EK DOSYA: {safe_name} ({safe_mime}) ---{preview_note}\n{}\n--- EK DOSYA SONU ---",
            attachment.content
        ));
    }
    output
}

#[cfg(not(test))]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(browser::BrowserRuntime::default())
        .manage(workspace::WorkspaceRuntime::default())
        .invoke_handler(tauri::generate_handler![
            browser::execute_browser_tool,
            browser::get_browser_status,
            browser::start_browser_session,
            browser::stop_browser_session,
            cloud::clear_cloud_conversations,
            cloud::delete_cloud_conversation,
            cloud::delete_cloud_installation,
            cloud::get_cloud_status,
            cloud::load_cloud_conversations,
            cloud::upsert_cloud_conversation,
            workspace::cancel_terminal,
            workspace::create_workspace_checkpoint,
            workspace::execute_terminal,
            workspace::inspect_workspace_checkpoint,
            workspace::read_git_status,
            workspace::restore_workspace_checkpoint,
            engine::delete_engine_image,
            engine::delete_engine_key,
            engine::download_engine_asset,
            engine::generate_engine_image,
            engine::get_engine_asset,
            engine::get_engine_image,
            engine::get_engine_status,
            engine::save_engine_key,
            engine::submit_engine_feedback,
            execute_ai_prompt,
            read_dropped_text_files
        ])
        .run(tauri::generate_context!())
        .expect("Line AI başlatılamadı");
}

#[cfg(test)]
pub fn run() {}

#[cfg(test)]
mod tests {
    use super::{read_dropped_text_files_impl, Reasoning};
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn accepts_supported_engine_reasoning_levels() {
        assert_eq!(Reasoning::parse("low").unwrap(), Reasoning::Low);
        assert_eq!(Reasoning::parse("medium").unwrap(), Reasoning::Medium);
        assert_eq!(Reasoning::parse("high").unwrap(), Reasoning::High);
        assert!(Reasoning::parse("ultra").is_err());
    }

    #[test]
    fn reads_utf8_text_files_from_absolute_paths() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("line-ai-drop-{nonce}.md"));
        fs::write(&path, "# Güvenli dosya\n").unwrap();

        let result = read_dropped_text_files_impl(&[path.to_string_lossy().into_owned()]).unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, path.file_name().unwrap().to_string_lossy());
        assert_eq!(result[0].content, "# Güvenli dosya\n");
        assert_eq!(result[0].content_kind, "text");
        assert!(!result[0].truncated);
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn expands_folders_recursively_and_accepts_every_regular_file_extension() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("line-ai-folder-drop-{nonce}"));
        let nested = root.join("src");
        fs::create_dir_all(&nested).unwrap();
        fs::write(root.join("README.md"), "# Proje\n").unwrap();
        fs::write(nested.join("main.rs"), "fn main() {}\n").unwrap();
        fs::write(root.join("config.ini"), "theme=dark\n").unwrap();
        fs::write(root.join("binary.exe"), [b'M', b'Z', 0, 1, 2, 3]).unwrap();

        let result = read_dropped_text_files_impl(&[root.to_string_lossy().into_owned()]).unwrap();

        assert_eq!(result.len(), 4);
        assert!(result.iter().any(|file| file.name.ends_with("README.md")));
        assert!(result.iter().any(|file| file.name.ends_with("src/main.rs")));
        assert!(result
            .iter()
            .any(|file| { file.name.ends_with("config.ini") && file.content_kind == "text" }));
        assert!(result.iter().any(|file| {
            file.name.ends_with("binary.exe")
                && file.content_kind == "binary"
                && file.content.is_empty()
        }));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn truncates_large_text_to_a_bounded_engine_preview() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("line-ai-preview-{nonce}.txt"));
        fs::write(&path, vec![b'a'; super::MAX_ATTACHMENT_CONTEXT_BYTES + 64]).unwrap();

        let result = read_dropped_text_files_impl(&[path.to_string_lossy().into_owned()]).unwrap();

        assert_eq!(result[0].content.len(), super::MAX_ATTACHMENT_CONTEXT_BYTES);
        assert!(result[0].truncated);
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn accepts_unknown_text_extensions() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("line-ai-drop-{nonce}.graphql"));
        fs::write(&path, "query Viewer { viewer { id } }\n").unwrap();

        let result = read_dropped_text_files_impl(&[path.to_string_lossy().into_owned()]).unwrap();

        assert_eq!(result[0].content_kind, "text");
        assert!(result[0].content.contains("query Viewer"));
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn decodes_utf16_little_endian_text() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("line-ai-drop-{nonce}.reg"));
        let mut bytes = vec![0xFF, 0xFE];
        for unit in "Türkçe içerik".encode_utf16() {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        fs::write(&path, bytes).unwrap();

        let result = read_dropped_text_files_impl(&[path.to_string_lossy().into_owned()]).unwrap();

        assert_eq!(result[0].content_kind, "text");
        assert_eq!(result[0].content, "Türkçe içerik");
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn keeps_binary_files_as_safe_metadata_only_attachments() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("line-ai-drop-{nonce}.png"));
        fs::write(&path, b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR").unwrap();

        let result = read_dropped_text_files_impl(&[path.to_string_lossy().into_owned()]).unwrap();

        assert_eq!(result[0].content_kind, "binary");
        assert_eq!(result[0].mime_type, "image/png");
        assert!(result[0].content.is_empty());
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn expands_zip_archives_without_extracting_them_to_disk() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("line-ai-archive-source-{nonce}"));
        let archive = std::env::temp_dir().join(format!("line-ai-archive-{nonce}.zip"));
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("notes.txt"), "Arşiv notu\n").unwrap();
        fs::write(root.join("src").join("main.rs"), "fn main() {}\n").unwrap();
        let status = std::process::Command::new("tar")
            .arg("-acf")
            .arg(&archive)
            .arg("-C")
            .arg(&root)
            .arg("notes.txt")
            .arg("src")
            .status()
            .unwrap();
        assert!(status.success());

        let result =
            read_dropped_text_files_impl(&[archive.to_string_lossy().into_owned()]).unwrap();

        assert_eq!(result.len(), 2);
        assert!(result.iter().any(|file| {
            file.name.ends_with(".zip/notes.txt")
                && file.content == "Arşiv notu\n"
                && file.content_kind == "text"
        }));
        assert!(result.iter().any(|file| {
            file.name.ends_with(".zip/src/main.rs") && file.content.contains("fn main")
        }));
        fs::remove_dir_all(root).unwrap();
        fs::remove_file(archive).unwrap();
    }
}
