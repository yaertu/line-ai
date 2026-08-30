use keyring::{Entry, Error as KeyringError};
use reqwest::{Client, Method, Response, StatusCode, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{env, time::Duration};

const DEFAULT_CLOUD_ROOT: &str = "https://lineai-eta.vercel.app/api/v1";
const KEYRING_SERVICE: &str = "app.lineai.desktop";
const KEYRING_USER: &str = "cloud-installation-v1";
const MAX_CONVERSATION_BYTES: usize = 512 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CloudCredentials {
    installation_id: String,
    secret: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegistrationResponse {
    installation_id: String,
    secret: String,
}

#[derive(Debug, Deserialize)]
struct ConversationListResponse {
    conversations: Vec<Value>,
}

#[derive(Debug, Deserialize)]
struct ErrorEnvelope {
    error: Option<ErrorBody>,
}

#[derive(Debug, Deserialize)]
struct ErrorBody {
    message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudStatus {
    connected: bool,
    endpoint: String,
    message: String,
    registered: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudConversationList {
    conversations: Vec<Value>,
    endpoint: String,
}

fn cloud_root() -> Result<String, String> {
    normalize_cloud_root(
        &env::var("LINE_AI_CLOUD_URL").unwrap_or_else(|_| DEFAULT_CLOUD_ROOT.to_owned()),
    )
}

fn normalize_cloud_root(value: &str) -> Result<String, String> {
    let trimmed = value.trim().trim_end_matches('/');
    let mut url = Url::parse(trimmed)
        .map_err(|_| "Line AI Cloud adresi geçerli bir HTTPS adresi değil.".to_owned())?;
    let allowed_http = url.scheme() == "http"
        && matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "::1"));
    if url.scheme() != "https" && !allowed_http {
        return Err("Line AI Cloud bağlantısı HTTPS kullanmalıdır.".to_owned());
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("Line AI Cloud adresi kimlik bilgisi, sorgu veya parça içeremez.".to_owned());
    }
    if !url.path().trim_end_matches('/').ends_with("/api/v1") {
        let path = format!("{}/api/v1", url.path().trim_end_matches('/'));
        url.set_path(&path);
    }
    Ok(url.as_str().trim_end_matches('/').to_owned())
}

fn cloud_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(20))
        .user_agent(concat!("Line-AI/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| "Line AI Cloud ağ istemcisi başlatılamadı.".to_owned())
}

fn credential_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|_| "Windows Credential Manager açılamadı.".to_owned())
}

fn load_credentials_sync() -> Result<Option<CloudCredentials>, String> {
    let entry = credential_entry()?;
    match entry.get_password() {
        Ok(raw) => serde_json::from_str::<CloudCredentials>(&raw)
            .map(Some)
            .map_err(|_| "Windows Credential Manager içindeki Line AI Cloud kaydı bozuk.".to_owned()),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(_) => Err("Windows Credential Manager kaydı okunamadı.".to_owned()),
    }
}

fn save_credentials_sync(credentials: &CloudCredentials) -> Result<(), String> {
    let serialized = serde_json::to_string(credentials)
        .map_err(|_| "Line AI Cloud kimliği güvenli kayıt için hazırlanamadı.".to_owned())?;
    credential_entry()?
        .set_password(&serialized)
        .map_err(|_| "Line AI Cloud kimliği Windows Credential Manager'a kaydedilemedi.".to_owned())
}

fn delete_credentials_sync() -> Result<(), String> {
    match credential_entry()?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(_) => Err("Line AI Cloud kimliği Windows Credential Manager'dan silinemedi.".to_owned()),
    }
}

async fn load_credentials() -> Result<Option<CloudCredentials>, String> {
    tauri::async_runtime::spawn_blocking(load_credentials_sync)
        .await
        .map_err(|_| "Windows Credential Manager işlemi tamamlanamadı.".to_owned())?
}

async fn save_credentials(credentials: CloudCredentials) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || save_credentials_sync(&credentials))
        .await
        .map_err(|_| "Windows Credential Manager işlemi tamamlanamadı.".to_owned())?
}

async fn delete_credentials() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(delete_credentials_sync)
        .await
        .map_err(|_| "Windows Credential Manager işlemi tamamlanamadı.".to_owned())?
}

