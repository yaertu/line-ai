# Line AI Engine v0.6.0

Base URL: https://lineaicloud.vercel.app/api/v1

Line AI owns the gateway, project/key lifecycle, ledger, policies and management interface. Hosted Gemini handles text/code and the OpenAI image adapter handles images. No local inference is required. Images are currently disabled in production because the configured provider's credit is exhausted.

## API

Use `Authorization: Bearer <Engine key>`. History installation tokens are separate and cannot authorize Engine endpoints. Keys have text/images/feedback scopes and expiry. Mutating generation calls require a unique `Idempotency-Key` (12–96 alphanumeric, underscore or hyphen characters); reuse it only to recover the same operation.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /capabilities | Project limits, usage, model configuration and availability |
| POST | /generate | prompt, transcript, customInstructions, responseStyle, reasoning, truthMode |
| POST | /images/generations | prompt, aspectRatio (1:1/3:2/2:3), quality (low/medium/high), style |
| GET / DELETE | /images/:id | Job state / remove stored image |
| GET | /assets/:id | Project-authorized signed URL, valid for 600 seconds |
| GET | /requests/:id | Request status without prompt or response text |
| POST | /feedback | requestId, rating (up/down), note, trainingOptIn |

Generated text is JSON, not upstream streaming. Prompts are sent to the configured provider but not stored by Engine. Response replay is allowed for 24 hours; daily maintenance deletes expired replay bodies (physical retention can be up to 48 hours). Opt-in feedback notes are kept for up to 90 days. Images remain private until deleted; already issued signed links may remain valid for their short lifetime. Token counts come from provider usage metadata; missing metadata keeps a conservative reservation. Costs are USD list-price estimates, not a billing invoice; cache/free-tier discounts are not assumed.

Production text uses `gemini-2.5-flash-lite` (input $0.10 / output $0.40 per million tokens). `LINE_AI_TEXT_MODEL` supports `gemini-2.5-flash` and `gemini-2.5-flash-lite`; switching models also switches the configured cost rates.

## Operations

1. Install dependencies with `pnpm install`.
2. Supply Supabase service/database credentials in untracked `.env.local`.
3. Run `pnpm migrate`, `pnpm verify:database`, `pnpm test:engine:database`.
4. `scripts/configure-engine.mjs` loads existing operator provider credentials from the environment and sends them to Vercel over stdin. It retains a private local Engine pepper. Never rotate that pepper without a key/session migration.
5. `node --env-file=.env.local --env-file=.env.engine scripts/bootstrap-engine.mjs` creates the first operator and capped desktop/quality projects. The access file is outside the repo at `~/.lineai/engine-operator.json`; restrict its filesystem ACL.
6. Deploy the linked Vercel project and bind the canonical domain. Admin mutations require exactly `LINE_AI_ADMIN_ORIGIN`; sessions are Secure/HttpOnly/SameSite=Strict.

Environment: LINE_AI_ENGINE_ENABLED, LINE_AI_IMAGES_ENABLED, LINE_AI_TEXT_MODEL, LINE_AI_ENGINE_PEPPER, LINE_AI_GEMINI_KEY, LINE_AI_OPENAI_KEY, LINE_AI_ADMIN_ORIGIN, CRON_SECRET, plus existing Supabase variables. Image generation can be enabled after provider credit is restored by setting LINE_AI_IMAGES_ENABLED=true and redeploying.

Global roles: owner controls keys/projects/publication; operator can draft and evaluate policies using an existing project's limited budget; viewer can inspect. All roles are application administrators, not independent customer tenants. Policies and consented feedback improvements are global. The selected evaluation project is the billing account for tests, not a feedback tenant filter.

Maintenance runs daily at 09:00 UTC. It cleans expired response/session/feedback records, then proposes an improvement only for new opted-in feedback. Evaluation has six server-owned cases and a 15-second limit per provider call. Failed runs preserve the feedback watermark for the next daily attempt. Automatic publication requires a strict improvement with all cases passing; equal results remain reviewable. No model weights, application code or test cases rewrite themselves.

Database reads have a 12-second request limit and one bounded retry for transient gateway failures. Database writes are never retried automatically; ambiguous generation outcomes retain their reservations. Provider request limits remain effective and can temporarily reject calls even when a project has quota.

## Verification

`pnpm check`, `pnpm test`, `pnpm test:engine:database`. The live `scripts/smoke-engine.mjs` tests admin/CSRF/key lifecycle, actual text generation, token accounting and replay, cross-project denial, opt-in privacy, and private asset deletion. When provider image credit is unavailable it explicitly uses a stored screenshot fixture only for asset lifecycle checks and reports real generation as blocked.

Provider rate references: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [GPT Image 1](https://developers.openai.com/api/docs/models/gpt-image-1). Verify rates before changing models. Reservations include conservative prompt-byte and output caps; a timed-out request retains its reservation until reconciled.
