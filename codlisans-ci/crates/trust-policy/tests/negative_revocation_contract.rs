#![cfg(windows)]

use authenticode_verifier::{AuthenticodeResult, verify_authenticode};
use evidence_model::TrustStatus;
use std::{
    fmt::Write as _,
    net::TcpListener,
    path::PathBuf,
    process::Command,
    time::Duration,
};
use trust_policy::{ReleasePolicy, verify_windows_release};

const ERROR_NO_MORE_ITEMS: i32 = -2_147_024_637; // 0x80070103

struct WinHttpProxyGuard;

impl WinHttpProxyGuard {
    fn point_to_closed_local_port() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0")
            .expect("a temporary localhost port must be reservable");
        let port = listener
            .local_addr()
            .expect("temporary listener must have a local address")
            .port();
        drop(listener);

        let proxy = format!("127.0.0.1:{port}");
        let status = Command::new("netsh.exe")
            .args([
                "winhttp",
                "set",
                "proxy",
                &format!("proxy-server={proxy}"),
            ])
            .status()
            .expect("netsh must be launchable on the Windows qualification runner");
        assert!(status.success(), "failed to point WinHTTP at {proxy}");
        Self
    }
}

impl Drop for WinHttpProxyGuard {
    fn drop(&mut self) {
        let _ = Command::new("netsh.exe")
            .args(["winhttp", "reset", "proxy"])
            .status();
    }
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
#[ignore = "mutates WinHTTP proxy and CryptNet URL cache for destructive negative qualification"]
fn offline_revocation_is_a_structured_blocked_release_decision() {
    let (artifact, auth) = verified_physical_fixture();
    let _proxy = WinHttpProxyGuard::point_to_closed_local_port();
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
}
