#![forbid(unsafe_code)]

use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrustStatus {
    Verified,
    Trusted,
    Signed,
    NotConfigured,
    Unverified,
    Untrusted,
    Blocked,
    Failed,
    Unknown,
}
impl TrustStatus {
    #[must_use]
    pub const fn is_positive(self) -> bool {
        matches!(self, Self::Verified | Self::Trusted | Self::Signed)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EvidenceType {
    ArtifactHash,
    ToolDiscovery,
    AuthenticodeVerification,
    CertificateChain,
    TimestampVerification,
    ReleaseGate,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NormalizedResult {
    Success,
    Failure,
    NotRun,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EvidenceEnvelope {
    pub id: Uuid,
    pub status: TrustStatus,
    pub evidence_type: EvidenceType,
    pub producer: String,
    pub producer_version: String,
    pub artifact_digest: Option<String>,
    pub result: NormalizedResult,
    pub raw_output_digest: Option<String>,
    pub exit_code: Option<i32>,
    pub parent_evidence_ids: Vec<Uuid>,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum EvidenceError {
    #[error("positive evidence requires an artifact digest")]
    MissingArtifactDigest,
}

impl EvidenceEnvelope {
    /// Creates a typed evidence record.
    ///
    /// # Errors
    /// Returns [`EvidenceError::MissingArtifactDigest`] when a positive status has no digest.
    pub fn new(
        status: TrustStatus,
        evidence_type: EvidenceType,
        producer: &str,
        producer_version: &str,
        artifact_digest: Option<String>,
        result: NormalizedResult,
    ) -> Result<Self, EvidenceError> {
        if status.is_positive() && artifact_digest.is_none() {
            return Err(EvidenceError::MissingArtifactDigest);
        }
        Ok(Self {
            id: Uuid::new_v4(),
            status,
            evidence_type,
            producer: producer.to_owned(),
            producer_version: producer_version.to_owned(),
            artifact_digest,
            result,
            raw_output_digest: None,
            exit_code: None,
            parent_evidence_ids: Vec::new(),
        })
    }
}
