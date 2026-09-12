use keyring::{Entry, Error as KeyringError};
use reqwest::{redirect::Policy, Client, StatusCode, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    env, fs,
    path::PathBuf,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

const DEFAULT_ENGINE_ROOT: &str = "https://lineaicloud.vercel.app/api/v1";
const KEYRING_SERVICE: &str = "app.lineai.desktop";
const KEYRING_USER: &str = "engine-api-key-v1";
const MAX_IMAGE_BYTES: usize = 24 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineCapabilities {
    pub enabled: bool,
    pub text: bool,
    pub images: bool,
    #[serde(default)]
    pub image_unavailable_reason: Option<String>,
    pub project: EngineProject,
    pub quota: EngineQuota,
    pub policy_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineProject {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineQuota {
    pub daily_units: u64,
    pub monthly_units: u64,
    pub used_daily: u64,
    pub used_monthly: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    pub configured: bool,
    pub endpoint: String,
    pub capabilities: Option<EngineCapabilities>,
    pub message: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineTextRequest {
    pub prompt: String,
    pub transcript: Vec<EngineTranscriptTurn>,
    pub custom_instructions: Option<String>,
    pub response_style: Option<String>,
    pub reasoning: String,
    pub truth_mode: bool,
}
#[derive(Debug, Deserialize, Serialize)]
pub struct EngineTranscriptTurn {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineTextResponse {
    pub message: String,
    pub model: String,
    pub provider: String,
    #[serde(default)]
    pub sources: Vec<Value>,
    pub request_id: String,
    pub policy_version: String,
    pub usage: EngineUsage,
}
#[derive(Debug, Deserialize, Serialize)]
pub struct EngineUsage {
    pub units: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineFeedbackRequest {
    pub request_id: String,
    pub rating: String,
    #[serde(default)]
    pub note: Option<String>,
    pub training_opt_in: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineFeedbackResult {
    pub saved: bool,
    pub training_opt_in: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenerationRequest {
    pub prompt: String,
    pub aspect_ratio: String,
    pub quality: String,
    pub style: String,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageJob {
    pub id: String,
    pub status: String,
    pub asset_id: Option<String>,
    pub model: Option<String>,
    pub created_at: Option<String>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AssetResponse {
    url: String,
    expires_in: u64,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedImage {
    pub path: String,
    pub bytes: usize,
}

fn engine_root() -> Result<String, String> {
    normalize_engine_root(
        &env::var("LINE_AI_ENGINE_URL").unwrap_or_else(|_| DEFAULT_ENGINE_ROOT.to_owned()),
    )
}
fn normalize_engine_root(value: &str) -> Result<String, String> {
    let mut url = Url::parse(value.trim().trim_end_matches('/'))
        .map_err(|_| "Line AI Engine adresi geçerli bir HTTPS adresi değil.".to_owned())?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(
            "Line AI Engine adresi HTTPS olmalı; kimlik bilgisi, sorgu veya parça içeremez."
                .to_owned(),
        );
    }
    url.set_query(None);
    url.set_fragment(None);
    Ok(url.as_str().trim_end_matches('/').to_owned())
}
fn client() -> Result<Client, String> {
    Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(120))
        .user_agent(concat!("Line-AI/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| "Line AI Engine ağ istemcisi başlatılamadı.".to_owned())
}
fn entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|_| "Windows Credential Manager açılamadı.".to_owned())
}
fn read_key_sync() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(_) => Err("Line AI Engine anahtarı okunamadı.".to_owned()),
    }
}
async fn read_key() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(read_key_sync)
        .await
        .map_err(|_| "Windows Credential Manager işlemi tamamlanamadı.".to_owned())?
}
pub async fn is_engine_key_configured() -> Result<bool, String> {
    Ok(read_key().await?.is_some())
}
fn valid_key(value: &str) -> bool {
    let value = value.trim();
    value.len() == 55
        && value.starts_with("lai_sk_live_")
        && value[12..]
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}
async fn authorized_client() -> Result<(Client, String, String), String> {
    let root = engine_root()?;
    let key = read_key()
        .await?
        .ok_or_else(|| "Line AI Engine anahtarı eklenmemiş.".to_owned())?;
    Ok((client()?, root, key))
}
async fn api_error(response: reqwest::Response, operation: &str) -> String {
    let status = response.status();
    let detail = response
        .json::<Value>()
        .await
        .ok()
        .and_then(|v| {
            v.pointer("/error/message")
                .and_then(Value::as_str)
                .or_else(|| v.get("message").and_then(Value::as_str))
                .map(str::to_owned)
        })
        .unwrap_or_else(|| format!("HTTP {}", status.as_u16()));
    format!("{operation} başarısız oldu: {detail}")
}

#[tauri::command]
pub async fn save_engine_key(key: String) -> Result<(), String> {
    let key = key.trim().to_owned();
    if !valid_key(&key) {
        return Err("Line AI Engine anahtar biçimi geçersiz.".to_owned());
    }
    tauri::async_runtime::spawn_blocking(move || {
        entry()?.set_password(&key).map_err(|_| {
            "Line AI Engine anahtarı Windows Credential Manager'a kaydedilemedi.".to_owned()
        })
    })
    .await
    .map_err(|_| "Windows Credential Manager işlemi tamamlanamadı.".to_owned())?
}
#[tauri::command]
pub async fn delete_engine_key() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| match entry()?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(_) => Err("Line AI Engine anahtarı silinemedi.".to_owned()),
    })
    .await
    .map_err(|_| "Windows Credential Manager işlemi tamamlanamadı.".to_owned())?
}
#[tauri::command]
pub async fn get_engine_status() -> Result<EngineStatus, String> {
    let endpoint = engine_root()?;
    let Some(key) = read_key().await? else {
        return Ok(EngineStatus {
            configured: false,
            endpoint,
            capabilities: None,
            message: "Engine anahtarı eklenmemiş.".to_owned(),
        });
    };
    let request = client()?
        .get(format!("{endpoint}/capabilities"))
        .bearer_auth(&key)
        .send()
        .await
        .map_err(|_| "Line AI Engine durumuna bağlanılamadı.".to_owned())?;
    if !request.status().is_success() {
        return Ok(EngineStatus {
            configured: true,
            endpoint,
            capabilities: None,
            message: api_error(request, "Engine durumu").await,
        });
    }
    let capabilities = request
        .json::<EngineCapabilities>()
        .await
        .map_err(|_| "Engine yetenek yanıtı geçersiz.".to_owned())?;
    Ok(EngineStatus {
        configured: true,
        endpoint,
        capabilities: Some(capabilities),
        message: "Engine hazır.".to_owned(),
    })
}
pub async fn generate_text(request: EngineTextRequest) -> Result<EngineTextResponse, String> {
    let (client, root, key) = authorized_client().await?;
    let response = client
        .post(format!("{root}/generate"))
        .bearer_auth(&key)
        .header("Idempotency-Key", Uuid::new_v4().to_string())
        .json(&request)
        .send()
        .await
        .map_err(|_| "Line AI Engine'e bağlanılamadı.".to_owned())?;
    if !response.status().is_success() {
        return Err(api_error(response, "Line AI yanıtı").await);
    }
    let output = response
        .json::<EngineTextResponse>()
        .await
        .map_err(|_| "Line AI Engine yanıtı geçersiz.".to_owned())?;
    if output.provider != "lineai" || output.message.trim().is_empty() {
        return Err("Line AI Engine geçerli bir yanıt döndürmedi.".to_owned());
    }
    Ok(output)
}

#[tauri::command]
pub async fn submit_engine_feedback(
    request: EngineFeedbackRequest,
) -> Result<EngineFeedbackResult, String> {
    let request_id = validate_id(&request.request_id)?;
    if !matches!(request.rating.as_str(), "up" | "down") {
        return Err("Geri bildirim oyu geçersiz.".to_owned());
    }
    let note = if request.training_opt_in {
        request
            .note
            .as_deref()
            .map(str::trim)
            .filter(|note| !note.is_empty())
            .map(str::to_owned)
    } else {
        None
    };
    if note
        .as_deref()
        .is_some_and(|note| note.chars().count() > 2_000)
    {
        return Err("Geri bildirim notu en fazla 2000 karakter olabilir.".to_owned());
    }

    let (client, root, key) = authorized_client().await?;
    let response = client
        .post(format!("{root}/feedback"))
        .bearer_auth(&key)
        .json(&serde_json::json!({
            "requestId": request_id,
            "rating": request.rating,
            "note": note,
            "trainingOptIn": request.training_opt_in,
        }))
        .send()
        .await
        .map_err(|_| "Line AI geri bildirimi gönderilemedi.".to_owned())?;
    if !response.status().is_success() {
        return Err(api_error(response, "Line AI geri bildirimi").await);
    }
    response
        .json::<EngineFeedbackResult>()
        .await
        .map_err(|_| "Line AI geri bildirim yanıtı geçersiz.".to_owned())
}
fn validate_image_request(request: &ImageGenerationRequest) -> Result<(), String> {
    if request.prompt.trim().is_empty() || request.prompt.len() > 8_000 {
        return Err("Görsel istemi geçersiz.".to_owned());
    }
    if !matches!(request.aspect_ratio.as_str(), "1:1" | "3:2" | "2:3")
        || !matches!(request.quality.as_str(), "low" | "medium" | "high")
        || !matches!(
            request.style.as_str(),
            "natural" | "illustration" | "product" | "poster"
        )
    {
        return Err("Görsel ayarlarından biri geçersiz.".to_owned());
    }
    Ok(())
}
#[tauri::command]
pub async fn generate_engine_image(request: ImageGenerationRequest) -> Result<ImageJob, String> {
    validate_image_request(&request)?;
    let (client, root, key) = authorized_client().await?;
    let response = client
        .post(format!("{root}/images/generations"))
        .bearer_auth(&key)
        .header("Idempotency-Key", Uuid::new_v4().to_string())
        .json(&request)
        .send()
        .await
        .map_err(|_| "Line AI görsel isteğine bağlanılamadı.".to_owned())?;
    if !response.status().is_success() {
        return Err(api_error(response, "Görsel üretimi").await);
    }
    response
        .json()
        .await
        .map_err(|_| "Görsel işi yanıtı geçersiz.".to_owned())
}
#[tauri::command]
pub async fn get_engine_image(job_id: String) -> Result<ImageJob, String> {
    let id = validate_id(&job_id)?;
    let (client, root, key) = authorized_client().await?;
    let response = client
        .get(format!("{root}/images/{id}"))
        .bearer_auth(&key)
        .send()
        .await
        .map_err(|_| "Görsel işi okunamadı.".to_owned())?;
    if !response.status().is_success() {
        return Err(api_error(response, "Görsel işi").await);
    }
    response
        .json()
        .await
        .map_err(|_| "Görsel işi yanıtı geçersiz.".to_owned())
}
#[tauri::command]
pub async fn delete_engine_image(job_id: String) -> Result<(), String> {
    let id = validate_id(&job_id)?;
    let (client, root, key) = authorized_client().await?;
    let response = client
        .delete(format!("{root}/images/{id}"))
        .bearer_auth(&key)
        .send()
        .await
        .map_err(|_| "Görsel silme isteği gönderilemedi.".to_owned())?;
    if response.status() == StatusCode::NO_CONTENT || response.status().is_success() {
        Ok(())
    } else {
        Err(api_error(response, "Görsel silme").await)
    }
}
fn validate_id(value: &str) -> Result<&str, String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 180
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        Err("Geçersiz görsel kimliği.".to_owned())
    } else {
        Ok(value)
    }
}
async fn resolve_asset(asset_id: &str) -> Result<AssetResponse, String> {
    let id = validate_id(asset_id)?;
    let (client, root, key) = authorized_client().await?;
    let response = client
        .get(format!("{root}/assets/{id}"))
        .bearer_auth(&key)
        .send()
        .await
        .map_err(|_| "Görsel varlığı okunamadı.".to_owned())?;
    if !response.status().is_success() {
        return Err(api_error(response, "Görsel varlığı").await);
    }
    let asset = response
        .json::<AssetResponse>()
        .await
        .map_err(|_| "Görsel varlığı yanıtı geçersiz.".to_owned())?;
    if asset.expires_in == 0 || asset.expires_in > 600 {
        return Err("Görsel varlığı geçerlilik süresi güvenli değil.".to_owned());
    }
    validate_asset_url(&asset.url, &root)?;
    Ok(asset)
}
#[tauri::command]
pub async fn get_engine_asset(asset_id: String) -> Result<String, String> {
    Ok(resolve_asset(&asset_id).await?.url)
}
fn validate_asset_url(value: &str, root: &str) -> Result<(), String> {
    let asset = Url::parse(value).map_err(|_| "Görsel varlığı URL'si geçersiz.".to_owned())?;
    let engine = Url::parse(root).map_err(|_| "Engine adresi geçersiz.".to_owned())?;
    let host = asset.host_str().unwrap_or_default().to_ascii_lowercase();
    if asset.scheme() != "https"
        || !asset.username().is_empty()
        || asset.password().is_some()
        || asset.fragment().is_some()
        || (host != engine.host_str().unwrap_or_default().to_ascii_lowercase()
            && !(host.ends_with(".supabase.co") && asset.path().contains("/storage/v1/object/")))
    {
        return Err("Görsel varlığı güvenilir bir HTTPS depolama adresi değil.".to_owned());
    }
    Ok(())
}
#[tauri::command]
pub async fn download_engine_asset(
    asset_id: String,
    file_name: Option<String>,
) -> Result<SavedImage, String> {
    let asset = resolve_asset(&asset_id).await?;
    let response = client()?
        .get(&asset.url)
        .send()
        .await
        .map_err(|_| "Görsel indirilemedi.".to_owned())?;
    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|size| size > MAX_IMAGE_BYTES as u64)
    {
        return Err("Görsel indirme sınırı aşıldı veya sunucu hatası oluştu.".to_owned());
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|_| "Görsel indirilemedi.".to_owned())?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("Görsel 24 MiB sınırını aşıyor.".to_owned());
    }
    let profile = env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .ok_or_else(|| "Windows kullanıcı klasörü bulunamadı.".to_owned())?;
    let base = profile.join("Downloads").join("Line AI Images");
    fs::create_dir_all(&base).map_err(|_| "İndirme klasörü oluşturulamadı.".to_owned())?;
    let safe = file_name
        .unwrap_or_else(|| {
            format!(
                "line-ai-{}.png",
                &asset_id.chars().take(32).collect::<String>()
            )
        })
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
        .collect::<String>();
    let name = if safe.is_empty() {
        format!(
            "line-ai-{}.png",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
        )
    } else {
        safe
    };
    let path: PathBuf = base.join(name);
    fs::write(&path, &bytes).map_err(|_| "Görsel diske kaydedilemedi.".to_owned())?;
    Ok(SavedImage {
        path: path.to_string_lossy().to_string(),
        bytes: bytes.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::{normalize_engine_root, valid_key, validate_image_request, ImageGenerationRequest};
    #[test]
    fn engine_root_rejects_non_https_or_credentials() {
        assert!(normalize_engine_root("https://lineaicloud.vercel.app/api/v1").is_ok());
        assert!(normalize_engine_root("http://localhost/api/v1").is_err());
        assert!(normalize_engine_root("https://u:p@lineaicloud.vercel.app/api/v1").is_err());
        assert!(normalize_engine_root("https://lineaicloud.vercel.app/api/v1?q=x").is_err());
    }
    #[test]
    fn validates_live_key_shape() {
        assert!(valid_key(&format!("lai_sk_live_{}", "A".repeat(43))));
        assert!(!valid_key("lai_sk_live_short"));
    }
    #[test]
    fn accepts_only_contract_image_choices() {
        assert!(validate_image_request(&ImageGenerationRequest {
            prompt: "a".into(),
            aspect_ratio: "1:1".into(),
            quality: "high".into(),
            style: "poster".into()
        })
        .is_ok());
        assert!(validate_image_request(&ImageGenerationRequest {
            prompt: "a".into(),
            aspect_ratio: "wide".into(),
            quality: "high".into(),
            style: "poster".into()
        })
        .is_err());
    }
}
