#![forbid(unsafe_code)]

use std::path::PathBuf;
use thiserror::Error;

#[derive(Debug, Clone)]
pub struct SignToolDiscovery {
    pub path: PathBuf,
    pub sdk_version: String,
}
#[derive(Debug, Error)]
pub enum DiscoveryError {
    #[error("SignTool discovery is supported only on Windows")]
    UnsupportedPlatform,
    #[error("Windows SDK SignTool was not found")]
    ToolNotFound,
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}

/// Discovers the newest physical x64 `SignTool` from installed Windows SDK locations.
///
/// # Errors
/// Returns [`DiscoveryError::UnsupportedPlatform`] outside Windows.
#[cfg(not(windows))]
pub fn discover_signtool() -> Result<SignToolDiscovery, DiscoveryError> {
    Err(DiscoveryError::UnsupportedPlatform)
}

/// Discovers the newest physical x64 `SignTool` from installed Windows SDK locations.
///
/// # Errors
/// Returns [`DiscoveryError::ToolNotFound`] when no suitable SDK `SignTool` exists, or
/// [`DiscoveryError::Io`] when SDK directory enumeration fails.
#[cfg(windows)]
pub fn discover_signtool() -> Result<SignToolDiscovery, DiscoveryError> {
    let mut roots = Vec::new();
    if let Some(pf86) = std::env::var_os("ProgramFiles(x86)") {
        roots.push(PathBuf::from(pf86));
    }
    if let Some(pf) = std::env::var_os("ProgramFiles") {
        roots.push(PathBuf::from(pf));
    }
    let mut candidates = Vec::new();
    for root in roots {
        let bin = root.join("Windows Kits").join("10").join("bin");
        if !bin.is_dir() {
            continue;
        }
        for entry in std::fs::read_dir(bin)? {
            let entry = entry?;
            if !entry.file_type()?.is_dir() {
                continue;
            }
            let version = entry.file_name().to_string_lossy().into_owned();
            let path = entry.path().join("x64").join("signtool.exe");
            if path.is_file() {
                candidates.push((parse_version(&version), version, path));
            }
        }
    }
    candidates.sort_by(|a, b| b.0.cmp(&a.0));
    candidates
        .into_iter()
        .next()
        .map(|(_, sdk_version, path)| SignToolDiscovery { path, sdk_version })
        .ok_or(DiscoveryError::ToolNotFound)
}

#[cfg(windows)]
fn parse_version(value: &str) -> Vec<u32> {
    value
        .split('.')
        .map(|part| part.parse::<u32>().unwrap_or(0))
        .collect()
}
