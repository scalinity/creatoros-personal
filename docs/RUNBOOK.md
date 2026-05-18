# CreatorOS Personal Runbook

Last updated: 2026-04-28
Phase: 25 - Final Production Review and Handoff

CreatorOS Personal is a private, single-owner workstation. Treat every deployment as security-sensitive because it can store OAuth tokens, call AI providers, and publish to X after explicit owner approval.

## Local Development

1. Install dependencies:

```bash
corepack enable
pnpm install --frozen-lockfile
```

If `pnpm` is not available in the shell, use the pinned fallback:

```bash
npx pnpm@10.33.2 install --frozen-lockfile
```

2. Create local env:

```bash
cp .env.example .env.local
```

3. Fill `.env.local` with local or staging values. Never commit `.env.local`.

4. Start the app:

```bash
pnpm dev
```

Fallback:

```bash
npx pnpm@10.33.2 dev
```

5. Open `http://localhost:3000/login` and sign in with an email present in `ADMIN_EMAILS`.

> **Note on layout:** the app shell is a fixed two-column desktop layout
> (sidebar + workspace) by design. CreatorOS Personal is scoped as a
> single-owner desktop cockpit; there is no mobile drawer. Open it on a
> desktop browser ≥ 1024px wide.

> **Note on Next.js 16 conventions:** the middleware file is named
> `proxy.ts` (not `middleware.ts`). This is intentional — Next.js 16
> renamed the convention. Any guide that refers to `middleware.ts` should
> be read as `proxy.ts` here.

## Verification Commands

Run before a release or handoff:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm exec playwright install chromium    # one-time per machine; skip if browsers already installed
pnpm test:e2e
pnpm build
```

> **Important:** `pnpm test:e2e` requires the Playwright browser binaries.
> On a fresh machine you must run `pnpm exec playwright install chromium`
> first; otherwise the e2e suite fails with
> `browserType.launch: Executable doesn't exist`. This is a Playwright-side
> dependency, not a project test bug.

Fallback verified in this environment:

```bash
npx pnpm@10.33.2 typecheck
npx pnpm@10.33.2 lint
npx pnpm@10.33.2 test
npx pnpm@10.33.2 exec playwright install chromium
npx pnpm@10.33.2 test:e2e
npx pnpm@10.33.2 build
```

Playwright uses a local fixture-backed smoke environment and does not require live Supabase, AI, or X credentials.

## Environment Configuration

Required groups:

