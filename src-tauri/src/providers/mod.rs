pub mod compatible;

use reqwest::Url;
use std::net::IpAddr;

const MAX_LOCAL_ENDPOINT_BYTES: usize = 512;
const MAX_LOCAL_MODEL_CHARS: usize = 200;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProviderKind {
    Auto,
    OpenAi,
    Gemini,
    Local,
}

impl ProviderKind {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "auto" => Ok(Self::Auto),
            "openai" => Ok(Self::OpenAi),
            "gemini" => Ok(Self::Gemini),
            "local" => Ok(Self::Local),
            _ => Err("Desteklenmeyen sağlayıcı seçimi.".to_owned()),
        }
    }

    pub fn allows_automatic_cloud_fallback(self) -> bool {
        matches!(self, Self::Auto)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LocalModelEngine {
    Ollama,
    LmStudio,
    OpenAiCompatible,
}

impl LocalModelEngine {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "ollama" => Ok(Self::Ollama),
            "lm-studio" => Ok(Self::LmStudio),
            "openai-compatible" => Ok(Self::OpenAiCompatible),
            _ => Err("Yerel model motoru desteklenmiyor.".to_owned()),
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Ollama => "Ollama",
            Self::LmStudio => "LM Studio",
            Self::OpenAiCompatible => "OpenAI uyumlu yerel model",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalProviderConfig {
    pub endpoint: Url,
    pub engine: LocalModelEngine,
    pub model: String,
}

impl LocalProviderConfig {
    pub fn parse(
        endpoint: Option<&str>,
        model: Option<&str>,
        engine: Option<&str>,
    ) -> Result<Self, String> {
        let endpoint = validate_loopback_http_endpoint(
            endpoint.ok_or_else(|| "Yerel model uç noktası ayarlanmadı.".to_owned())?,
        )?;
        let engine = LocalModelEngine::parse(
            engine.ok_or_else(|| "Yerel model motoru ayarlanmadı.".to_owned())?,
        )?;
        let model = model
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "Yerel model adı ayarlanmadı.".to_owned())?;
        if model.chars().count() > MAX_LOCAL_MODEL_CHARS || model.chars().any(char::is_control) {
            return Err("Yerel model adı geçersiz.".to_owned());
        }

        Ok(Self {
            endpoint,
            engine,
            model: model.to_owned(),
        })
    }

    pub fn chat_completions_url(&self) -> Url {
        let mut endpoint = self.endpoint.clone();
        let path = endpoint.path().trim_end_matches('/');
        let path = if path.is_empty() { "/v1" } else { path };
        endpoint.set_path(&format!("{path}/chat/completions"));
        endpoint
    }
}

fn validate_loopback_http_endpoint(value: &str) -> Result<Url, String> {
    let value = value.trim();
    if value.is_empty() || value.len() > MAX_LOCAL_ENDPOINT_BYTES {
        return Err("Yerel model uç noktası geçersiz.".to_owned());
    }
    let mut endpoint = Url::parse(value)
        .map_err(|_| "Yerel model uç noktası geçerli bir URL değil.".to_owned())?;
    if endpoint.scheme() != "http" {
        return Err("Yerel model yalnız HTTP loopback uç noktası kullanabilir.".to_owned());
    }
    if !has_explicit_port(value)
        || endpoint
            .port_or_known_default()
            .is_none_or(|port| port == 0)
    {
        return Err("Yerel model uç noktasında geçerli bir bağlantı noktası gerekli.".to_owned());
    }
    if !endpoint.username().is_empty()
        || endpoint.password().is_some()
        || endpoint.query().is_some()
        || endpoint.fragment().is_some()
    {
        return Err("Yerel model uç noktası kimlik bilgisi, sorgu veya parça içeremez.".to_owned());
    }
    let host = endpoint
        .host_str()
        .ok_or_else(|| "Yerel model uç noktası bir ana makine içermeli.".to_owned())?;
    let loopback_ip = host
        .trim_matches(['[', ']'])
        .parse::<IpAddr>()
        .is_ok_and(|address| address.is_loopback());
    if !host.eq_ignore_ascii_case("localhost") && !loopback_ip {
        return Err(
            "Yerel model uç noktası yalnız bu bilgisayardaki loopback adresini kullanabilir."
                .to_owned(),
        );
    }

    if endpoint.path().is_empty() || endpoint.path() == "/" {
        endpoint.set_path("/v1");
    }
    endpoint.set_query(None);
    endpoint.set_fragment(None);
    Ok(endpoint)
}

fn has_explicit_port(value: &str) -> bool {
    let Some((_, remainder)) = value.split_once("://") else {
        return false;
    };
    let authority = remainder.split(['/', '?', '#']).next().unwrap_or_default();
    if authority.starts_with('[') {
        authority
            .find(']')
            .is_some_and(|index| authority[index + 1..].starts_with(':'))
    } else {
        authority.rsplit_once(':').is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::{LocalModelEngine, LocalProviderConfig, ProviderKind};

    #[test]
    fn parses_local_provider_and_never_marks_it_as_a_cloud_fallback() {
        assert_eq!(ProviderKind::parse("local").unwrap(), ProviderKind::Local);
        assert!(!ProviderKind::Local.allows_automatic_cloud_fallback());
        assert!(ProviderKind::Auto.allows_automatic_cloud_fallback());
    }

    #[test]
    fn accepts_only_loopback_http_endpoints_with_an_explicit_port() {
        let config = LocalProviderConfig::parse(
            Some("http://127.0.0.1:11434/v1"),
            Some("llama3.2:latest"),
            Some("ollama"),
        )
        .unwrap();
        assert_eq!(config.engine, LocalModelEngine::Ollama);
        assert_eq!(
            config.chat_completions_url().as_str(),
            "http://127.0.0.1:11434/v1/chat/completions"
        );

        for endpoint in [
            "https://127.0.0.1:11434/v1",
            "http://example.com:11434/v1",
            "http://127.0.0.1/v1",
            "http://127.0.0.1:0/v1",
            "http://127.0.0.1:11434/v1?relay=https://example.com",
            "http://user:pass@127.0.0.1:11434/v1",
        ] {
            assert!(
                LocalProviderConfig::parse(Some(endpoint), Some("model"), Some("ollama")).is_err(),
                "endpoint should be rejected: {endpoint}"
            );
        }
    }

    #[test]
    fn rejects_missing_or_blank_local_configuration() {
        assert!(LocalProviderConfig::parse(None, Some("model"), Some("ollama")).is_err());
        assert!(LocalProviderConfig::parse(
            Some("http://127.0.0.1:11434/v1"),
            Some("   "),
            Some("ollama"),
        )
        .is_err());
        assert!(LocalProviderConfig::parse(
            Some("http://127.0.0.1:11434/v1"),
            Some("model"),
            Some("unknown"),
        )
        .is_err());
    }
}