async fn register_installation(client: &Client, root: &str) -> Result<CloudCredentials, String> {
    let endpoint = format!("{root}/installations");
    let response = client
        .post(&endpoint)
        .send()
        .await
        .map_err(|_| "Line AI Cloud kurulum kaydı için bağlantı kurulamadı.".to_owned())?;
    if !response.status().is_success() {
        return Err(read_api_error(response, "Line AI Cloud kurulum kaydı").await);
    }
    let registration = response
        .json::<RegistrationResponse>()
        .await
        .map_err(|_| "Line AI Cloud geçersiz bir kurulum yanıtı döndürdü.".to_owned())?;
    let credentials = CloudCredentials {
        installation_id: registration.installation_id,
        secret: registration.secret,
    };
    if !valid_credentials(&credentials) {
        return Err("Line AI Cloud eksik bir kurulum kimliği döndürdü.".to_owned());
    }
    if let Err(error) = save_credentials(credentials.clone()).await {
        let _ = send_authenticated_once(
            client,
            root,
            Method::DELETE,
            "installations",
            None,
            &credentials,
        )
        .await;
        return Err(error);
    }
    Ok(credentials)
}

fn valid_credentials(credentials: &CloudCredentials) -> bool {
    !credentials.installation_id.trim().is_empty()
        && credentials.secret.starts_with("lai_live_")
        && credentials.secret.len() <= 256
}

async fn credentials_or_register(client: &Client, root: &str) -> Result<CloudCredentials, String> {
    match load_credentials().await? {
        Some(credentials) if valid_credentials(&credentials) => Ok(credentials),
        Some(_) => {
            delete_credentials().await?;
            register_installation(client, root).await
        }
        None => register_installation(client, root).await,
    }
}

async fn send_authenticated_once(
    client: &Client,
    root: &str,
    method: Method,
    path: &str,
    body: Option<&Value>,
    credentials: &CloudCredentials,
) -> Result<Response, String> {
    let mut request = client
        .request(method, format!("{root}/{path}"))
        .bearer_auth(&credentials.secret)
        .header("x-lineai-installation", &credentials.installation_id);
    if let Some(value) = body {
        request = request.json(value);
    }
    request
        .send()
        .await
        .map_err(|_| "Line AI Cloud ile güvenli bağlantı kurulamadı.".to_owned())
}

async fn send_authenticated(
    client: &Client,
    root: &str,
    method: Method,
    path: &str,
    body: Option<&Value>,
) -> Result<Response, String> {
    let mut credentials = credentials_or_register(client, root).await?;
    let mut response = send_authenticated_once(
        client,
        root,
        method.clone(),
        path,
        body,
        &credentials,
    )
    .await?;
    if response.status() == StatusCode::UNAUTHORIZED {
        delete_credentials().await?;
        credentials = register_installation(client, root).await?;
        response = send_authenticated_once(client, root, method, path, body, &credentials).await?;
    }
    Ok(response)
}

async fn read_api_error(response: Response, operation: &str) -> String {
    let status = response.status();
    let server_message = response
        .json::<ErrorEnvelope>()
        .await
        .ok()
        .and_then(|payload| payload.error)
        .and_then(|error| error.message)
        .filter(|message| !message.trim().is_empty())
        .unwrap_or_else(|| "İstek tamamlanamadı.".to_owned());
    format!("{operation}: {server_message} (HTTP {})", status.as_u16())
}

fn validate_conversation(conversation: &Value) -> Result<(), String> {
    let Some(object) = conversation.as_object() else {
        return Err("Buluta kaydedilecek sohbet geçersiz.".to_owned());
    };
    let id = object.get("id").and_then(Value::as_str).unwrap_or_default();
    let title = object
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let turns = object.get("turns").and_then(Value::as_array);
    let updated_at = object
        .get("updatedAt")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if id.is_empty()
        || id.len() > 128
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
        || title.trim().is_empty()
        || title.chars().count() > 80
        || turns.is_none_or(|items| items.len() > 500)
        || updated_at.is_empty()
    {
        return Err("Buluta kaydedilecek sohbet alanları doğrulanamadı.".to_owned());
    }
    let bytes = serde_json::to_vec(conversation)
        .map_err(|_| "Sohbet bulut aktarımı için hazırlanamadı.".to_owned())?;
    if bytes.len() > MAX_CONVERSATION_BYTES {
        return Err("Bir bulut sohbeti en fazla 512 KiB olabilir.".to_owned());
    }
    Ok(())
}

#[tauri::command]
pub async fn get_cloud_status() -> Result<CloudStatus, String> {
    let root = cloud_root()?;
    let client = cloud_client()?;
    let registered = load_credentials()
        .await?
        .is_some_and(|credentials| valid_credentials(&credentials));
    let response = client.get(format!("{root}/health")).send().await;
    let connected = response
        .as_ref()
        .is_ok_and(|value| value.status().is_success());
    Ok(CloudStatus {
        connected,
        endpoint: root,
        message: if connected {
            if registered {
                "Bulut bağlantısı ve güvenli kurulum kimliği hazır.".to_owned()
            } else {
                "Bulut bağlantısı hazır; ilk senkronizasyonda güvenli kurulum kimliği oluşturulacak."
                    .to_owned()
            }
        } else {
            "Line AI Cloud şu anda erişilemiyor; açık oturum bellekte çalışmaya devam eder."
                .to_owned()
        },
        registered,
    })
}

