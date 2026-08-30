#![cfg(windows)]

use authenticode_verifier::verify_authenticode;
use evidence_model::TrustStatus;
use std::{fmt::Write as _, path::PathBuf, time::Duration};
use trust_policy::{ReleasePolicy, ReleaseRule, RuleStatus, verify_windows_release};

#[test]
fn real_authenticode_evidence_flows_into_native_release_gate() {
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
            Ok(auth) if auth.status == TrustStatus::Verified => {
                match verify_windows_release(
                    &artifact,
                    &auth.hash_evidence,
                    &auth.evidence,
                    &ReleasePolicy::default(),
                    Duration::from_secs(30),
                ) {
                    Ok(decision) if decision.status == TrustStatus::Verified => {
                        assert!(
                            decision
                                .rules
                                .iter()
                                .any(|rule| rule.rule == ReleaseRule::Timestamp
                                    && rule.status == RuleStatus::Passed)
                        );
                        assert_eq!(
                            decision.evidence.parent_evidence_ids[0],
                            auth.hash_evidence.id
                        );
                        assert_eq!(decision.evidence.parent_evidence_ids[1], auth.evidence.id);
                        assert_eq!(decision.revocation.configured_budget_ms, 30_000);

                        let alternate_budget_decision = verify_windows_release(
                            &artifact,
                            &auth.hash_evidence,
                            &auth.evidence,
                            &ReleasePolicy::default(),
                            Duration::from_secs(31),
                        )
                        .expect("alternate revocation budget must still produce a release decision");
                        assert_eq!(alternate_budget_decision.status, TrustStatus::Verified);
                        assert_eq!(
                            alternate_budget_decision.revocation.configured_budget_ms,
                            31_000
                        );
                        assert_ne!(
                            decision.decision_digest,
                            alternate_budget_decision.decision_digest,
                            "different configured revocation budgets must be integrity-bound into the decision digest"
                        );
                        return;
                    }
                    Ok(decision) => writeln!(
                        &mut diagnostics,
                        "{} => release {:?}",
                        artifact.display(),
                        decision.rules
                    )
                    .expect("writing diagnostics into String must succeed"),
                    Err(error) => writeln!(
                        &mut diagnostics,
                        "{} => release error {error:?}",
                        artifact.display()
                    )
                    .expect("writing diagnostics into String must succeed"),
                }
            }
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
    panic!(
        "no physical Windows fixture passed the full verifier -> WinTrust -> release gate chain:\n{diagnostics}"
    );
}
