#![forbid(unsafe_code)]

use std::{
    ffi::OsString,
    path::PathBuf,
    process::{Command, Stdio},
    time::{Duration, Instant},
};
use thiserror::Error;

#[derive(Debug, Clone)]
pub struct CommandSpec {
    pub program: PathBuf,
    pub args: Vec<OsString>,
    pub timeout: Duration,
}
#[derive(Debug)]
pub struct ProcessEvidence {
    pub exit_code: Option<i32>,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}
#[derive(Debug, Error)]
pub enum ProcessError {
    #[error("failed to start process: {0}")]
    Spawn(#[source] std::io::Error),
    #[error("process timed out")]
    Timeout,
    #[error("failed to read process output: {0}")]
    Io(#[from] std::io::Error),
}

/// Runs an executable directly without a command shell.
///
/// # Errors
/// Returns a typed spawn, timeout, or I/O error.
pub fn run(spec: &CommandSpec) -> Result<ProcessEvidence, ProcessError> {
    let mut child = Command::new(&spec.program)
        .args(&spec.args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(ProcessError::Spawn)?;
    let started = Instant::now();
    loop {
        if child.try_wait()?.is_some() {
            break;
        }
        if started.elapsed() >= spec.timeout {
            child.kill()?;
            let _ = child.wait();
            return Err(ProcessError::Timeout);
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    let output = child.wait_with_output()?;
    Ok(ProcessEvidence {
        exit_code: output.status.code(),
        stdout: output.stdout,
        stderr: output.stderr,
    })
}
