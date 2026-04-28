# docs/ARCHITECTURE.md

## System Overview

CreatorOS Personal is a server-first private web app. Browser UI is never trusted with provider secrets, service-role keys, X tokens, or publishing authority.

```text
Browser
  └─ Supabase session cookie + app requests
     └─ Next.js App Router
        ├─ Protected layouts/pages
        ├─ Server Actions for first-party mutations
        ├─ Route Handlers for OAuth, cron, publishing, extension, export
        └─ Server-only services
           ├─ auth/admin guard
           ├─ design-system UI registry
           ├─ AI provider abstraction
           ├─ X API client + capability flags
           ├─ publishing state machine
           ├─ import parsers
           ├─ scoring/analytics
           ├─ retrieval/embeddings
           ├─ rate limiter
           ├─ audit logger
           └─ encryption/token services
              └─ Supabase Postgres + RLS + pgvector
```

## Stack

| Layer | Choice | Implementation constraints |
|---|---|---|
| Framework | Next.js App Router | Route Handlers in `app/api/**/route.ts`; Server Components by default. |
| Language | TypeScript | Strict mode, no implicit any, typed API envelopes. |
| UI | React, Tailwind, attached design system, shadcn only where compatible | Do not use default shadcn radii, colors, shadows, or typography. Wrap/retokenize shadcn primitives. |
| Auth | Supabase Auth | Cookie session, private login, allowlist. |
| DB | Supabase Postgres | RLS on every exposed table. |
| Vector | Supabase pgvector | Filter by `user_id`; dimension tied to embedding model. |
| AI | Anthropic default, OpenAI optional | Server-only provider abstraction. Claude Opus 4.7 adaptive thinking max effort by default. |
| X | OAuth 2.0 + official X API v2 | Least privilege, scope escalation, capability flags, audit. |
| Jobs | Vercel Cron or equivalent | Verify cron secret, idempotent, lock concurrency. |
| Validation | Zod | Validate request input and AI output. |
| Tests | Vitest, Playwright | Mock AI/X for deterministic publishing tests. |

## Directory Architecture

```text
app/
  (auth)/login/page.tsx
  (app)/layout.tsx
  (app)/dashboard/page.tsx
  (app)/publishing/page.tsx
  (app)/calendar/page.tsx
  (app)/blogs/[id]/page.tsx
  api/**/route.ts
components/
  app-shell/
  design-system/
  dashboard/
  publishing/
  blogs/
  growth/
  ai/
lib/
  auth/
  db/
  security/
  audit/
  rate-limit/
  x/
  publishing/
  ai/
  scoring/
  analytics/
  imports/
  retrieval/
  jobs/
  exports/
supabase/
  migrations/
  seed/
design/
  tokens.json
  component-map.md
```

## Trust Boundaries

| Boundary | Rule |
|---|---|
| Browser to server | Browser sends intent, not authority. Server validates session/admin and current draft state. |
| Server to Supabase | Use anon client with RLS for user operations where possible; service role only for server-only admin jobs and migrations. |
| Server to X | Decrypt token only inside X service; never log token or send it to client. |
| Server to AI | AI sees redacted context packets, never secrets or token values. |
| Extension to app | Extension save token can create inspiration only. No read/update/delete/publish/AI. |
| Imported content to prompts | Treat as untrusted data. It cannot override system instructions. |

## Auth Architecture

1. `/login` authenticates through Supabase Auth.
2. Middleware protects app routes for authenticated session.
3. Protected app layout calls `requireAdmin()`.
4. Every Server Action and Route Handler calls `requireAdmin()` again.
5. `requireAdmin()` normalizes email and checks `ADMIN_EMAILS`.
6. Non-allowlisted users are denied and audited.
7. RLS policies enforce `auth.uid() = user_id`.

## Publishing Architecture

Publishing is a state machine, not a direct API call from a compose screen.

```text
content source
  -> publishing_drafts(status=draft)
  -> analyze / edit / attach media / assign campaign
  -> owner approval(status=approved)
  -> immediate publish OR scheduled_posts
  -> publishing_jobs(status=queued/running)
  -> X API write
  -> published_posts OR publishing_failures
  -> post_metric_snapshots
  -> audit_logs
```

Server rules:

- Only `approved` drafts can be scheduled.
- Immediate publish requires a one-time explicit confirmation transition to `approved` plus publish intent.
- AI can create drafts; AI cannot approve.
- Cron can publish only rows already approved and due.
- Retry can occur only if failure is retryable and draft remains approved.

