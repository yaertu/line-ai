# Line AI Engine Implementation Plan

Goal: Ship a server-backed text/image API, real key/quota administration, desktop integration and a visible product site.

Architecture: Vercel functions authenticate Supabase-backed project keys; PostgreSQL serializes usage reservations and settlements. The desktop keeps its key in Windows Credential Manager. Admin uses server-validated Supabase Auth sessions. Inference runs on server-side providers, never the user's GPU.

Spec: ../specs/2026-09-12-line-ai-engine-design.md

## Execution and ownership

- [x] Root: additive SQL schema, atomic quota and replay protection, pure validation tests.
- [x] Root: authentication, administration, configured text/image adapters, private assets and feedback/evaluation APIs.
- [x] Desktop agent: native keyring + API transport, provider picker, settings, image studio, tests.
- [x] Root: responsive admin portal, API guide and premium public website.
- [x] Root: database concurrency/security tests, real provider smoke, browser interaction and native build.
- [ ] Root: commit, GitHub, deployment, updated desktop package and source archive after verification.

## Decisions

User explicitly authorized implementation and asked not to present more approvals. Proceed continuously within that authority.

Keep HTTP endpoints small; share request validation, authentication, inference and ledger logic in cloud/api/_lib. Consolidate CRUD admin operations in one authenticated endpoint with explicit action allowlist. No service credentials in browser bundles. API secrets appear only on creation, not list queries.

Synchronous provider operations return completed JSON; do not mislabel buffered results as real streaming or accepted jobs as finished. Duplicate idempotency keys never reissue provider work, and changing the body with a reused key returns conflict. Conservative input-byte plus maximum-output reservations bound token use. Image operations reserve separate image units. Upstream costs and user quota are different measures; report actual tokens and configured price estimates distinctly.

Feedback never modifies a live policy. Admin creates a candidate, runs fixed baseline and candidate evaluations on curated cases, and publishes only after passing thresholds. Each generation resolves the currently published policy. Existing conversation contents are not training data. No claim of training foundation weights.

Admin bootstrap is an operator-only local script, avoiding a publicly exposed bootstrap endpoint. Session cookies are HttpOnly/Secure/SameSite Strict; mutating browser requests enforce same origin. Role is verified server side on every request.

## Verification

Use Node-environment Vitest for schema/request/upstream and handler contracts. Exercise PostgreSQL reservation races, token revocation and idempotency against temporary test projects. Root frontend lint/typecheck/tests and Rust tests guard desktop compatibility. Production smoke verifies new API plus existing conversation history endpoints. Real model/image results are reported separately from mocked adapter tests.

Provider access or service limitations never produce fake success. Credentials stay in protected local/remote environment stores and are not printed. Site and delivery notes state any actual operational limitation.

## Live state, 2026-09-12

Text service is live on Gemini 2.5 Flash Lite. Policy 1.1.0 passed all six real regression cases (baseline also six) and was explicitly published as the release policy. Daily opt-in improvement automation is enabled; automatic publication requires strictly better results. Images remain blocked by provider credit; fixture-only storage verification is reported separately. Production site and existing history smoke passed, including all eight video tours.

## Final scope update

User requested removal of local inference and all Truth Mode switches, a complete chat UI/theme/icon refresh, and one desktop EXE/source ZIP. Removed the compatible local provider and settings, migrated old preferences to hosted Engine, applied graphite/mint branding, refreshed five source UI tours and current GIF/screenshots. Native automatic Engine response and feedback UI verified after bounded database-read recovery and native error normalization. React tests: 83 plus one native error regression; cloud tests: 17; Rust: 34 passed, 2 external opt-in cases ignored.
