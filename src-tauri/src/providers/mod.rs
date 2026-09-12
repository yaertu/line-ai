#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProviderKind {
    Auto,
    OpenAi,
    Gemini,
    LineAi,
}

impl ProviderKind {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "auto" => Ok(Self::Auto),
            "openai" => Ok(Self::OpenAi),
            "gemini" => Ok(Self::Gemini),
            "lineai" => Ok(Self::LineAi),
            _ => Err("Desteklenmeyen sağlayıcı seçimi.".to_owned()),
        }
    }

    pub fn allows_automatic_cloud_fallback(self) -> bool {
        matches!(self, Self::Auto)
    }
}

#[cfg(test)]
mod tests {
    use super::ProviderKind;

    #[test]
    fn accepts_only_hosted_provider_choices() {
        assert_eq!(ProviderKind::parse("lineai").unwrap(), ProviderKind::LineAi);
        assert_eq!(ProviderKind::parse("auto").unwrap(), ProviderKind::Auto);
        assert!(ProviderKind::parse("local").is_err());
    }
}
