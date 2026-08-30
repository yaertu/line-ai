#![cfg(windows)]

use std::{path::Path, time::Duration};

use wintrust_native::{NativeTrustError, inspect_authenticode};

#[test]
fn zero_budget_is_rejected_before_native_inspection() {
    let error = inspect_authenticode(Path::new("does-not-need-to-exist.exe"), Duration::ZERO)
        .expect_err("zero revocation budget must fail closed before native inspection");

    assert!(matches!(
        error,
        NativeTrustError::InvalidRevocationTimeoutBudget
    ));
}
