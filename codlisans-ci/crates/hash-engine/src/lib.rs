#![forbid(unsafe_code)]

use evidence_model::{EvidenceEnvelope, EvidenceType, NormalizedResult, TrustStatus};
use sha2::{Digest, Sha256};
use std::{fs::File, io::Read, path::Path};
use thiserror::Error;

#[derive(Debug)]
pub struct HashEvidence {
    pub digest_hex: String,
    pub bytes: u64,
    pub evidence: EvidenceEnvelope,
}

#[derive(Debug, Error)]
pub enum HashError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("evidence error: {0}")]
    Evidence(#[from] evidence_model::EvidenceError),
}

/// Hashes a physical artifact using streaming SHA-256.
///
/// # Errors
/// Returns a typed I/O or evidence-construction error.
pub fn hash_file(path: &Path) -> Result<HashEvidence, HashError> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 64 * 1024];
    let mut bytes = 0_u64;
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        bytes += u64::try_from(read).expect("read length fits u64");
    }
    let digest_hex = hex::encode(hasher.finalize());
    let evidence = EvidenceEnvelope::new(
        TrustStatus::Verified,
        EvidenceType::ArtifactHash,
        "hash-engine",
        env!("CARGO_PKG_VERSION"),
        Some(digest_hex.clone()),
        NormalizedResult::Success,
    )?;
    Ok(HashEvidence {
        digest_hex,
        bytes,
        evidence,
    })
}
