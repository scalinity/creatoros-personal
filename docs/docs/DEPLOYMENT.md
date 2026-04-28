# docs/DEPLOYMENT.md

## Deployment Target

- Vercel-compatible Next.js deployment.
- Supabase hosted Postgres/Auth/pgvector.
- Vercel Cron or equivalent for sync, publishing, reviews, snapshots.
- Production secrets configured in environment manager.

## Environment Variables

Required:

- `NEXT_PUBLIC_APP_URL`
- `CHROME_EXTENSION_ORIGINS`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAILS`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `AI_PROVIDER`
- `AI_MODEL`
- `AI_THINKING_TYPE`
- `AI_EFFORT`
- `AI_MAX_TOKENS`
- `AI_EMBEDDING_MODEL`
- `X_CLIENT_ID`
- `X_CLIENT_SECRET`
- `X_REDIRECT_URI`
- `X_DEFAULT_SCOPES`
- `X_PUBLISHING_SCOPES`
- `ENCRYPTION_KEY`
- `CRON_SECRET`
- `PERSONAL_SAVE_TOKEN_PEPPER`

Do not define Stripe/payment variables.

## Recommended Defaults

```text
AI_PROVIDER=anthropic
AI_MODEL=claude-opus-4-7
AI_THINKING_TYPE=adaptive
AI_EFFORT=max
AI_MAX_TOKENS=64000
X_DEFAULT_SCOPES=tweet.read users.read offline.access like.read bookmark.read follows.read list.read
X_PUBLISHING_SCOPES=tweet.write media.write
```

## Supabase Setup

- Create project.
- Configure Auth site URL and redirect URLs.
- Create/pre-authorize owner account.
- Apply migrations.
- Enable pgvector.
- Verify RLS.
- Generate types.

## X Developer Setup

- Configure OAuth 2.0 Authorization Code with PKCE.
- Set callback to `X_REDIRECT_URI`.
- Start with default read scopes.
- Enable publishing scope escalation separately.
- Configure capability flags after verifying access.

## Cron Setup

Implemented cron routes:

- `/api/cron/x-sync`
- `/api/cron/publish`

Planned cron routes that should not be configured until route handlers exist:

- `/api/cron/metric-snapshots`
- `/api/cron/weekly-review`
- `/api/cron/monthly-review`

Vercel sends `CRON_SECRET` as Authorization header when configured. Routes must verify `Bearer $CRON_SECRET`, use locks, and be idempotent.

## Observability

- Vercel logs for route failures.
- Supabase logs for database errors.
- App diagnostics page.
- Optional error monitoring adapter.
- Store sanitized errors in job/failure rows.

## Backup and Export

- Supabase backups according to plan.
- Manual JSON/CSV export from settings.
- Export blog artifacts separately.
- Before destructive migrations, export data.

## Production Validation

- Login as owner.
- Deny non-owner.
- Import posts.
- Generate AI draft with real provider or mock mode.
- Create/approve/schedule dry-run publishing draft.
- Connect X in read mode.
- Escalate publishing scopes only after review.
- Publish test post only with explicit confirmation.
- Export and delete test data in staging.

## Phase 24 Production-Readiness Runbook

Run these checks from the repository root before promoting a build:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

If the workstation does not have `pnpm` available, the verified fallback is:

```bash
npx pnpm@10.33.2 install --frozen-lockfile
npx pnpm@10.33.2 exec playwright install chromium
npx pnpm@10.33.2 typecheck
npx pnpm@10.33.2 lint
npx pnpm@10.33.2 test
npx pnpm@10.33.2 test:e2e
npx pnpm@10.33.2 build
```

The Playwright suite starts an isolated local server on `127.0.0.1:3100` by default. It sets `AI_PROVIDER=mock`, `AI_MODEL=mock-model`, `CHROME_EXTENSION_ORIGINS=chrome-extension://creatoros-e2e`, `CREATOROS_E2E_AUTH_BYPASS=1`, and a per-run `CREATOROS_E2E_AUTH_SECRET` for that server only. The bypass code also requires non-production runtime, no `VERCEL_ENV`, a loopback `NEXT_PUBLIC_APP_URL`, a loopback request host, and the per-run secret. Never set `CREATOROS_E2E_AUTH_BYPASS=1` in production, preview, or public staging deployments.

The Phase 24 smoke suite covers the user-prompted smoke baseline: private access, dashboard load, idea creation, post import, post history, mocked AI analysis, generated-output persistence, blog draft creation, publishing draft approval/schedule dry-run, and extension token rejection without live AI or X credentials. The broader `docs/TEST_PLAN.md` smoke list remains the target for staging/final acceptance expansion where live Supabase/RLS, additional workflows, and visual regression infrastructure are available.

## Production Release Checklist

- Confirm `.env.example` and the deployment environment include every required variable from this guide.
- Apply all Supabase migrations to the target project and regenerate types when schema changes are introduced.
- Verify RLS is enabled on exposed tables before pointing the app at production data.
- Confirm `ADMIN_EMAILS` contains only the owner email addresses.
- Confirm `NEXT_PUBLIC_APP_URL`, Supabase Auth site URL, and X OAuth callback URL all use the same deployed origin.
- Confirm AI and X provider keys are configured only as server-side environment variables.
- Run a staging dry-run publishing job before enabling live `tweet.write` publishing.
- Confirm cron routes receive `Authorization: Bearer $CRON_SECRET` and reject missing or invalid secrets.
- Review diagnostics for missing secrets, degraded X connection state, and disabled AI provider status after deploy.

## Local Smoke-Run Notes

- Unit tests use deterministic mocks and do not require live Supabase, AI, or X credentials.
- Playwright E2E uses an in-memory Supabase-like fixture for admin-only app flows.
- X adapter behavior is covered through mock clients and dry-run publishing; live external writes remain manually gated.
- Browser output artifacts are written to Playwright's default report directories and should not be committed.
- If port `3100` is occupied, run with `CREATOROS_E2E_PORT=<free-port> pnpm test:e2e`.


## Verified Official References

The implementation should verify against these official references during build because API details can change:

- Anthropic model overview: https://platform.claude.com/docs/en/about-claude/models/overview
- Anthropic adaptive thinking: https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking
- Anthropic Opus 4.7 migration guide: https://platform.claude.com/docs/en/about-claude/models/migration-guide
- Anthropic structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- X OAuth 2.0 Authorization Code with PKCE: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
- X create/edit post endpoint: https://docs.x.com/x-api/posts/create-post
- X delete post endpoint: https://docs.x.com/x-api/posts/delete-post
- X media introduction: https://docs.x.com/x-api/media/introduction
- X metrics: https://docs.x.com/x-api/fundamentals/metrics
- X fields and expansions: https://docs.x.com/x-api/fundamentals/fields
- X developer guidelines: https://docs.x.com/developer-guidelines
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase pgvector: https://supabase.com/docs/guides/database/extensions/pgvector
- Next.js Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Vercel Cron Jobs: https://vercel.com/docs/cron-jobs/manage-cron-jobs
