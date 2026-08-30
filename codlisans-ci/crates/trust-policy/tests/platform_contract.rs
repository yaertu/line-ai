use std::time::Duration;

use evidence_model::{EvidenceEnvelope, EvidenceType, NormalizedResult, TrustStatus};
use trust_policy::{ReleasePolicy, TrustPolicyError, verify_windows_release};

#[cfg(not(windows))]
#[test]
fn non_windows_host_cannot_claim_windows_release_trust() {
    let artifact = std::env::current_exe().expect("test executable path must be available");
    let digest = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let hash = EvidenceEnvelope::new(
        TrustStatus::Verified,
        EvidenceType::ArtifactHash,
        "hash-engine",
        "0.1.0",
        Some(digest.to_owned()),
        NormalizedResult::Success,
    )
    .expect("hash evidence fixture must be valid");
    let mut authenticode = EvidenceEnvelope::new(
        TrustStatus::Verified,
        EvidenceType::AuthenticodeVerification,
        "authenticode-verifier",
        "0.1.0",
        Some(digest.to_owned()),
        NormalizedResult::Success,
    )
    .expect("authenticode evidence fixture must be valid");
    authenticode.parent_evidence_ids.push(hash.id);

    let error = verify_windows_release(
        &artifact,
        &hash,
        &authenticode,
        &ReleasePolicy::default(),
        Duration::from_secs(30),
    )
    .expect_err("a non-Windows host must not fabricate a Windows release verdict");
    assert!(matches!(
        error,
        TrustPolicyError::Native(wintrust_native::NativeTrustError::UnsupportedPlatform)
    ));
}