- App: `NEXT_PUBLIC_APP_URL`, `CHROME_EXTENSION_ORIGINS`
- Supabase: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS`
- AI: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `AI_PROVIDER`, `AI_MODEL`, `AI_THINKING_TYPE`, `AI_EFFORT`, `AI_MAX_TOKENS`, `AI_EMBEDDING_MODEL`
- X OAuth: `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_REDIRECT_URI`, `X_DEFAULT_SCOPES`, `X_PUBLISHING_SCOPES`
- X capability flags: `X_ENTERPRISE_QUOTE_POST_ENABLED`, `X_ENTERPRISE_ANALYTICS_ENABLED`, `X_ENTERPRISE_STREAMS_ENABLED`
- Server secrets: `ENCRYPTION_KEY`, `CRON_SECRET`, `PERSONAL_SAVE_TOKEN_PEPPER`

Never expose these to the browser:

- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `X_CLIENT_SECRET`
- `ENCRYPTION_KEY`
- `CRON_SECRET`
- `PERSONAL_SAVE_TOKEN_PEPPER`
- X access or refresh tokens
- Personal save token raw values or hashes

Diagnostics may show present/missing status only.

## Supabase Setup and Migrations

1. Create a Supabase project.
2. Configure Auth site URL and redirect URLs to match `NEXT_PUBLIC_APP_URL`.
3. Create or invite the owner account.
4. Apply migrations in order from `supabase/migrations/`:

```text
20260428002018_core_schema_rls.sql
20260428004011_publishing_blog_growth_schema_rls.sql
20260428065428_phase16_metric_snapshot_post_ownership_rls.sql
20260428091400_phase14_blog_atomic_versioning.sql
20260428091700_phase17_publishing_job_idempotency.sql
20260428230000_phase23_owner_data_delete.sql
```

5. Confirm `pgcrypto` and `vector` extensions are enabled.
6. Confirm RLS is enabled on exposed tables.
7. Regenerate database types when schema changes are introduced.
8. Load the app as the owner and verify `/settings/diagnostics`.

Recommended staging RLS check:

- Seed an owner user and a non-owner user.
- Verify owner rows are visible only to the owner.
- Verify non-owner access to owner rows fails.
- Verify service-role usage remains server-only.

## Production Deployment

1. Use a Vercel-compatible Next.js deployment.
2. Configure production environment variables in the deployment environment, not in source control.
3. Ensure `NEXT_PUBLIC_APP_URL`, Supabase Auth site URL, and X OAuth callback origin match.
4. Apply all Supabase migrations before routing production traffic.
5. Run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

6. After deploy, sign in as the owner and open:

- `/settings/diagnostics`
- `/settings/x-connection`
- `/settings/ai`
- `/settings/data`

7. Confirm there are no missing required secrets and no degraded X connection unless expected.

Do not configure Stripe, pricing, billing, public signup, trials, teams, or customer support systems.

## Cron

Implemented cron routes:

- `GET /api/cron/x-sync`
- `GET /api/cron/publish`

Authorization:

```text
Authorization: Bearer $CRON_SECRET
```

Configure only implemented routes. Do not configure these planned routes until handlers exist:

- `/api/cron/metric-snapshots`
- `/api/cron/weekly-review`
- `/api/cron/monthly-review`

Operational notes:

- Cron routes rate-limit invalid secret attempts.
- Scheduled publish claims due scheduled rows before running.
- Publishing jobs must remain idempotent.
- Failed or degraded states should be inspected in `/settings/diagnostics` and `/publishing`.

## X OAuth and Publishing

Setup:

1. Configure X OAuth 2.0 Authorization Code with PKCE.
2. Set callback URL to `X_REDIRECT_URI`.
3. Start with read scopes:

```text
tweet.read users.read offline.access like.read bookmark.read follows.read list.read
```

4. Enable write scopes only when ready for publishing:

```text
tweet.write media.write
```

5. Set enterprise capability flags only after confirming access.

Validation order:

1. Connect X in read mode.
2. Run manual sync or cron sync in staging.
3. Confirm token storage is encrypted and diagnostics do not show token values.
4. Escalate publishing scopes intentionally.
5. Create a publishing draft.
6. Review exact payload preview and required scopes.
7. Approve the draft.
8. Run dry-run publishing.
9. Schedule the approved draft or perform one explicit live publish in a safe staging/disposable account.

Never use browser automation to bypass X APIs. Never run mass replies, mass likes, mass follows, mass DMs, or autonomous engagement loops.

## AI Configuration

Default:

```text
AI_PROVIDER=anthropic
AI_MODEL=claude-opus-4-7
AI_THINKING_TYPE=adaptive
AI_EFFORT=max
AI_MAX_TOKENS=64000
```

Operational rules:

- AI calls are server-only.
- Prompt runs are schema-validated before persistence.
- External content is wrapped as untrusted data.
- AI can draft, analyze, and recommend.
- AI cannot approve, schedule, publish, or override authorization.

If AI keys are missing:

- Manual workflows should remain usable.
- Diagnostics should show missing provider configuration without revealing values.
- Use `AI_PROVIDER=mock` only for local tests or controlled smoke runs, never to claim live provider readiness.

## Publishing Modes

Dry run:

- Requires an approved draft and current payload hash.
- Does not call X.
- Records deterministic job results and failures.
- Safe for local and staging checks.

Live:

- Requires owner/admin session or authorized cron context.
- Requires approved, non-stale payload hash.
- Requires required scopes and capability flags.
- Requires explicit live confirmation for immediate live routes.
- Writes audit events, jobs, published rows or failure rows, and reconciliation data.

Editing an approved draft invalidates approval and requires reapproval.

## Data Export and Delete

Export:

- Use `/settings/data`.
- Supports JSON and CSV.
- Redacts decrypted tokens, token hashes/prefixes, secrets, provider keys, auth headers, database URLs, JWT-like strings, and secret-like values.

Delete:

- Requires exact confirmation:

```text
DELETE_CREATOROS_PERSONAL_DATA
```

- Clears token material first.
- Runs owner-data deletion through the database RPC.
- Audits deletion behavior.

Always export before destructive staging or production delete tests.

## Extension Save Tokens

Token behavior:

- Raw token is shown once.
- Stored value is HMAC-hashed with `PERSONAL_SAVE_TOKEN_PEPPER`.
- Scope is limited to `inspiration:create`.
- Token can be revoked/rotated.
- Endpoint cannot read, update, delete, publish, or trigger expensive AI work.

Extension setup:

1. Configure `CHROME_EXTENSION_ORIGINS` with the extension origin.
2. Create a personal save token in `/settings/tokens`.
3. Store the raw token in the extension local configuration.
4. Test save against `/api/inspiration/save`.
5. Rotate/revoke token if exposed.

## Incident Response

### Suspected Secret Exposure

1. Remove the exposed value from the environment or source immediately.
2. Rotate the affected secret in the provider console.
3. Search logs and audit rows for accidental persistence.
4. Redeploy with the rotated value.
5. Document the incident in a private operational note, not in public source.

### X Token Refresh Failure

1. Open `/settings/x-connection`.
2. Confirm connection status and last sanitized error.
3. Reconnect X if refresh token is unavailable or revoked.
4. Preserve drafts, imports, and scheduled rows.
5. Retry publishing only when capability and approval checks are valid.

### Failed Publish

1. Open `/publishing`.
2. Inspect the failure row, retryable flag, and retry-after timestamp.
3. Confirm draft approval is still valid.
4. Retry only when the failure is marked retryable and the retry window is open.
5. If local reconciliation failed after an external write, reconcile platform IDs manually before retrying.

### Cron Failure

1. Confirm `CRON_SECRET` is configured in the deployment environment.
2. Confirm the scheduler sends `Authorization: Bearer $CRON_SECRET`.
3. Check deployment logs and `/settings/diagnostics`.
4. Avoid manually replaying publish cron unless due drafts and idempotency state are understood.

### AI Schema Failure

1. Inspect sanitized prompt-run status.
2. Confirm provider/model settings.
3. Retry with the same owner input only after confirming no prompt-injection issue.
4. Preserve failed prompt-run logs for debugging.

## Final Handoff

Phase 25 is complete. Next prompt to run: No next phase; final handoff complete.
