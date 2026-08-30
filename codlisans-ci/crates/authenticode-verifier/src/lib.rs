#![forbid(unsafe_code)]

use std::{ffi::OsString, path::Path, time::Duration};
use evidence_model::{EvidenceEnvelope, EvidenceType, NormalizedResult, TrustStatus};
use hash_engine::{HashEvidence, hash_file};
use process_runner::{CommandSpec, run};
use sha2::{Digest, Sha256};
use thiserror::Error;
use windows_sdk_discovery::discover_signtool;

#[derive(Debug)]
pub struct AuthenticodeResult { pub status: TrustStatus, pub hash_evidence: EvidenceEnvelope, pub evidence: EvidenceEnvelope }

#[derive(Debug, Error)]
pub enum AuthenticodeError {
    #[error(transparent)] Hash(#[from] hash_engine::HashError),
    #[error(transparent)] Discovery(#[from] windows_sdk_discovery::DiscoveryError),
    #[error(transparent)] Process(#[from] process_runner::ProcessError),
    #[error(transparent)] Evidence(#[from] evidence_model::EvidenceError),
}

/// Verifies a physical artifact with the installed Windows SDK SignTool.
///
/// # Errors
/// Returns a typed hashing, discovery, process, or evidence error.
pub fn verify_authenticode(path: &Path) -> Result<AuthenticodeResult, AuthenticodeError> {
    let HashEvidence { digest_hex, evidence: hash_evidence, .. } = hash_file(path)?;
    let tool = discover_signtool()?;
    let args = vec![OsString::from("verify"), OsString::from("/pa"), OsString::from("/all"), OsString::from("/v"), path.as_os_str().to_owned()];
    let process = run(&CommandSpec { program: tool.path, args, timeout: Duration::from_secs(60) })?;
    let verified = process.exit_code == Some(0);
    let status = if verified { TrustStatus::Verified } else { TrustStatus::Unverified };
    let normalized = if verified { NormalizedResult::Success } else { NormalizedResult::Failure };
    let mut raw = Vec::with_capacity(process.stdout.len() + process.stderr.len());
    raw.extend_from_slice(&process.stdout);
    raw.extend_from_slice(&process.stderr);
    let mut evidence = EvidenceEnvelope::new(status, EvidenceType::AuthenticodeVerification, "authenticode-verifier", env!("CARGO_PKG_VERSION"), Some(digest_hex), normalized)?;
    evidence.exit_code = process.exit_code;
    evidence.raw_output_digest = Some(hex::encode(Sha256::digest(&raw)));
    evidence.parent_evidence_ids.push(hash_evidence.id);
    Ok(AuthenticodeResult { status, hash_evidence, evidence })
}
