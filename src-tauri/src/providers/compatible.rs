#[cfg(test)]
mod tests {
    use super::{error_message, text_delta};
    use serde_json::json;

    #[test]
    fn maps_openai_compatible_stream_deltas_without_losing_whitespace() {
        let payload = json!({
            "choices": [{ "delta": { "content": " merhaba" } }]
        });
        assert_eq!(text_delta(&payload), Some(" merhaba".to_owned()));
        assert_eq!(
            text_delta(&json!({ "choices": [{ "delta": { "role": "assistant" } }] })),
            None
        );
    }

    #[test]
    fn maps_openai_compatible_error_shapes_to_safe_messages() {
        assert_eq!(
            error_message(&json!({ "error": { "message": "model bulunamadı" } })),
            Some("model bulunamadı".to_owned())
        );
        assert_eq!(
            error_message(&json!({ "error": "bağlantı reddedildi" })),
            Some("bağlantı reddedildi".to_owned())
        );
    }
}
use serde_json::Value;

pub fn text_delta(payload: &Value) -> Option<String> {
    payload
        .pointer("/choices/0/delta/content")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

pub fn completed_text(payload: &Value) -> Option<String> {
    payload
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_owned)
}

pub fn error_message(payload: &Value) -> Option<String> {
    let error = payload.get("error")?;
    match error {
        Value::String(message) => (!message.trim().is_empty()).then(|| message.to_owned()),
        Value::Object(_) => error
            .get("message")
            .or_else(|| error.get("detail"))
            .and_then(Value::as_str)
            .filter(|message| !message.trim().is_empty())
            .map(str::to_owned),
        _ => None,
    }
}
