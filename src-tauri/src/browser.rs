use futures_util::{SinkExt, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    env, fs,
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::Duration,
};
use tauri::{AppHandle, Manager, State};
use tokio::time::{sleep, timeout};
use tokio_tungstenite::{connect_async, tungstenite::Message};

const MAX_PAGE_TEXT_CHARS: usize = 60_000;
const CDP_TIMEOUT: Duration = Duration::from_secs(12);

#[derive(Default)]
pub struct BrowserRuntime {
    inner: Mutex<BrowserRuntimeInner>,
}

#[derive(Default)]
struct BrowserRuntimeInner {
    child: Option<Child>,
    port: Option<u16>,
}

impl Drop for BrowserRuntime {
    fn drop(&mut self) {
        if let Ok(inner) = self.inner.get_mut() {
            if let Some(child) = inner.child.as_mut() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserToolRequest {
    pub action: String,
    pub selector: Option<String>,
    pub text: Option<String>,
    pub url: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserStatus {
    pub connected: bool,
    pub isolated_profile: bool,
    pub port: Option<u16>,
    pub tab_count: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserTab {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub target_type: String,
    pub url: String,
    #[serde(default)]
    pub web_socket_debugger_url: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserToolResult {
    pub action: String,
    pub message: String,
    pub page_text: Option<String>,
    pub title: Option<String>,
    pub url: Option<String>,
}

#[tauri::command]
pub async fn get_browser_status(state: State<'_, BrowserRuntime>) -> Result<BrowserStatus, String> {
    state.status().await
}

#[tauri::command]
pub async fn start_browser_session(
    app: AppHandle,
    state: State<'_, BrowserRuntime>,
) -> Result<BrowserStatus, String> {
    state.start(&app).await
}

#[tauri::command]
pub async fn stop_browser_session(
    state: State<'_, BrowserRuntime>,
) -> Result<BrowserStatus, String> {
    state.stop();
    Ok(BrowserStatus {
        connected: false,
        isolated_profile: true,
        port: None,
        tab_count: 0,
    })
}

#[tauri::command]
pub async fn execute_browser_tool(
    request: BrowserToolRequest,
    state: State<'_, BrowserRuntime>,
) -> Result<BrowserToolResult, String> {
    state.execute(&request).await
}

impl BrowserRuntime {
    pub async fn status(&self) -> Result<BrowserStatus, String> {
        let port = self.port();
        let Some(port) = port else {
            return Ok(BrowserStatus {
                connected: false,
                isolated_profile: true,
                port: None,
                tab_count: 0,
            });
        };
        match list_tabs(port).await {
            Ok(tabs) => Ok(BrowserStatus {
                connected: true,
                isolated_profile: true,
                port: Some(port),
                tab_count: tabs.len(),
            }),
            Err(_) => Ok(BrowserStatus {
                connected: false,
                isolated_profile: true,
                port: Some(port),
                tab_count: 0,
            }),
        }
    }

    async fn start(&self, app: &AppHandle) -> Result<BrowserStatus, String> {
        if let Ok(status) = self.status().await {
            if status.connected {
                return Ok(status);
            }
        }

        self.stop();
        let profile = app
            .path()
            .app_local_data_dir()
            .map_err(|_| "Line AI tarayıcı profili konumu oluşturulamadı.".to_owned())?
            .join("chrome-profile");
        self.start_with_profile(&profile).await
    }

    async fn start_with_profile(&self, profile: &Path) -> Result<BrowserStatus, String> {
        let chrome = find_chrome_executable()
            .ok_or_else(|| "Google Chrome bu bilgisayarda bulunamadı.".to_owned())?;
        fs::create_dir_all(profile)
            .map_err(|_| "İzole Chrome profili oluşturulamadı.".to_owned())?;
        let port = reserve_loopback_port()?;

        let mut command = Command::new(chrome);
        command
            .arg(format!("--remote-debugging-port={port}"))
            .arg("--remote-debugging-address=127.0.0.1")
            .arg(format!("--user-data-dir={}", profile.display()))
            .arg("--no-first-run")
            .arg("--no-default-browser-check")
            .arg("--disable-background-networking")
            .arg("about:blank")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }
        let child = command
            .spawn()
            .map_err(|_| "İzole Chrome oturumu başlatılamadı.".to_owned())?;
        {
            let mut inner = self
                .inner
                .lock()
                .map_err(|_| "Tarayıcı oturumu kilitlenemedi.".to_owned())?;
            inner.port = Some(port);
            inner.child = Some(child);
        }

        for _ in 0..40 {
            if let Ok(tabs) = list_tabs(port).await {
                return Ok(BrowserStatus {
                    connected: true,
                    isolated_profile: true,
                    port: Some(port),
                    tab_count: tabs.len(),
                });
            }
            sleep(Duration::from_millis(150)).await;
        }
        self.stop();
        Err("Chrome açıldı ancak güvenli yerel bağlantı doğrulanamadı.".to_owned())
    }

    pub fn stop(&self) {
        if let Ok(mut inner) = self.inner.lock() {
            if let Some(mut child) = inner.child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
            inner.port = None;
        }
    }

    pub async fn execute(&self, request: &BrowserToolRequest) -> Result<BrowserToolResult, String> {
        let port = self
            .port()
            .ok_or_else(|| "Chrome entegrasyonu bağlı değil.".to_owned())?;
        let tab = active_page(port).await?;
        match request.action.as_str() {
            "read_page" => read_page(&tab).await,
            "open_url" => {
                let url = validate_web_url(request.url.as_deref())?;
                cdp_command(&tab, "Page.navigate", json!({ "url": url })).await?;
                Ok(BrowserToolResult {
                    action: request.action.clone(),
                    message: "Chrome sekmesi belirtilen adrese gitti.".to_owned(),
                    page_text: None,
                    title: Some(tab.title),
                    url: Some(url.to_owned()),
                })
            }
            "reload" => {
                cdp_command(&tab, "Page.reload", json!({ "ignoreCache": false })).await?;
                simple_result(request, &tab, "Chrome sekmesi yenilendi.")
            }
            "back" => {
                evaluate(&tab, "history.back(); 'ok'").await?;
                simple_result(request, &tab, "Chrome sekmesi önceki sayfaya döndü.")
            }
            "click" => {
                let selector = required_bounded(request.selector.as_deref(), "CSS seçici", 500)?;
                let encoded = serde_json::to_string(selector)
                    .map_err(|_| "CSS seçici güvenli biçimde kodlanamadı.".to_owned())?;
                let expression = format!(
                    "(() => {{ const el = document.querySelector({encoded}); if (!el) return {{ok:false,error:'Öğe bulunamadı'}}; el.scrollIntoView({{block:'center'}}); el.click(); return {{ok:true}}; }})()"
                );
                ensure_action_ok(evaluate(&tab, &expression).await?)?;
                simple_result(request, &tab, "Chrome sayfasındaki öğe tıklandı.")
            }
            "type" => {
                let selector = required_bounded(request.selector.as_deref(), "CSS seçici", 500)?;
                let text = required_bounded(request.text.as_deref(), "Yazılacak metin", 20_000)?;
                let selector_json = serde_json::to_string(selector)
                    .map_err(|_| "CSS seçici güvenli biçimde kodlanamadı.".to_owned())?;
                let text_json = serde_json::to_string(text)
                    .map_err(|_| "Metin güvenli biçimde kodlanamadı.".to_owned())?;
                let expression = format!(
                    "(() => {{ const el = document.querySelector({selector_json}); if (!el) return {{ok:false,error:'Alan bulunamadı'}}; el.focus(); if (el.isContentEditable) el.textContent={text_json}; else if ('value' in el) el.value={text_json}; else return {{ok:false,error:'Öğe yazılabilir değil'}}; el.dispatchEvent(new InputEvent('input', {{bubbles:true,inputType:'insertText',data:{text_json}}})); el.dispatchEvent(new Event('change', {{bubbles:true}})); return {{ok:true}}; }})()"
                );
                ensure_action_ok(evaluate(&tab, &expression).await?)?;
                simple_result(request, &tab, "Metin Chrome sayfasındaki alana yazıldı.")
            }
            _ => Err("Desteklenmeyen Chrome komutu.".to_owned()),
        }
    }

    fn port(&self) -> Option<u16> {
        self.inner.lock().ok().and_then(|inner| inner.port)
    }
}

fn simple_result(
    request: &BrowserToolRequest,
    tab: &BrowserTab,
    message: &str,
) -> Result<BrowserToolResult, String> {
    Ok(BrowserToolResult {
        action: request.action.clone(),
        message: message.to_owned(),
        page_text: None,
        title: Some(tab.title.clone()),
        url: Some(tab.url.clone()),
    })
}

async fn read_page(tab: &BrowserTab) -> Result<BrowserToolResult, String> {
    let expression = format!(
        "(() => ({{title:document.title,url:location.href,text:(document.body?.innerText||'').slice(0,{MAX_PAGE_TEXT_CHARS})}}))()"
    );
    let value = evaluate(tab, &expression).await?;
    let title = value
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or(&tab.title)
        .to_owned();
    let url = value
        .get("url")
        .and_then(Value::as_str)
        .unwrap_or(&tab.url)
        .to_owned();
    let page_text = value
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    Ok(BrowserToolResult {
        action: "read_page".to_owned(),
        message: "Chrome sayfasının görünür metni okundu.".to_owned(),
        page_text: Some(page_text),
        title: Some(title),
        url: Some(url),
    })
}

async fn evaluate(tab: &BrowserTab, expression: &str) -> Result<Value, String> {
    let response = cdp_command(
        tab,
        "Runtime.evaluate",
        json!({
            "awaitPromise": true,
            "expression": expression,
            "returnByValue": true,
            "userGesture": true
        }),
    )
    .await?;
    if response.get("exceptionDetails").is_some() {
        return Err("Chrome komutu sayfada güvenli biçimde çalıştırılamadı.".to_owned());
    }
    Ok(response
        .pointer("/result/value")
        .cloned()
        .unwrap_or(Value::Null))
}

fn ensure_action_ok(value: Value) -> Result<(), String> {
    if value.get("ok").and_then(Value::as_bool) == Some(true) {
        return Ok(());
    }
    Err(value
        .get("error")
        .and_then(Value::as_str)
        .unwrap_or("Chrome sayfasındaki işlem tamamlanamadı.")
        .to_owned())
}

async fn cdp_command(tab: &BrowserTab, method: &str, params: Value) -> Result<Value, String> {
    if !tab.web_socket_debugger_url.starts_with("ws://127.0.0.1:")
        && !tab.web_socket_debugger_url.starts_with("ws://localhost:")
    {
        return Err("Güvenli olmayan Chrome bağlantısı reddedildi.".to_owned());
    }
    let websocket_url = tab.web_socket_debugger_url.clone();
    let method = method.to_owned();
    timeout(CDP_TIMEOUT, async move {
        let (mut socket, _) = connect_async(&websocket_url)
            .await
            .map_err(|_| "Chrome komut kanalına bağlanılamadı.".to_owned())?;
        socket
            .send(Message::Text(
                json!({ "id": 1, "method": method, "params": params })
                    .to_string()
                    .into(),
            ))
            .await
            .map_err(|_| "Chrome komutu gönderilemedi.".to_owned())?;
        while let Some(message) = socket.next().await {
            let message = message.map_err(|_| "Chrome komut yanıtı okunamadı.".to_owned())?;
            let Message::Text(text) = message else {
                continue;
            };
            let payload: Value = serde_json::from_str(&text)
                .map_err(|_| "Chrome geçersiz komut yanıtı döndürdü.".to_owned())?;
            if payload.get("id").and_then(Value::as_u64) != Some(1) {
                continue;
            }
            if let Some(error) = payload.get("error") {
                let message = error
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("Chrome komutu reddetti.");
                return Err(format!("Chrome komutu başarısız: {message}"));
            }
            return Ok(payload.get("result").cloned().unwrap_or(Value::Null));
        }
        Err("Chrome komut kanalını yanıt vermeden kapattı.".to_owned())
    })
    .await
    .map_err(|_| "Chrome komutu zaman aşımına uğradı.".to_owned())?
}

async fn active_page(port: u16) -> Result<BrowserTab, String> {
    list_tabs(port)
        .await?
        .into_iter()
        .find(|tab| tab.target_type == "page" && !tab.web_socket_debugger_url.is_empty())
        .ok_or_else(|| "Kontrol edilebilir Chrome sekmesi bulunamadı.".to_owned())
}

async fn list_tabs(port: u16) -> Result<Vec<BrowserTab>, String> {
    let endpoint = format!("http://127.0.0.1:{port}/json/list");
    let response = Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|_| "Chrome durum istemcisi oluşturulamadı.".to_owned())?
        .get(endpoint)
        .send()
        .await
        .map_err(|_| "Chrome yerel bağlantısı hazır değil.".to_owned())?;
    if !response.status().is_success() {
        return Err("Chrome yerel bağlantısı yanıt vermedi.".to_owned());
    }
    response
        .json::<Vec<BrowserTab>>()
        .await
        .map_err(|_| "Chrome sekme listesi doğrulanamadı.".to_owned())
}

fn reserve_loopback_port() -> Result<u16, String> {
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|listener| listener.local_addr())
        .map(|address| address.port())
        .map_err(|_| "Chrome için güvenli yerel bağlantı noktası ayrılamadı.".to_owned())
}

fn find_chrome_executable() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    for variable in ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"] {
        if let Ok(root) = env::var(variable) {
            candidates.push(Path::new(&root).join("Google/Chrome/Application/chrome.exe"));
        }
    }
    candidates.into_iter().find(|path| path.is_file())
}

fn validate_web_url(url: Option<&str>) -> Result<&str, String> {
    let url = required_bounded(url, "Web adresi", 4_096)?;
    let lower = url.trim().to_ascii_lowercase();
    if !lower.starts_with("https://") && !lower.starts_with("http://") {
        return Err("Yalnız http veya https adresleri açılabilir.".to_owned());
    }
    Ok(url.trim())
}

fn required_bounded<'a>(
    value: Option<&'a str>,
    label: &str,
    max_chars: usize,
) -> Result<&'a str, String> {
    let value = value.map(str::trim).filter(|value| !value.is_empty());
    let Some(value) = value else {
        return Err(format!("{label} gerekli."));
    };
    if value.chars().count() > max_chars {
        return Err(format!("{label} izin verilen uzunluğu aşıyor."));
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::{required_bounded, validate_web_url, BrowserRuntime, BrowserToolRequest};
    use std::{
        fs,
        io::{Read, Write},
        net::TcpListener,
        thread,
        time::{Duration, SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn accepts_only_http_and_https_navigation() {
        assert_eq!(
            validate_web_url(Some("https://example.com/path")).unwrap(),
            "https://example.com/path"
        );
        assert!(validate_web_url(Some("file:///C:/secret.txt")).is_err());
        assert!(validate_web_url(Some("javascript:alert(1)")).is_err());
    }

    #[test]
    fn rejects_empty_and_oversized_tool_arguments() {
        assert!(required_bounded(Some("  "), "Değer", 10).is_err());
        assert!(required_bounded(Some("12345678901"), "Değer", 10).is_err());
    }

    #[test]
    #[ignore = "kurulu gerçek Chrome süreci gerektirir"]
    fn real_chrome_cdp_bridge_opens_and_reads_a_page() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 1024];
            let _ = stream.read(&mut request);
            let body = "<!doctype html><title>Line AI CDP testi</title><main>Gerçek Chrome köprüsü çalışıyor.</main>";
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            stream.write_all(response.as_bytes()).unwrap();
        });
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let profile = std::env::temp_dir().join(format!("line-ai-chrome-test-{nonce}"));
        let runtime = BrowserRuntime::default();

        tauri::async_runtime::block_on(async {
            let status = runtime.start_with_profile(&profile).await.unwrap();
            assert!(status.connected);
            assert!(status.isolated_profile);
            runtime
                .execute(&BrowserToolRequest {
                    action: "open_url".to_owned(),
                    selector: None,
                    text: None,
                    url: Some(format!("http://127.0.0.1:{port}/")),
                })
                .await
                .unwrap();

            let mut page_text = String::new();
            for _ in 0..30 {
                if let Ok(result) = runtime
                    .execute(&BrowserToolRequest {
                        action: "read_page".to_owned(),
                        selector: None,
                        text: None,
                        url: None,
                    })
                    .await
                {
                    page_text = result.page_text.unwrap_or_default();
                    if page_text.contains("Gerçek Chrome köprüsü çalışıyor") {
                        break;
                    }
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
            assert!(page_text.contains("Gerçek Chrome köprüsü çalışıyor"));
        });

        runtime.stop();
        server.join().unwrap();
        let _ = fs::remove_dir_all(profile);
    }
}
