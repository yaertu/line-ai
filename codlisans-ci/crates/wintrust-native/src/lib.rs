//! Isolated native Windows trust boundary.

use std::{path::Path, time::Duration};
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RevocationScope {
    WholeChainExcludingRoot,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RevocationPolicy {
    scope: RevocationScope,
    network_retrieval: bool,
    fail_closed: bool,
}

impl RevocationPolicy {
    #[must_use]
    pub const fn production() -> Self {
        Self {
            scope: RevocationScope::WholeChainExcludingRoot,
            network_retrieval: true,
            fail_closed: true,
        }
    }

    #[must_use]
    pub const fn scope(self) -> RevocationScope {
        self.scope
    }

    #[must_use]
    pub const fn allows_network_retrieval(self) -> bool {
        self.network_retrieval
    }

    #[must_use]
    pub const fn fail_closed(self) -> bool {
        self.fail_closed
    }
}

#[cfg(windows)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NativeRevocationSettings {
    fdw_revocation_checks: u32,
    provider_flags: u32,
}

#[cfg(windows)]
impl NativeRevocationSettings {
    #[must_use]
    pub const fn fdw_revocation_checks(self) -> u32 {
        self.fdw_revocation_checks
    }

    #[must_use]
    pub const fn provider_flags(self) -> u32 {
        self.provider_flags
    }
}

#[cfg(windows)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ChainRevocationSettings {
    flags: u32,
    url_retrieval_timeout_ms: u32,
}

#[cfg(windows)]
impl ChainRevocationSettings {
    #[must_use]
    pub const fn flags(self) -> u32 {
        self.flags
    }

    #[must_use]
    pub const fn url_retrieval_timeout_ms(self) -> u32 {
        self.url_retrieval_timeout_ms
    }
}

#[cfg(windows)]
#[must_use]
pub fn production_native_revocation_settings() -> NativeRevocationSettings {
    windows::revocation_settings(RevocationPolicy::production())
}

