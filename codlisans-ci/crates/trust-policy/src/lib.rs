#![forbid(unsafe_code)]

use std::{fmt::Write as _, path::Path, time::Duration};

use evidence_model::{EvidenceEnvelope, EvidenceError, EvidenceType, NormalizedResult, TrustStatus};
use sha2::{Digest, Sha256};
use thiserror::Error;
use wintrust_native::{CertificateRecord, NativeTrustError, TimestampRecord, TrustSnapshot, inspect_authenticode};

const PRODUCER: &str = "trust-policy";
const PRODUCER_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReleasePolicy {
    pub require_timestamp: bool,
    pub expected_publisher_subject: Option<String>,
}

impl Default for ReleasePolicy {
    fn default() -> Self {
        Self { require_timestamp: true, expected_publisher_subject: None }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReleaseRule {
    ArtifactHash,
    Authenticode,
    CertificateChain,
    Timestamp,
    PublisherIdentity,
    EvidenceLineage,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuleStatus { Passed, Failed, NotRequired }

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GateFailure {
    WrongEvidenceType,
    UnexpectedProducer,
    EvidenceNotPositive,
    NormalizedResultNotSuccess,
    ArtifactDigestMissing,
    ArtifactDigestMismatch,
    ParentEvidenceMissing,
    NativePolicyUntrusted,
    ProviderError,
    CertificateChainEmpty,
    TrustedRootMissing,
    TestCertificatePresent,
    TimestampMissing,
    TimestampProviderError,
    TimestampOutsideCertificateValidity,
    PublisherIdentityMismatch,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuleEvaluation {
    pub rule: ReleaseRule,
    pub status: RuleStatus,
    pub failure: Option<GateFailure>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReleaseGateDecision {
    pub status: TrustStatus,
    pub decision_digest: String,
    pub rules: Vec<RuleEvaluation>,
    pub evidence: EvidenceEnvelope,
}

#[derive(Debug, Error)]
pub enum TrustPolicyError {
    #[error(transparent)]
    Native(#[from] NativeTrustError),
    #[error(transparent)]
    Evidence(#[from] EvidenceError),
    #[error("authenticode evidence has no artifact digest")]
    MissingAuthenticodeDigest,
}

/// Re-inspects the physical artifact with WinTrust and evaluates a fail-closed release policy.
///
/// # Errors
/// Returns a typed native or evidence error when physical inspection/evidence construction fails.
pub fn verify_windows_release(
    artifact: &Path,
    hash_evidence: &EvidenceEnvelope,
    authenticode_evidence: &EvidenceEnvelope,
    policy: &ReleasePolicy,
    timeout_budget: Duration,
) -> Result<ReleaseGateDecision, TrustPolicyError> {
    let artifact_digest = authenticode_evidence
        .artifact_digest
        .as_deref()
        .ok_or(TrustPolicyError::MissingAuthenticodeDigest)?;

    let snapshot = inspect_authenticode(artifact, timeout_budget)?;
    evaluate_release_gate(artifact_digest, hash_evidence, authenticode_evidence, &snapshot, policy)
}

fn evaluate_release_gate(
    artifact_digest: &str,
    hash_evidence: &EvidenceEnvelope,
    authenticode_evidence: &EvidenceEnvelope,
    snapshot: &TrustSnapshot,
    policy: &ReleasePolicy,
) -> Result<ReleaseGateDecision, TrustPolicyError> {
    let mut rules = Vec::with_capacity(6);
    rules.push(evaluate_envelope(
        ReleaseRule::ArtifactHash,
        hash_evidence,
        EvidenceType::ArtifactHash,
        "hash-engine",
        artifact_digest,
    ));
    rules.push(evaluate_envelope(
        ReleaseRule::Authenticode,
        authenticode_evidence,
        EvidenceType::AuthenticodeVerification,
        "authenticode-verifier",
        artifact_digest,
    ));
    rules.push(evaluate_certificate_chain(snapshot));
    rules.push(evaluate_timestamp(snapshot.timestamp.as_ref(), policy.require_timestamp));
    rules.push(evaluate_publisher(&snapshot.signer, policy.expected_publisher_subject.as_deref()));
    rules.push(evaluate_lineage(hash_evidence, authenticode_evidence));

    let passed = rules.iter().all(|rule| rule.status != RuleStatus::Failed);
    let status = if passed { TrustStatus::Verified } else { TrustStatus::Blocked };
    let result = if passed { NormalizedResult::Success } else { NormalizedResult::Failure };
    let decision_digest = decision_digest(artifact_digest, hash_evidence, authenticode_evidence, snapshot, policy, &rules);

    let mut evidence = EvidenceEnvelope::new(
        status,
        EvidenceType::ReleaseGate,
        PRODUCER,
        PRODUCER_VERSION,
        Some(artifact_digest.to_owned()),
        result,
    )?;
    evidence.raw_output_digest = Some(decision_digest.clone());
    evidence.parent_evidence_ids.push(hash_evidence.id);
    evidence.parent_evidence_ids.push(authenticode_evidence.id);

    Ok(ReleaseGateDecision { status, decision_digest, rules, evidence })
}

fn evaluate_envelope(
    rule: ReleaseRule,
    evidence: &EvidenceEnvelope,
    expected_type: EvidenceType,
    expected_producer: &str,
    artifact_digest: &str,
) -> RuleEvaluation {
    if evidence.evidence_type != expected_type { return failed(rule, GateFailure::WrongEvidenceType); }
    if evidence.producer != expected_producer { return failed(rule, GateFailure::UnexpectedProducer); }
    if !evidence.status.is_positive() { return failed(rule, GateFailure::EvidenceNotPositive); }
    if evidence.result != NormalizedResult::Success { return failed(rule, GateFailure::NormalizedResultNotSuccess); }
    match evidence.artifact_digest.as_deref() {
        None => failed(rule, GateFailure::ArtifactDigestMissing),
        Some(value) if value != artifact_digest => failed(rule, GateFailure::ArtifactDigestMismatch),
        Some(_) => passed(rule),
    }
}

fn evaluate_certificate_chain(snapshot: &TrustSnapshot) -> RuleEvaluation {
    if !snapshot.policy_verified || snapshot.policy_error != 0 {
        return failed(ReleaseRule::CertificateChain, GateFailure::NativePolicyUntrusted);
    }
    if snapshot.certificate_chain.is_empty() {
        return failed(ReleaseRule::CertificateChain, GateFailure::CertificateChainEmpty);
    }
    if snapshot.certificate_chain.iter().any(|cert| cert.provider_error != 0) {
        return failed(ReleaseRule::CertificateChain, GateFailure::ProviderError);
    }
    if snapshot.certificate_chain.iter().any(|cert| cert.test_certificate) {
        return failed(ReleaseRule::CertificateChain, GateFailure::TestCertificatePresent);
    }
    if !snapshot.certificate_chain.iter().any(|cert| cert.trusted_root) {
        return failed(ReleaseRule::CertificateChain, GateFailure::TrustedRootMissing);
    }
    passed(ReleaseRule::CertificateChain)
}

fn evaluate_timestamp(timestamp: Option<&TimestampRecord>, required: bool) -> RuleEvaluation {
    let Some(timestamp) = timestamp else {
        return if required { failed(ReleaseRule::Timestamp, GateFailure::TimestampMissing) } else { not_required(ReleaseRule::Timestamp) };
    };
    if timestamp.provider_error != 0 {
        return failed(ReleaseRule::Timestamp, GateFailure::TimestampProviderError);
    }
    if timestamp.verify_as_of_filetime < timestamp.signer.not_before_filetime
        || timestamp.verify_as_of_filetime > timestamp.signer.not_after_filetime
    {
        return failed(ReleaseRule::Timestamp, GateFailure::TimestampOutsideCertificateValidity);
    }
    if timestamp.certificate_chain.is_empty() {
        return failed(ReleaseRule::Timestamp, GateFailure::CertificateChainEmpty);
    }
    if timestamp.certificate_chain.iter().any(|cert| cert.provider_error != 0) {
        return failed(ReleaseRule::Timestamp, GateFailure::ProviderError);
    }
    if timestamp.certificate_chain.iter().any(|cert| cert.test_certificate) {
        return failed(ReleaseRule::Timestamp, GateFailure::TestCertificatePresent);
    }
    if !timestamp.certificate_chain.iter().any(|cert| cert.trusted_root) {
        return failed(ReleaseRule::Timestamp, GateFailure::TrustedRootMissing);
    }
    passed(ReleaseRule::Timestamp)
}

fn evaluate_publisher(signer: &CertificateRecord, expected: Option<&str>) -> RuleEvaluation {
    let Some(expected) = expected else { return not_required(ReleaseRule::PublisherIdentity); };
    if signer.subject.trim() == expected.trim() {
        passed(ReleaseRule::PublisherIdentity)
    } else {
        failed(ReleaseRule::PublisherIdentity, GateFailure::PublisherIdentityMismatch)
    }
}

fn evaluate_lineage(hash: &EvidenceEnvelope, authenticode: &EvidenceEnvelope) -> RuleEvaluation {
    if authenticode.parent_evidence_ids.contains(&hash.id) {
        passed(ReleaseRule::EvidenceLineage)
    } else {
        failed(ReleaseRule::EvidenceLineage, GateFailure::ParentEvidenceMissing)
    }
}

fn decision_digest(
    artifact_digest: &str,
    hash: &EvidenceEnvelope,
    authenticode: &EvidenceEnvelope,
    snapshot: &TrustSnapshot,
    policy: &ReleasePolicy,
    rules: &[RuleEvaluation],
) -> String {
    let mut canonical = String::new();
    canonical.push_str("codlisans-release-gate-v1\n");
    canonical.push_str(artifact_digest);
    canonical.push('\n');
    canonical.push_str(&hash.id.to_string());
    canonical.push('\n');
    canonical.push_str(&authenticode.id.to_string());
    canonical.push('\n');
    canonical.push_str(&snapshot.signer.sha256_thumbprint);
    canonical.push('\n');
    canonical.push_str(if policy.require_timestamp { "timestamp=1" } else { "timestamp=0" });
    canonical.push('\n');
    if let Some(expected) = &policy.expected_publisher_subject {
        canonical.push_str("publisher=");
        canonical.push_str(expected.trim());
        canonical.push('\n');
    }
    if let Some(timestamp) = &snapshot.timestamp {
        canonical.push_str(&timestamp.signer.sha256_thumbprint);
        canonical.push('\n');
        writeln!(canonical, "timestamp-time={}", timestamp.verify_as_of_filetime)
            .expect("writing into String must succeed");
    }
    for rule in rules {
        writeln!(canonical, "{:?}:{:?}:{:?}", rule.rule, rule.status, rule.failure)
            .expect("writing into String must succeed");
    }
    hex::encode(Sha256::digest(canonical.as_bytes()))
}

const fn passed(rule: ReleaseRule) -> RuleEvaluation {
    RuleEvaluation { rule, status: RuleStatus::Passed, failure: None }
}

const fn not_required(rule: ReleaseRule) -> RuleEvaluation {
    RuleEvaluation { rule, status: RuleStatus::NotRequired, failure: None }
}

const fn failed(rule: ReleaseRule, failure: GateFailure) -> RuleEvaluation {
    RuleEvaluation { rule, status: RuleStatus::Failed, failure: Some(failure) }
}
