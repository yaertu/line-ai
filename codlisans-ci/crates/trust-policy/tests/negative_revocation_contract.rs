#![cfg(windows)]

use authenticode_verifier::{AuthenticodeResult, verify_authenticode};
use evidence_model::TrustStatus;
use std::{
    fmt::Write as _,
    fs,
    io::{ErrorKind, Read as _, Write as _},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    process::Command,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::Duration,
};
use trust_policy::{GateFailure, ReleasePolicy, ReleaseRule, RuleStatus, verify_windows_release};

const ERROR_NO_MORE_ITEMS: i32 = -2_147_024_637; // 0x80070103
const FIREWALL_RULE: &str = "CODLISANS_NEGATIVE_REVOCATION_HTTP";
const PORTPROXY_LISTEN_ADDRESS: &str = "127.0.0.2";
const REVOCATION_HOSTS: &[&str] = &[
    "www.microsoft.com",
    "crl.microsoft.com",
    "oneocsp.microsoft.com",
    "ocsp.digicert.com",
    "ocsp.sectigo.com",
    "ocsp2.globalsign.com",
    "ocsp.globalsign.com",
];

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

struct PortProxyGuard;

impl PortProxyGuard {
    fn forward_http_to(connect_port: u16) -> Self {
        let _ = Command::new("netsh.exe")
            .args([
                "interface",
                "portproxy",
                "delete",
                "v4tov4",
                "listenport=80",
                &format!("listenaddress={PORTPROXY_LISTEN_ADDRESS}"),
            ])
            .status();
        let status = Command::new("netsh.exe")
            .args([
                "interface",
                "portproxy",
                "add",
                "v4tov4",
                "listenport=80",
                &format!("listenaddress={PORTPROXY_LISTEN_ADDRESS}"),
                &format!("connectport={connect_port}"),
                "connectaddress=127.0.0.1",
            ])
            .status()
            .expect("netsh portproxy must be launchable on the Windows qualification runner");
        assert!(
            status.success(),
            "failed to install the localhost revocation portproxy"
        );
        Self
    }
}

impl Drop for PortProxyGuard {
    fn drop(&mut self) {
        let _ = Command::new("netsh.exe")
            .args([
                "interface",
                "portproxy",
                "delete",
                "v4tov4",
                "listenport=80",
                &format!("listenaddress={PORTPROXY_LISTEN_ADDRESS}"),
            ])
            .status();
    }
}

struct HostsGuard {
    path: PathBuf,
    original: Vec<u8>,
}

impl HostsGuard {
    fn redirect_revocation_hosts_to_fault_proxy() -> Self {
        let windows = PathBuf::from(std::env::var_os("WINDIR").expect("WINDIR must exist"));
        let path = windows
            .join("System32")
            .join("drivers")
            .join("etc")
            .join("hosts");
        let original = fs::read(&path).expect("Windows hosts file must be readable");
        let mut replacement = original.clone();
        if !replacement.ends_with(b"\n") {
            replacement.push(b'\n');
        }
        replacement.extend_from_slice(b"# CODLISANS negative revocation qualification\n");
        for host in REVOCATION_HOSTS {
            replacement.extend_from_slice(
                format!("{PORTPROXY_LISTEN_ADDRESS} {host}\n").as_bytes(),
            );
        }
        fs::write(&path, replacement).expect("Windows hosts file must be writable by CI admin");
        flush_dns_cache();
        Self { path, original }
    }
}

impl Drop for HostsGuard {
    fn drop(&mut self) {
        let _ = fs::write(&self.path, &self.original);
        flush_dns_cache();
    }
}

struct MalformedRevocationResponder {
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
    port: u16,
}

impl MalformedRevocationResponder {
    fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0")
            .expect("an ephemeral localhost port must be available for revocation fault injection");
        let port = listener
            .local_addr()
            .expect("localhost fault listener must expose its bound address")
            .port();
        listener
            .set_nonblocking(true)
            .expect("localhost fault listener must support nonblocking mode");
        let stop = Arc::new(AtomicBool::new(false));
        let worker_stop = Arc::clone(&stop);
        let worker = thread::spawn(move || {
            while !worker_stop.load(Ordering::Acquire) {
                match listener.accept() {
                    Ok((mut stream, _)) => serve_malformed_revocation(&mut stream),
                    Err(error) if error.kind() == ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(10));
                    }
                    Err(error) => panic!("localhost revocation responder failed: {error}"),
                }
            }
        });
        Self {
            stop,
            worker: Some(worker),
            port,
        }
    }

    const fn port(&self) -> u16 {
        self.port
    }
}

impl Drop for MalformedRevocationResponder {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        let _ = TcpStream::connect(("127.0.0.1", self.port));
        if let Some(worker) = self.worker.take() {
            worker
                .join()
                .expect("localhost revocation responder must stop cleanly");
        }
    }
}

fn serve_malformed_revocation(stream: &mut TcpStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_millis(100)));
    let mut request = [0_u8; 4096];
    let _ = stream.read(&mut request);
    let body = b"not-a-valid-crl-or-ocsp-response";
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream
        .write_all(response.as_bytes())
        .expect("malformed responder headers must be writable");
    stream
        .write_all(body)
        .expect("malformed responder body must be writable");
    let _ = stream.flush();
}

fn prove_fault_proxy_route() {
    let mut stream = TcpStream::connect((PORTPROXY_LISTEN_ADDRESS, 80))
        .expect("portproxy route must accept the qualification probe");
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .expect("qualification probe must support a read timeout");
    stream
        .write_all(b"GET /codlisans-probe HTTP/1.1\r\nHost: revocation.invalid\r\nConnection: close\r\n\r\n")
        .expect("qualification probe request must be writable");
    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .expect("qualification probe response must be readable");
    assert!(
        response
            .windows(b"not-a-valid-crl-or-ocsp-response".len())
            .any(|window| window == b"not-a-valid-crl-or-ocsp-response"),
        "portproxy probe did not reach the malformed revocation responder"
    );
}

fn flush_dns_cache() {
    let status = Command::new("ipconfig.exe")
        .arg("/flushdns")
        .status()
        .expect("ipconfig must be launchable on the Windows qualification runner");
    assert!(status.success(), "failed to flush the Windows DNS cache");
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

#[test]
#[ignore = "mutates Windows hosts, portproxy, and CryptNet cache for destructive qualification"]
fn malformed_revocation_response_is_a_structured_unknown_block() {
    let (artifact, auth) = verified_physical_fixture();
    let responder = MalformedRevocationResponder::start();
    let _portproxy = PortProxyGuard::forward_http_to(responder.port());
    prove_fault_proxy_route();
    let _hosts = HostsGuard::redirect_revocation_hosts_to_fault_proxy();
    force_chain_cache_resync();
    clear_cryptnet_url_cache();

    let decision = verify_windows_release(
        &artifact,
        &auth.hash_evidence,
        &auth.evidence,
        &ReleasePolicy::default(),
        Duration::from_secs(5),
    )
    .expect("malformed revocation data must normalize into a structured BLOCKED decision");

    assert_eq!(decision.status, TrustStatus::Blocked);
    assert!(decision.rules.iter().any(|rule| {
        rule.rule == ReleaseRule::Revocation
            && rule.status == RuleStatus::Failed
            && rule.failure == Some(GateFailure::RevocationUnknown)
    }));
}