## X Capability Flags

Store capability flags in `x_connections.capabilities` and app settings:

- `can_read_user_posts`
- `can_read_metrics`
- `can_read_private_metrics`
- `can_write_posts`
- `can_write_replies`
- `can_write_quotes`
- `can_upload_media`
- `can_delete_posts`
- `enterprise_quote_post_enabled`
- `enterprise_streams_enabled`
- `enterprise_analytics_enabled`

Do not infer a capability from “full access” alone; verify by granted scopes and a lightweight capability check where safe.

## AI Architecture

```text
UI request
  -> requireAdmin
  -> validate input
  -> rate-limit
  -> load context packet
  -> create ai_jobs row
  -> render prompt from registry
  -> provider.generateStructured / stream
  -> parse / repair / Zod validate
  -> persist prompt_runs
  -> persist domain artifact
  -> return sanitized response
```

Anthropic defaults:

- `model=claude-opus-4-7`
- `thinking={ type: "adaptive" }`
- `output_config={ effort: "max" }`
- `max_tokens=64000`

The docs require this shape because Anthropic documents adaptive thinking as the supported mode for Opus 4.7 and states manual `budget_tokens` is not accepted on that model.

## Design-System Architecture

Design is implemented as a tokenized component layer:

- CSS variables from `globals.css` become Tailwind theme tokens.
- Components are built as React primitives that preserve attached class anatomy: `Button`, `Input`, `Textarea`, `Select`, `Switch`, `Badge`, `Card`, `RuleHeader`, `Table`, `ScoreGauge`, `MetricBlock`, `PostRow`, `RewriteCard`, `ChatMessage`, `AppShell`, `Sidebar`, `TopBar`, `Inspector`, `CommandPalette`.
- Domain additions extend this language: `PublishingQueueRow`, `CalendarDayCell`, `BlogEditorFrame`, `CampaignCard`, `ExperimentLedger`, `ApprovalRail`, `RiskBanner`.

## Background Jobs

Jobs:

- Scheduled X sync.
- Scheduled approved publishing.
- Metric snapshot refresh.
- Embedding refresh.
- Voice profile refresh.
- Weekly growth review.
- Monthly strategy review.
- Blog export/repurposing jobs.

Requirements:

- Verify `CRON_SECRET`.
- Job locks by `user_id + job_type + schedule_window`.
- Idempotency keys for publishing jobs.
- No job may create unapproved external writes.
- Failed jobs write sanitized failure rows.

## Observability

- `audit_logs` for security and write actions.
- `sync_jobs` for sync/import jobs.
- `ai_jobs` and `prompt_runs` for AI.
- `publishing_jobs` and `publishing_failures` for X writes.
- Diagnostics route shows presence/missing config, last failures, rate-limit state, capability flags, and no secret values.

## Failure Modes

| Failure | Required behavior |
|---|---|
| Auth session expires | Redirect to `/login`; no data leak. |
| Non-admin login | Deny, audit, no app shell. |
| X token refresh fails | Mark connection degraded/revoked; preserve drafts/posts. |
| Publishing rate-limited | Leave job queued/deferred; show reset time; audit. |
| Publish succeeds but app times out | Reconcile by idempotency key or recent authored post lookup. |
| Thread partial failure | Mark partial, store published ids, require manual decision before retrying remaining posts. |
| AI invalid output | Repair once, validate, fail cleanly. |
| Extension token leak | Revoke token, rotate, audit; token cannot read or publish. |
| Design token drift | Visual regression fails; implementation must not hardcode colors/radii/type. |


## Explicit Non-Goals

Do not build:

- Public marketing pages, public onboarding, public signup, pricing, subscriptions, trials, memberships, Stripe, payment processors, customer billing, plan permissions, upgrade flows, support-ticket flows, team accounts, tenant administration, testimonials, or customer-facing growth funnels.
- Uncontrolled autonomous engagement: no mass replies, mass likes, mass DMs, mass follows, auto-engagement storms, bot-like loops, scraping private data, browser automation to bypass X APIs, or rate-limit bypasses.
- UI, metadata, package names, or copy that references the inspiration product or imitates another product's branding/copy/assets.
- Claims of official X algorithm access. All draft scoring and growth advice must be labeled heuristic unless directly supported by internal metrics.



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