#[tauri::command]
pub async fn load_cloud_conversations() -> Result<CloudConversationList, String> {
    let root = cloud_root()?;
    let client = cloud_client()?;
    let response = send_authenticated(&client, &root, Method::GET, "conversations", None).await?;
    if !response.status().is_success() {
        return Err(read_api_error(response, "Bulut sohbetleri okunamadı").await);
    }
    let payload = response
        .json::<ConversationListResponse>()
        .await
        .map_err(|_| "Line AI Cloud geçersiz bir sohbet listesi döndürdü.".to_owned())?;
    Ok(CloudConversationList {
        conversations: payload.conversations,
        endpoint: root,
    })
}

#[tauri::command]
pub async fn upsert_cloud_conversation(conversation: Value) -> Result<(), String> {
    validate_conversation(&conversation)?;
    let root = cloud_root()?;
    let client = cloud_client()?;
    let body = json!({ "conversation": conversation });
    let response = send_authenticated(
        &client,
        &root,
        Method::PUT,
        "conversations",
        Some(&body),
    )
    .await?;
    if !response.status().is_success() {
        return Err(read_api_error(response, "Sohbet buluta kaydedilemedi").await);
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_cloud_conversation(id: String) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 128
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
    {
        return Err("Silinecek bulut sohbetinin kimliği geçersiz.".to_owned());
    }
    let root = cloud_root()?;
    let client = cloud_client()?;
    let path = format!("conversations?id={id}");
    let response = send_authenticated(
        &client,
        &root,
        Method::DELETE,
        &path,
        None,
    )
    .await?;
    if !response.status().is_success() {
        return Err(read_api_error(response, "Sohbet buluttan silinemedi").await);
    }
    Ok(())
}

#[tauri::command]
pub async fn clear_cloud_conversations() -> Result<(), String> {
    let root = cloud_root()?;
    let client = cloud_client()?;
    let response = send_authenticated(
        &client,
        &root,
        Method::DELETE,
        "conversations?all=true",
        None,
    )
    .await?;
    if !response.status().is_success() {
        return Err(read_api_error(response, "Bulut sohbet geçmişi temizlenemedi").await);
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_cloud_installation() -> Result<(), String> {
    let Some(credentials) = load_credentials().await? else {
        return Ok(());
    };
    let root = cloud_root()?;
    let client = cloud_client()?;
    let response = send_authenticated_once(
        &client,
        &root,
        Method::DELETE,
        "installations",
        None,
        &credentials,
    )
    .await?;
    if response.status().is_success() || response.status() == StatusCode::UNAUTHORIZED {
        delete_credentials().await?;
        return Ok(());
    }
    Err(read_api_error(response, "Bulut kurulum verileri silinemedi").await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_https_cloud_roots() {
        assert_eq!(
            normalize_cloud_root("https://lineai.example/").unwrap(),
            "https://lineai.example/api/v1"
        );
        assert_eq!(
            normalize_cloud_root("https://lineai.example/api/v1/").unwrap(),
            "https://lineai.example/api/v1"
        );
        assert!(normalize_cloud_root("http://lineai.example").is_err());
        assert!(normalize_cloud_root("http://127.0.0.1:3000").is_ok());
    }

    #[test]
    fn validates_bounded_conversation_payloads() {
        let valid = json!({
            "id": "conversation_1",
            "title": "Bulut testi",
            "turns": [],
            "updatedAt": "2026-08-30T00:00:00.000Z"
        });
        assert!(validate_conversation(&valid).is_ok());
        let invalid = json!({
            "id": "../outside",
            "title": "Geçersiz",
            "turns": [],
            "updatedAt": "2026-08-30T00:00:00.000Z"
        });
        assert!(validate_conversation(&invalid).is_err());
    }

    #[test]
    fn accepts_only_expected_credential_shapes() {
        assert!(valid_credentials(&CloudCredentials {
            installation_id: "9ad15c6d-e178-4d1f-a191-d0bc3c34c831".to_owned(),
            secret: "lai_live_example".to_owned(),
        }));
        assert!(!valid_credentials(&CloudCredentials {
            installation_id: String::new(),
            secret: "plain-text".to_owned(),
        }));
    }
}