/// Converts the release timeout budget into bounded Windows certificate-chain revocation settings.
///
/// # Errors
///
/// Returns [`NativeTrustError::InvalidRevocationTimeoutBudget`] for a budget smaller than one
/// millisecond and [`NativeTrustError::RevocationTimeoutBudgetTooLarge`] when the millisecond value
/// cannot fit a Windows `DWORD`.
#[cfg(windows)]
pub fn production_chain_revocation_settings(
    timeout_budget: Duration,
) -> Result<ChainRevocationSettings, NativeTrustError> {
    windows::chain_revocation_settings(timeout_budget)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CertificateRecord {
    pub subject: String,
    pub issuer: String,
    pub sha256_thumbprint: String,
    pub not_before_filetime: u64,
    pub not_after_filetime: u64,
    pub provider_error: u32,
    pub trusted_root: bool,
    pub self_signed: bool,
    pub test_certificate: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TimestampRecord {
    pub signer: CertificateRecord,
    pub certificate_chain: Vec<CertificateRecord>,
    pub verify_as_of_filetime: u64,
    pub provider_error: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrustSnapshot {
    pub policy_verified: bool,
    pub policy_error: i32,
    pub signer: CertificateRecord,
    pub certificate_chain: Vec<CertificateRecord>,
    pub timestamp: Option<TimestampRecord>,
}

#[derive(Debug, Error)]
pub enum NativeTrustError {
    #[error("WinTrust inspection is supported only on Windows")]
    UnsupportedPlatform,
    #[error("revocation timeout budget must be at least one millisecond")]
    InvalidRevocationTimeoutBudget,
    #[error("revocation timeout budget exceeds the Windows DWORD millisecond range")]
    RevocationTimeoutBudgetTooLarge,
    #[error("revocation timeout budget was exhausted")]
    RevocationDeadlineExceeded,
    #[error("bounded certificate chain context was not returned")]
    CertificateChainContextUnavailable,
    #[error("bounded revocation validation failed with trust status 0x{status:08x}")]
    RevocationCheckFailed { status: u32 },
    #[error("WinTrust provider state is unavailable after policy result {policy_error}")]
    ProviderStateUnavailable { policy_error: i32 },
    #[error("WinTrust provider state contains no primary signer")]
    SignerUnavailable,
    #[error("WinTrust signer contains no certificate chain")]
    CertificateChainUnavailable,
    #[error("WinTrust provider certificate contains no certificate context")]
    CertificateContextUnavailable,
    #[error("WinTrust certificate context contains no certificate information")]
    CertificateInfoUnavailable,
    #[error("certificate {kind} name is unavailable")]
    CertificateNameUnavailable { kind: &'static str },
    #[error("Windows API {operation} failed: {source}")]
    WindowsApi {
        operation: &'static str,
        #[source]
        source: std::io::Error,
    },
    #[error("certificate name contains invalid UTF-16: {0}")]
    InvalidCertificateName(#[from] std::string::FromUtf16Error),
}

/// Rejects native Authenticode inspection on non-Windows hosts.
///
/// # Errors
///
/// Always returns [`NativeTrustError::UnsupportedPlatform`] outside Windows.
#[cfg(not(windows))]
pub fn inspect_authenticode(
    _artifact: &Path,
    _timeout_budget: Duration,
) -> Result<TrustSnapshot, NativeTrustError> {
    Err(NativeTrustError::UnsupportedPlatform)
}

/// Inspects an Authenticode artifact through native `WinTrust` and performs bounded online
/// certificate revocation validation.
///
/// # Errors
///
/// Returns [`NativeTrustError`] when the timeout budget is invalid or exhausted, revocation status
/// is revoked/unknown/offline, or native provider state, signer, certificate-chain, certificate
/// metadata, or Windows API inspection cannot be read safely.
#[cfg(windows)]
pub fn inspect_authenticode(
    artifact: &Path,
    timeout_budget: Duration,
) -> Result<TrustSnapshot, NativeTrustError> {
    let chain_revocation = production_chain_revocation_settings(timeout_budget)?;
    windows::inspect(
        artifact,
        production_native_revocation_settings(),
        chain_revocation,
        timeout_budget,
    )
}

#[cfg(windows)]
mod windows {
    use super::{
        CertificateRecord, ChainRevocationSettings, NativeRevocationSettings, NativeTrustError,
        RevocationPolicy, RevocationScope, TimestampRecord, TrustSnapshot,
    };
    use std::{
        ffi::c_void,
        mem::size_of,
        os::windows::ffi::OsStrExt,
        path::Path,
        ptr::{null, null_mut},
        time::{Duration, Instant},
    };
    use windows_sys::Win32::{
        Foundation::FILETIME,
        Security::{
            Cryptography::{
                CERT_CHAIN_CONTEXT, CERT_CHAIN_PARA, CERT_CHAIN_REVOCATION_ACCUMULATIVE_TIMEOUT,
                CERT_CHAIN_REVOCATION_CHECK_CHAIN_EXCLUDE_ROOT, CERT_CONTEXT,
                CERT_NAME_ISSUER_FLAG, CERT_NAME_SIMPLE_DISPLAY_TYPE, CERT_SHA256_HASH_PROP_ID,
                CERT_TRUST_IS_OFFLINE_REVOCATION, CERT_TRUST_IS_REVOKED,
                CERT_TRUST_REVOCATION_STATUS_UNKNOWN, CertFreeCertificateChain,
                CertGetCertificateChain, CertGetCertificateContextProperty, CertGetNameStringW,
            },
            WinTrust::{
                CRYPT_PROVIDER_CERT, CRYPT_PROVIDER_DATA, CRYPT_PROVIDER_SGNR,
                WINTRUST_ACTION_GENERIC_VERIFY_V2, WINTRUST_DATA, WINTRUST_DATA_0,
                WINTRUST_FILE_INFO, WTD_CACHE_ONLY_URL_RETRIEVAL, WTD_CHOICE_FILE,
                WTD_REVOCATION_CHECK_NONE, WTD_REVOKE_NONE, WTD_STATEACTION_CLOSE,
                WTD_STATEACTION_VERIFY, WTD_UI_NONE, WTD_UICONTEXT_EXECUTE,
                WTHelperProvDataFromStateData, WinVerifyTrust,
            },
        },
    };

    const REVOCATION_ERROR_MASK: u32 = CERT_TRUST_IS_REVOKED
        | CERT_TRUST_REVOCATION_STATUS_UNKNOWN
        | CERT_TRUST_IS_OFFLINE_REVOCATION;

    pub(super) fn revocation_settings(policy: RevocationPolicy) -> NativeRevocationSettings {
        debug_assert!(policy.allows_network_retrieval());
        debug_assert!(policy.fail_closed());
        debug_assert_eq!(policy.scope(), RevocationScope::WholeChainExcludingRoot);
        NativeRevocationSettings {
            fdw_revocation_checks: WTD_REVOKE_NONE,
            provider_flags: WTD_CACHE_ONLY_URL_RETRIEVAL | WTD_REVOCATION_CHECK_NONE,
        }
    }

    pub(super) fn chain_revocation_settings(
        timeout_budget: Duration,
    ) -> Result<ChainRevocationSettings, NativeTrustError> {
        let millis = timeout_budget.as_millis();
        if millis == 0 {
            return Err(NativeTrustError::InvalidRevocationTimeoutBudget);
        }
        let millis =
            u32::try_from(millis).map_err(|_| NativeTrustError::RevocationTimeoutBudgetTooLarge)?;
        Ok(ChainRevocationSettings {
            flags: CERT_CHAIN_REVOCATION_CHECK_CHAIN_EXCLUDE_ROOT
                | CERT_CHAIN_REVOCATION_ACCUMULATIVE_TIMEOUT,
            url_retrieval_timeout_ms: millis,
        })
    }

    pub(super) fn inspect(
        artifact: &Path,
        wintrust: NativeRevocationSettings,
        chain_revocation: ChainRevocationSettings,
        timeout_budget: Duration,
    ) -> Result<TrustSnapshot, NativeTrustError> {
        let wide_path: Vec<u16> = artifact.as_os_str().encode_wide().chain(Some(0)).collect();
        let size32 =
            |size: usize| u32::try_from(size).expect("WinTrust structure size must fit u32");
        let mut file_info = WINTRUST_FILE_INFO {
            cbStruct: size32(size_of::<WINTRUST_FILE_INFO>()),
            pcwszFilePath: wide_path.as_ptr(),
            hFile: null_mut(),
            pgKnownSubject: null_mut(),
        };
        let mut trust_data = WINTRUST_DATA {
            cbStruct: size32(size_of::<WINTRUST_DATA>()),
            dwUIChoice: WTD_UI_NONE,
            fdwRevocationChecks: wintrust.fdw_revocation_checks,
            dwUnionChoice: WTD_CHOICE_FILE,
            Anonymous: WINTRUST_DATA_0 {
                pFile: &raw mut file_info,
            },
            dwStateAction: WTD_STATEACTION_VERIFY,
            dwProvFlags: wintrust.provider_flags,
            dwUIContext: WTD_UICONTEXT_EXECUTE,
            ..Default::default()
        };
        let mut action = WINTRUST_ACTION_GENERIC_VERIFY_V2;
        let policy_error = unsafe {
            WinVerifyTrust(
                null_mut(),
                &raw mut action,
                (&raw mut trust_data).cast::<c_void>(),
            )
        };
        let result = extract_snapshot(&trust_data, policy_error, chain_revocation, timeout_budget);
        trust_data.dwStateAction = WTD_STATEACTION_CLOSE;
        unsafe {
            let _ = WinVerifyTrust(
                null_mut(),
                &raw mut action,
                (&raw mut trust_data).cast::<c_void>(),
            );
        }
        result
    }

    fn extract_snapshot(
        trust_data: &WINTRUST_DATA,
        policy_error: i32,
        chain_revocation: ChainRevocationSettings,
        timeout_budget: Duration,
    ) -> Result<TrustSnapshot, NativeTrustError> {
        let provider = unsafe { WTHelperProvDataFromStateData(trust_data.hWVTStateData).as_ref() }
            .ok_or(NativeTrustError::ProviderStateUnavailable { policy_error })?;
        let signer = first_primary_signer(provider)?;
        let revocation_started = Instant::now();
        validate_signer_revocation(signer, chain_revocation)?;

        let timestamp_signer = first_timestamp_signer(signer)?;
        if let Some(timestamp_signer) = timestamp_signer {
            let remaining = timeout_budget
                .checked_sub(revocation_started.elapsed())
                .ok_or(NativeTrustError::RevocationDeadlineExceeded)?;
            if remaining.as_millis() == 0 {
                return Err(NativeTrustError::RevocationDeadlineExceeded);
            }
            let timestamp_settings = chain_revocation_settings(remaining)?;
            validate_signer_revocation(timestamp_signer, timestamp_settings)?;
        }

        let certificate_chain = certificate_chain(signer)?;
        let signer_record = certificate_chain
            .first()
            .cloned()
            .ok_or(NativeTrustError::CertificateChainUnavailable)?;
        let timestamp = timestamp_signer.map(timestamp_record).transpose()?;
        Ok(TrustSnapshot {
            policy_verified: policy_error == 0,
            policy_error,
            signer: signer_record,
            certificate_chain,
            timestamp,
        })
    }

    fn validate_signer_revocation(
        signer: &CRYPT_PROVIDER_SGNR,
        settings: ChainRevocationSettings,
    ) -> Result<(), NativeTrustError> {
        let certificate = signer_certificate_context(signer)?;
        let size32 = |size: usize| {
            u32::try_from(size).expect("certificate chain structure size must fit u32")
        };
        let mut chain_para = CERT_CHAIN_PARA {
            cbSize: size32(size_of::<CERT_CHAIN_PARA>()),
            dwUrlRetrievalTimeout: settings.url_retrieval_timeout_ms,
            ..Default::default()
        };
        let mut chain_context: *mut CERT_CHAIN_CONTEXT = null_mut();
        let built = unsafe {
            CertGetCertificateChain(
                null_mut(),
                certificate,
                null_mut(),
                null_mut(),
                &raw mut chain_para,
                settings.flags,
                null_mut(),
                &raw mut chain_context,
            )
        };
        if built == 0 {
            return Err(last_windows_error("CertGetCertificateChain"));
        }
        let status = unsafe { chain_context.as_ref() }
            .ok_or(NativeTrustError::CertificateChainContextUnavailable)?
            .TrustStatus
            .dwErrorStatus;
        unsafe {
            CertFreeCertificateChain(chain_context);
        }
        let revocation_status = status & REVOCATION_ERROR_MASK;
        if revocation_status != 0 {
            return Err(NativeTrustError::RevocationCheckFailed {
                status: revocation_status,
            });
        }
        Ok(())
    }

    fn signer_certificate_context(
        signer: &CRYPT_PROVIDER_SGNR,
    ) -> Result<&CERT_CONTEXT, NativeTrustError> {
        if signer.csCertChain == 0 || signer.pasCertChain.is_null() {
            return Err(NativeTrustError::CertificateChainUnavailable);
        }
        let provider_certificate = unsafe { signer.pasCertChain.as_ref() }
            .ok_or(NativeTrustError::CertificateChainUnavailable)?;
        unsafe { provider_certificate.pCert.as_ref() }
            .ok_or(NativeTrustError::CertificateContextUnavailable)
    }

    fn first_primary_signer(
        provider: &CRYPT_PROVIDER_DATA,
    ) -> Result<&CRYPT_PROVIDER_SGNR, NativeTrustError> {
        if provider.csSigners == 0 || provider.pasSigners.is_null() {
            return Err(NativeTrustError::SignerUnavailable);
        }
        unsafe {
            provider
                .pasSigners
                .as_ref()
                .ok_or(NativeTrustError::SignerUnavailable)
        }
    }

    fn first_timestamp_signer(
        signer: &CRYPT_PROVIDER_SGNR,
    ) -> Result<Option<&CRYPT_PROVIDER_SGNR>, NativeTrustError> {
        if signer.csCounterSigners == 0 || signer.pasCounterSigners.is_null() {
            return Ok(None);
        }
        unsafe { signer.pasCounterSigners.as_ref() }
            .map(Some)
            .ok_or(NativeTrustError::SignerUnavailable)
    }

    fn timestamp_record(
        timestamp_signer: &CRYPT_PROVIDER_SGNR,
    ) -> Result<TimestampRecord, NativeTrustError> {
        let chain = certificate_chain(timestamp_signer)?;
        let signer_record = chain
            .first()
            .cloned()
            .ok_or(NativeTrustError::CertificateChainUnavailable)?;
        Ok(TimestampRecord {
            signer: signer_record,
            certificate_chain: chain,
            verify_as_of_filetime: filetime_to_u64(timestamp_signer.sftVerifyAsOf),
            provider_error: timestamp_signer.dwError,
        })
    }

    fn certificate_chain(
        signer: &CRYPT_PROVIDER_SGNR,
    ) -> Result<Vec<CertificateRecord>, NativeTrustError> {
        if signer.csCertChain == 0 || signer.pasCertChain.is_null() {
            return Err(NativeTrustError::CertificateChainUnavailable);
        }
        let count = usize::try_from(signer.csCertChain).expect("chain count fits usize");
        let records =
            unsafe { std::slice::from_raw_parts(signer.pasCertChain.cast_const(), count) };
        records.iter().map(certificate_record).collect()
    }

    fn certificate_record(
        provider_certificate: &CRYPT_PROVIDER_CERT,
    ) -> Result<CertificateRecord, NativeTrustError> {
        let context = unsafe { provider_certificate.pCert.as_ref() }
            .ok_or(NativeTrustError::CertificateContextUnavailable)?;
        let info = unsafe { context.pCertInfo.as_ref() }
            .ok_or(NativeTrustError::CertificateInfoUnavailable)?;
        Ok(CertificateRecord {
            subject: certificate_name(context, 0, "subject")?,
            issuer: certificate_name(context, CERT_NAME_ISSUER_FLAG, "issuer")?,
            sha256_thumbprint: certificate_thumbprint(context)?,
            not_before_filetime: filetime_to_u64(info.NotBefore),
            not_after_filetime: filetime_to_u64(info.NotAfter),
            provider_error: provider_certificate.dwError,
            trusted_root: provider_certificate.fTrustedRoot != 0,
            self_signed: provider_certificate.fSelfSigned != 0,
            test_certificate: provider_certificate.fTestCert != 0,
        })
    }

    fn certificate_name(
        context: &CERT_CONTEXT,
        flags: u32,
        kind: &'static str,
    ) -> Result<String, NativeTrustError> {
        let required = unsafe {
            CertGetNameStringW(
                context,
                CERT_NAME_SIMPLE_DISPLAY_TYPE,
                flags,
                null(),
                null_mut(),
                0,
            )
        };
        if required == 0 {
            return Err(last_windows_error("CertGetNameStringW(size)"));
        }
        if required <= 1 {
            return Err(NativeTrustError::CertificateNameUnavailable { kind });
        }
        let mut buffer = vec![0_u16; usize::try_from(required).expect("name length fits usize")];
        let written = unsafe {
            CertGetNameStringW(
                context,
                CERT_NAME_SIMPLE_DISPLAY_TYPE,
                flags,
                null(),
                buffer.as_mut_ptr(),
                required,
            )
        };
        if written == 0 {
            return Err(last_windows_error("CertGetNameStringW(value)"));
        }
        if written <= 1 {
            return Err(NativeTrustError::CertificateNameUnavailable { kind });
        }
        let len = usize::try_from(written - 1).expect("name length fits usize");
        String::from_utf16(&buffer[..len]).map_err(NativeTrustError::from)
    }

    fn certificate_thumbprint(context: &CERT_CONTEXT) -> Result<String, NativeTrustError> {
        let mut bytes = 0_u32;
        let sized = unsafe {
            CertGetCertificateContextProperty(
                context,
                CERT_SHA256_HASH_PROP_ID,
                null_mut(),
                &raw mut bytes,
            )
        };
        if sized == 0 {
            return Err(last_windows_error(
                "CertGetCertificateContextProperty(SHA256,size)",
            ));
        }
        let mut digest = vec![0_u8; usize::try_from(bytes).expect("hash length fits usize")];
        let read = unsafe {
            CertGetCertificateContextProperty(
                context,
                CERT_SHA256_HASH_PROP_ID,
                digest.as_mut_ptr().cast::<c_void>(),
                &raw mut bytes,
            )
        };
        if read == 0 {
            return Err(last_windows_error(
                "CertGetCertificateContextProperty(SHA256,value)",
            ));
        }
        digest.truncate(usize::try_from(bytes).expect("hash length fits usize"));
        Ok(hex::encode(digest))
    }

    const fn filetime_to_u64(value: FILETIME) -> u64 {
        ((value.dwHighDateTime as u64) << 32) | value.dwLowDateTime as u64
    }

    fn last_windows_error(operation: &'static str) -> NativeTrustError {
        NativeTrustError::WindowsApi {
            operation,
            source: std::io::Error::last_os_error(),
        }
    }
}
