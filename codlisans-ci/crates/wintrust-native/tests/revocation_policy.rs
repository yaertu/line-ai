use wintrust_native::{RevocationPolicy, RevocationScope};

#[test]
fn production_policy_requires_online_whole_chain_revocation_excluding_root() {
    let policy = RevocationPolicy::production();

    assert_eq!(policy.scope(), RevocationScope::WholeChainExcludingRoot);
    assert!(policy.allows_network_retrieval());
    assert!(policy.fail_closed());
}
