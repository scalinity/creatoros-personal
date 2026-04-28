# docs/DEPLOYMENT.md

## Deployment Target

- Vercel-compatible Next.js deployment.
- Supabase hosted Postgres/Auth/pgvector.
- Vercel Cron or equivalent for sync, publishing, reviews, snapshots.
- Production secrets configured in environment manager.

## Environment Variables

Required:

- `NEXT_PUBLIC_APP_URL`
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

Cron routes:

- `/api/cron/x-sync`
- `/api/cron/publish`
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
