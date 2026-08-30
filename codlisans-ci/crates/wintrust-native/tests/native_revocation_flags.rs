#![cfg(windows)]

use windows_sys::Win32::Security::WinTrust::{
    WTD_CACHE_ONLY_URL_RETRIEVAL, WTD_REVOCATION_CHECK_CHAIN_EXCLUDE_ROOT,
    WTD_REVOCATION_CHECK_NONE, WTD_REVOKE_WHOLECHAIN,
};
use wintrust_native::production_native_revocation_settings;

#[test]
fn production_native_settings_enable_online_whole_chain_revocation() {
    let settings = production_native_revocation_settings();

    assert_eq!(settings.fdw_revocation_checks(), WTD_REVOKE_WHOLECHAIN);
    assert_eq!(
        settings.provider_flags() & WTD_REVOCATION_CHECK_CHAIN_EXCLUDE_ROOT,
        WTD_REVOCATION_CHECK_CHAIN_EXCLUDE_ROOT
    );
    assert_eq!(settings.provider_flags() & WTD_REVOCATION_CHECK_NONE, 0);
    assert_eq!(settings.provider_flags() & WTD_CACHE_ONLY_URL_RETRIEVAL, 0);
}
