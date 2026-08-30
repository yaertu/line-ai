#![cfg(windows)]

use authenticode_verifier::{AuthenticodeResult, verify_authenticode};
use evidence_model::TrustStatus;
use std::{fmt::Write as _, path::PathBuf, process::Command, time::Duration};
use trust_policy::{
    GateFailure, ReleasePolicy, ReleaseRule, RuleStatus, verify_windows_release,
};

const ERROR_NO_MORE_ITEMS: i32 = -2_147_024_637; // 0x80070103
const FIREWALL_RULE: &str = "CODLISANS_NEGATIVE_REVOCATION_HTTP";

struct RevocationNetworkGuard;

impl RevocationNetworkGuard {
    fn block_http() -> Self {
        let status = Command::new("netsh.exe")
            .args([
                "advfirewall",
                "firewall",
                "add",
                "rule",
                &format!("name={FIREWALL_RULE}"),
                "dir=out",
                "action=block",
                "protocol=TCP",
                "remoteport=80",
                "profile=any",
            ])
            .status()
            .expect("netsh firewall must be launchable on the Windows qualification runner");
        assert!(
            status.success(),
            "failed to install outbound HTTP block rule"
        );
        Self
    }
}

impl Drop for RevocationNetworkGuard {
    fn drop(&mut self) {
        let _ = Command::new("netsh.exe")
            .args([
                "advfirewall",
                "firewall",
                "delete",
                "rule",
                &format!("name={FIREWALL_RULE}"),
            ])
            .status();
    }
}

fn force_chain_cache_resync() {
    let status = Command::new("certutil.exe")
        .args(["-setreg", "chain\\ChainCacheResyncFiletime", "@now"])
        .status()
        .expect("certutil must be launchable on the Windows qualification runner");
    assert!(
        status.success(),
        "failed to force the Windows chain cache resync time"
    );
}

fn clear_cryptnet_url_cache() {
    let status = Command::new("certutil.exe")
        .args(["-urlcache", "*", "delete"])
        .status()
        .expect("certutil must be launchable on the Windows qualification runner");
    match status.code() {
        Some(0 | ERROR_NO_MORE_ITEMS) => {}
        code => panic!("CryptNet URL cache deletion failed with exit code {code:?}"),
    }
}

fn verified_physical_fixture() -> (PathBuf, AuthenticodeResult) {
    let windows = PathBuf::from(std::env::var_os("WINDIR").expect("WINDIR must exist"));
    let mut candidates = vec![
        windows
            .join("System32")
            .join("WindowsPowerShell")
            .join("v1.0")
            .join("powershell.exe"),
        windows.join("System32").join("notepad.exe"),
        windows.join("System32").join("msiexec.exe"),
        windows.join("System32").join("regsvr32.exe"),
        windows.join("System32").join("WerFault.exe"),
        windows.join("System32").join("mmc.exe"),
    ];
    if let Some(program_files) = std::env::var_os("ProgramFiles") {
        candidates.insert(
            0,
            PathBuf::from(program_files)
                .join("PowerShell")
                .join("7")
                .join("pwsh.exe"),
        );
    }

    let mut diagnostics = String::new();
    for artifact in candidates.into_iter().filter(|path| path.is_file()) {
        match verify_authenticode(&artifact) {
            Ok(auth) if auth.status == TrustStatus::Verified => return (artifact, auth),
            Ok(auth) => writeln!(
                &mut diagnostics,
                "{} => Authenticode {:?}",
                artifact.display(),
                auth.status
            )
            .expect("writing diagnostics into String must succeed"),
            Err(error) => writeln!(
                &mut diagnostics,
                "{} => verifier error {error:?}",
                artifact.display()
            )
            .expect("writing diagnostics into String must succeed"),
        }
    }
    panic!("no verified physical Windows fixture was available:\n{diagnostics}");
}

#[test]
#[ignore = "mutates Windows Firewall and CryptNet cache for destructive negative qualification"]
fn offline_revocation_is_a_structured_blocked_release_decision() {
    let (artifact, auth) = verified_physical_fixture();
    let _network = RevocationNetworkGuard::block_http();
    force_chain_cache_resync();
    clear_cryptnet_url_cache();

    let decision = verify_windows_release(
        &artifact,
        &auth.hash_evidence,
        &auth.evidence,
        &ReleasePolicy::default(),
        Duration::from_secs(5),
    )
    .expect("offline revocation must be normalized into a structured BLOCKED decision");

    assert_eq!(decision.status, TrustStatus::Blocked);
    assert_eq!(decision.evidence.status, TrustStatus::Blocked);
    assert!(decision.rules.iter().any(|rule| {
        rule.rule == ReleaseRule::Revocation
            && rule.status == RuleStatus::Failed
            && rule.failure == Some(GateFailure::RevocationOffline)
    }));
}
