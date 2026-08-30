#![cfg(windows)]

use std::time::Duration;

use windows_sys::Win32::Security::Cryptography::{
    CERT_CHAIN_REVOCATION_ACCUMULATIVE_TIMEOUT, CERT_CHAIN_REVOCATION_CHECK_CHAIN_EXCLUDE_ROOT,
};
use wintrust_native::production_chain_revocation_settings;

#[test]
fn production_chain_revocation_maps_budget_to_cumulative_timeout() {
    let settings = production_chain_revocation_settings(Duration::from_millis(2_750))
        .expect("a finite positive budget must be accepted");

    assert_eq!(settings.url_retrieval_timeout_ms(), 2_750);
    assert_eq!(
        settings.flags(),
        CERT_CHAIN_REVOCATION_CHECK_CHAIN_EXCLUDE_ROOT | CERT_CHAIN_REVOCATION_ACCUMULATIVE_TIMEOUT
    );
}

#[test]
fn zero_revocation_budget_is_rejected_fail_closed() {
    assert!(production_chain_revocation_settings(Duration::ZERO).is_err());
}
