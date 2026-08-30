#![cfg(windows)]

use authenticode_verifier::{AuthenticodeResult, verify_authenticode};
use evidence_model::TrustStatus;
use std::{
    fmt::Write as _,
    fs,
    io::{ErrorKind, Read as _},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    process::Command,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
use trust_policy::{ReleasePolicy, ReleaseRule, RuleStatus, verify_windows_release};

const ERROR_NO_MORE_ITEMS: i32 = -2_147_024_637; // 0x80070103
const INTERNET_SETTINGS_KEY: &str =
    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings";

struct DualProxyGuard {
    registry_backup: PathBuf,
}

impl DualProxyGuard {
    fn route_to_local_responder(port: u16) -> Self {
        let registry_backup = std::env::temp_dir().join(format!(
            "codlisans-timeout-internet-settings-{}.reg",
            std::process::id()
        ));
        let export = Command::new("reg.exe")
            .args([
                "export",
                INTERNET_SETTINGS_KEY,
                registry_backup
                    .to_str()
                    .expect("registry backup path must be valid UTF-8"),
                "/y",
            ])
            .status()
            .expect("reg.exe export must be launchable on the Windows qualification runner");
        assert!(export.success(), "failed to back up WinINet proxy settings");

        let proxy = format!("127.0.0.1:{port}");
        let winhttp = Command::new("netsh.exe")
            .args(["winhttp", "set", "proxy", &format!("proxy-server={proxy}")])
            .status()
            .expect("netsh WinHTTP proxy configuration must be launchable");
        assert!(winhttp.success(), "failed to configure the WinHTTP proxy");

        set_registry_value("ProxyEnable", "REG_DWORD", "1");
        set_registry_value("ProxyServer", "REG_SZ", &proxy);
        Self { registry_backup }
    }
}

impl Drop for DualProxyGuard {
    fn drop(&mut self) {
        let _ = Command::new("netsh.exe")
            .args(["winhttp", "reset", "proxy"])
            .status();
        for value in ["ProxyEnable", "ProxyServer"] {
            let _ = Command::new("reg.exe")
                .args(["delete", INTERNET_SETTINGS_KEY, "/v", value, "/f"])
                .status();
        }
        let _ = Command::new("reg.exe")
            .args([
                "import",
                self.registry_backup
                    .to_str()
                    .expect("registry backup path must be valid UTF-8"),
            ])
            .status();
        let _ = fs::remove_file(&self.registry_backup);
    }
}

fn set_registry_value(name: &str, value_type: &str, data: &str) {
    let status = Command::new("reg.exe")
        .args([
            "add",
            INTERNET_SETTINGS_KEY,
            "/v",
            name,
            "/t",
            value_type,
            "/d",
            data,
            "/f",
        ])
        .status()
        .expect("reg.exe add must be launchable on the Windows qualification runner");
    assert!(status.success(), "failed to set WinINet value {name}");
}

struct StallingRevocationResponder {
    stop: Arc<AtomicBool>,
    requests: Arc<AtomicUsize>,
    worker: Option<JoinHandle<()>>,
    port: u16,
}

impl StallingRevocationResponder {
    fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0")
            .expect("an ephemeral localhost port must be available for timeout qualification");
        let port = listener
            .local_addr()
            .expect("localhost stall listener must expose its bound address")
            .port();
        listener
            .set_nonblocking(true)
            .expect("localhost stall listener must support nonblocking mode");
        let stop = Arc::new(AtomicBool::new(false));
        let requests = Arc::new(AtomicUsize::new(0));
        let worker_stop = Arc::clone(&stop);
        let worker_requests = Arc::clone(&requests);
        let worker = thread::spawn(move || {
            while !worker_stop.load(Ordering::Acquire) {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        worker_requests.fetch_add(1, Ordering::AcqRel);
                        stall_connection(&mut stream, &worker_stop);
                    }
                    Err(error) if error.kind() == ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(10));
                    }
                    Err(error) => panic!("localhost stall responder failed: {error}"),
                }
            }
        });
        Self {
            stop,
            requests,
            worker: Some(worker),
            port,
        }
    }

    const fn port(&self) -> u16 {
        self.port
    }

    fn requests_seen(&self) -> usize {
        self.requests.load(Ordering::Acquire)
    }
}

impl Drop for StallingRevocationResponder {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        let _ = TcpStream::connect(("127.0.0.1", self.port));
        if let Some(worker) = self.worker.take() {
            worker
                .join()
                .expect("localhost stall responder must stop cleanly");
        }
    }
}

fn stall_connection(stream: &mut TcpStream, stop: &AtomicBool) {
    let _ = stream.set_read_timeout(Some(Duration::from_millis(250)));
    let mut request = [0_u8; 4096];
    let _ = stream.read(&mut request);
    while !stop.load(Ordering::Acquire) {
        thread::sleep(Duration::from_millis(10));
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
#[ignore = "mutates WinHTTP/WinINet proxy and CryptNet cache for destructive timeout qualification"]
fn stalled_revocation_retrieval_is_bounded_and_blocks_release() {
    let (artifact, auth) = verified_physical_fixture();
    let responder = StallingRevocationResponder::start();
    let _proxy = DualProxyGuard::route_to_local_responder(responder.port());
    force_chain_cache_resync();
    clear_cryptnet_url_cache();

    let budget = Duration::from_millis(500);
    let started = Instant::now();
    let result = verify_windows_release(
        &artifact,
        &auth.hash_evidence,
        &auth.evidence,
        &ReleasePolicy::default(),
        budget,
    );
    let elapsed = started.elapsed();
    let requests = responder.requests_seen();
    eprintln!(
        "CODLISANS stalled revocation requests={requests} elapsed_ms={} budget_ms={}",
        elapsed.as_millis(),
        budget.as_millis()
    );

    assert!(
        requests > 0,
        "CryptNet did not reach the stalling responder; timeout qualification is invalid"
    );
    assert!(
        elapsed >= Duration::from_millis(200),
        "stall fault returned too early to demonstrate bounded retrieval timeout: {elapsed:?}"
    );
    assert!(
        elapsed <= Duration::from_secs(3),
        "bounded revocation retrieval exceeded the qualification ceiling: {elapsed:?}"
    );

    let decision = result.expect("stalled revocation retrieval must fail closed as BLOCKED");
    assert_eq!(decision.status, TrustStatus::Blocked);
    assert_ne!(decision.revocation.native_status, 0);
    assert!(
        decision.rules.iter().any(|rule| {
            rule.rule == ReleaseRule::Revocation && rule.status == RuleStatus::Failed
        })
    );
}
