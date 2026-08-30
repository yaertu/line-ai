#![cfg(windows)]

use windows_sys::Win32::Security::WinTrust::{
    WTD_CACHE_ONLY_URL_RETRIEVAL, WTD_REVOCATION_CHECK_CHAIN_EXCLUDE_ROOT,
    WTD_REVOCATION_CHECK_NONE, WTD_REVOKE_NONE,
};
use wintrust_native::production_native_revocation_settings;

#[test]
fn wintrust_policy_path_cannot_perform_unbounded_network_revocation() {
    let settings = production_native_revocation_settings();

    assert_eq!(settings.fdw_revocation_checks(), WTD_REVOKE_NONE);
    assert_eq!(
        settings.provider_flags() & WTD_CACHE_ONLY_URL_RETRIEVAL,
        WTD_CACHE_ONLY_URL_RETRIEVAL
    );
    assert_eq!(
        settings.provider_flags() & WTD_REVOCATION_CHECK_NONE,
        WTD_REVOCATION_CHECK_NONE
    );
    assert_eq!(
        settings.provider_flags() & WTD_REVOCATION_CHECK_CHAIN_EXCLUDE_ROOT,
        0
    );
}
