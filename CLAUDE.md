# AGENTS.md — CreatorOS Personal

This file is the operating contract for Codex and any other coding agent working in this repository.

CreatorOS Personal is a private, single-owner AI creator-growth operating system for X/Twitter publishing, long-form blog writing, analytics, experiments, and personal content intelligence. Build it as a production-grade private workstation, not a SaaS product, not a demo, and not a marketing site.

---

## 1. Source of Truth

Before writing or changing code, read the project documentation. The documentation package is authoritative.

Required docs and artifacts:

```text
README.md
design/tokens.json
design/component-map.md
docs/SPEC.md
docs/ARCHITECTURE.md
docs/DESIGN_SYSTEM_IMPLEMENTATION.md
docs/UX_SPEC.md
docs/DATA_MODEL.md
docs/API_CONTRACTS.md
docs/AI_SYSTEM.md
docs/AI_PROMPTS.md
docs/X_INTEGRATION.md
docs/PUBLISHING_SYSTEM.md
docs/BLOG_SYSTEM.md
docs/GROWTH_SYSTEM.md
docs/CHROME_EXTENSION.md
docs/SECURITY.md
docs/TEST_PLAN.md
docs/DEPLOYMENT.md
docs/IMPLEMENTATION_PLAN.md
docs/ACCEPTANCE_CRITERIA.md
docs/OPEN_QUESTIONS.md
docs/IMPLEMENTATION_NOTES.md
```

If the phased Codex prompt package is present, use it as the sequencing source:

```text
00_MASTER_EXECUTION_GUIDE.md
01_SPEC_INGESTION_AND_REPO_AUDIT.md
...
25_FINAL_PRODUCTION_REVIEW_AND_HANDOFF.md
PHASE_DEPENDENCY_MAP.md
```

Source-of-truth precedence:

1. This `AGENTS.md`
2. `docs/SECURITY.md`
3. `docs/PUBLISHING_SYSTEM.md`
4. `docs/X_INTEGRATION.md`
5. `docs/DATA_MODEL.md`
6. `docs/API_CONTRACTS.md`
7. `docs/ARCHITECTURE.md`
8. `docs/DESIGN_SYSTEM_IMPLEMENTATION.md`
9. `docs/UX_SPEC.md`
10. `docs/IMPLEMENTATION_PLAN.md`
11. Other docs
12. Existing code

When docs and existing code conflict, refactor existing code toward the docs unless the code represents a later, working, documented implementation. If you must deviate from the docs, record the reason in `docs/IMPLEMENTATION_STATUS.md`.

---

## 2. Product Identity

Build **CreatorOS Personal**.

It is:

- a private creator-growth cockpit
- a single-owner admin workspace
- an AI-assisted writing and publishing system
- a content intelligence layer over X posts, blogs, drafts, experiments, campaigns, and analytics
- a secure X publishing system with explicit approval and audit trails

It is not:

- a SaaS
- a consumer-facing app
- a public marketing site
- a CreatorBuddy clone
- a subscription product
- a team workspace
- a billing product
- an autonomous engagement bot

Never add:

- Stripe
- pricing pages
- subscriptions
- trials
- memberships
- public onboarding
- testimonials
- team accounts
- upgrade flows
- plan permissions
- public signup funnels
- customer billing portals
- support-ticket/customer-success flows

Do not use the name, branding, UI copy, assets, testimonials, metadata, or visual identity of any inspiration product.

---

## 3. Core Build Principle

Do not one-shot the full product.

Build methodically, phase by phase, with working checkpoints. Every phase should leave the repo in a coherent state with passing or clearly documented checks.

Always prefer:

- durable architecture over temporary hacks
- typed interfaces over loose objects
- server-side safety over browser convenience
- explicit approval flows over implicit publishing
- adapters/capability flags over fake third-party behavior
- clean partial implementation over broad broken scaffolding

Never fake production-critical behavior. If an integration cannot be completed without credentials, implement the interface, dry-run mode, validation, audit boundaries, and setup documentation.

---

## 4. Required Build Phases

Use one phase per substantial Codex run. Do not skip forward unless the previous phase gates are satisfied.

| Phase | Name | Purpose |
|---:|---|---|
| 01 | Spec Ingestion and Repo Audit | Read docs, inspect repo, produce implementation ledger. |
| 02 | Foundation and Tooling | Next.js/TS foundation, scripts, lint, tests, env validation. |
| 03 | Design System Tokens and Primitives | Implement design tokens and reusable UI primitives first. |
| 04 | Private App Shell, Routing, and Layout | Protected workstation layout and route skeletons. |
| 05 | Supabase Core Schema and RLS | Core migrations, indexes, triggers, RLS. |
| 06 | Publishing, Blog, Growth Schema and RLS | Remaining production schema. |
| 07 | Private Auth, Admin Gate, and Audit Foundation | Supabase auth, `ADMIN_EMAILS`, route/action guards, audit. |
| 08 | Settings, Diagnostics, Environment, and Security Utilities | Settings pages, diagnostics, secrets presence checks, security utilities. |
| 09 | Scoring, Manual Imports, and Post History | Manual ingestion, metric editing, scoring, archive. |
| 10 | Content Ideas, Generated Outputs, and Composer Base | Idea inbox, generated-output storage, composer base. |
| 11 | AI Foundation, Prompt Registry, and Structured Outputs | Server-only AI abstraction, providers, prompt runs, jobs. |
| 12 | Algorithm Analyzer and Brain Dump Transformer | First complete AI workflows. |
| 13 | Voice Modeling and Embeddings Foundation | Voice profile and retrieval substrate. |
| 14 | Blog System | Blog drafting, versions, exports, repurposing. |
| 15 | Publishing State Machine, Dry Run, and Calendar | Draft approval, scheduling, queue, dry-run jobs, audit. |
| 16 | X OAuth and Read Sync | OAuth, encrypted tokens, capability flags, sync, snapshots. |
| 17 | X Write Publishing Adapter | Live X publishing adapter with safe approvals and reconciliation. |
| 18 | Analytics Dashboard and Reports | Explainable analytics across content, cadence, campaigns. |
| 19 | Coach, Retrieval, and Content Playbooks | Evidence-citing AI coach over internal data. |
| 20 | Inspiration Library and Chrome Extension Save Token | Inspiration system, token auth, endpoint, extension scaffold. |
| 21 | Reply Guy and Account Researcher | Target accounts, account reports, reply drafts, publishing handoff. |
| 22 | Growth System, Campaigns, Experiments, Reviews | Goals, pillars, campaigns, experiments, weekly/monthly reviews. |
| 23 | Hardening, Export/Delete, Observability | Rate limits, export/delete, prompt-injection defense, diagnostics. |
| 24 | Testing, E2E, Deployment Readiness | Unit/integration/e2e tests, mocked AI/X, deployment docs. |
| 25 | Final Production Review and Handoff | Acceptance review, remaining limitations, handoff. |

At the end of each phase, in this exact order:

1. Update `docs/IMPLEMENTATION_STATUS.md` to mark the phase complete and record the gates that were met.
2. Run `/review-orchestrator` against the completed phase. Resolve any blocking findings before moving on; non-blocking findings get filed as notes in `docs/IMPLEMENTATION_STATUS.md` under "Known Limitations" or the relevant section.
3. Make exactly **one commit per phase** capturing the phase's full diff (code + docs + status update). The commit message must reference the phase number and name, e.g. `phase 07: private auth, admin gate, and audit foundation`. Bundle nothing from outside the phase scope into this commit — observations from other scopes get filed, not folded in.

Do not advance to the next phase until all three steps are done.

---

## 5. Per-Phase Stop Rule

At the end of every coding pass, stop and report:

1. What changed
2. What files were created or modified
3. What commands ran
4. What passed
5. What failed
6. What remains incomplete
7. Whether the current phase acceptance gates are met
8. The exact next phase prompt/file to run

Do not silently continue into the next major phase.

---

## 6. Repository Structure

Target structure:

```text
app/
  (auth)/login/page.tsx
  (app)/layout.tsx
  (app)/dashboard/page.tsx
  (app)/coach/page.tsx
  (app)/algo-analyzer/page.tsx
  (app)/composer/page.tsx
  (app)/brain-dump/page.tsx
  (app)/reply-guy/page.tsx
  (app)/account-research/page.tsx
  (app)/post-history/page.tsx
  (app)/inspiration/page.tsx
  (app)/publishing/page.tsx
  (app)/calendar/page.tsx
  (app)/campaigns/page.tsx
  (app)/blogs/page.tsx
  (app)/blogs/new/page.tsx
  (app)/blogs/[id]/page.tsx
  (app)/analytics/page.tsx
  (app)/experiments/page.tsx
  (app)/settings/page.tsx
  (app)/settings/x-connection/page.tsx
  (app)/settings/ai/page.tsx
  (app)/settings/data/page.tsx
  (app)/settings/tokens/page.tsx
  (app)/settings/diagnostics/page.tsx
  api/**/route.ts
components/
  app-shell/
  design-system/
  dashboard/
  publishing/
  blogs/
  growth/
  ai/
  posts/
  composer/
  inspiration/
  reply-guy/
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
  validation/
  env/
prompts/
supabase/
  migrations/
  seed/
design/
  tokens.json
  component-map.md
tests/
  unit/
  integration/
  e2e/
extension/
docs/
```

Do not scatter domain logic inside page components. Use server actions, route handlers, and `lib/**` services.

---

## 7. Stack Requirements

Use the documented stack unless existing repo constraints make that impossible:

- Next.js App Router
- TypeScript strict mode
- React
- Tailwind CSS
- shadcn/ui only where retokenized to the design system
- Supabase Postgres
- Supabase Auth
- Supabase RLS
- Supabase pgvector
- Anthropic default AI provider
- OpenAI optional AI provider
- X/Twitter OAuth 2.0 and official API v2
- Vercel-compatible deployment
- Vercel Cron or equivalent scheduled jobs
- Zod validation
- React Hook Form where useful
- TanStack Query or server actions where appropriate
- Vitest
- Playwright

---

## 8. Design-System Rules

The design system is not optional.

Read first:

```text
docs/DESIGN_SYSTEM_IMPLEMENTATION.md
docs/UX_SPEC.md
design/tokens.json
design/component-map.md
```

Design thesis:

> Editorial workshop, dark-first, warm ink-on-paper, hairline hierarchy, dense instrument-grade tables, folio headings, mono numerics, persistent paper grain.

Required visual rules:

- Dark mode is default.
- Light mode uses warm bone, never pure white.
- Use paper grain on all pages.
- Use hairline rules and borders for hierarchy.
- Use shadows only for dialogs, sheets, popovers, and command palette.
- Use Fraunces for display, Public Sans for UI/body, JetBrains Mono for numerics/IDs/timestamps.
- Use smallcaps via `font-variant-caps: all-small-caps`.
- Use radii `2px`, `4px`, `6px`.
- No pill buttons.
- Rounded-full only for avatars/status dots.
- Vermillion is the only loud accent.
- Moss/ochre/rust are semantic colors.
- No emoji.
- Prefer typographic glyphs: `§`, `¶`, `❦`, `※`, `✦`, `⌘K`, `☾`, `☀`.
- Every route starts with a `RuleHeader` and folio, for example `§ 07 — PUBLISHING QUEUE`.

Required primitives:

- `Button`
- `IconButton`
- `Field`
- `Textarea`
- `Select`
- `Checkbox`
- `Switch`
- `Badge`
- `Tooltip`
- `Dialog`
- `Sheet`
- `Tabs`
- `Toast`
- `RuleHeader`
- `Card`
- `KeyValueRow`
- `Table`
- `Pagination`
- `EmptyState`
- `LoadingSkeleton`
- `ErrorFallback`
- `ScoreGauge`
- `MetricBlock`
- `ConfidenceLabel`
- `PostRow`
- `RewriteCard`
- `ChatMessage`
- `ReplyDraftCard`
- `InspirationCard`
- `AssumptionFlag`
- `AppShell`
- `CommandPalette`

No generic shadcn defaults may leak into the finished UI. Retokenize shadcn primitives or build custom primitives.

---

## 9. Private Access Model

Only `/login` is public UI.

All app routes require:

1. Valid Supabase session
2. Email present in `ADMIN_EMAILS`
3. Server-side guard via `requireAdmin()` or equivalent
4. RLS-constrained data access

Every server action and route handler must check admin access again. Middleware alone is insufficient.

Non-admin users:

- denied access
- shown no app shell or private data
- audited through `audit_logs`

Keep `user_id` columns even though this is single-user. They are required for RLS, auditability, and future portability.

---

## 10. Environment Variables

Create and maintain `.env.example` with at least:

```text
NEXT_PUBLIC_APP_URL=
DATABASE_URL=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_EMAILS=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
AI_PROVIDER=anthropic
AI_MODEL=claude-opus-4-7
AI_THINKING_TYPE=adaptive
AI_EFFORT=max
AI_MAX_TOKENS=64000
AI_EMBEDDING_MODEL=
X_CLIENT_ID=
X_CLIENT_SECRET=
X_REDIRECT_URI=
X_DEFAULT_SCOPES=tweet.read users.read offline.access like.read bookmark.read follows.read list.read
X_PUBLISHING_SCOPES=tweet.write media.write
ENCRYPTION_KEY=
CRON_SECRET=
PERSONAL_SAVE_TOKEN_PEPPER=
```

Do not add Stripe or billing environment variables.

Diagnostics may show whether a secret is configured, but never show the value.

---

## 11. Database and RLS Rules

Implement Supabase migrations from `docs/DATA_MODEL.md`.

Required characteristics:

- RLS enabled on every exposed table
- `user_id` ownership checks
- indexes for common queries
- foreign keys
- unique constraints
- JSONB metadata fields
- `created_at` and `updated_at`
- soft-delete fields where specified
- pgvector support for embeddings
- updated-at triggers where useful

Required table groups:

Core:

```text
profiles
app_settings
x_connections
posts
post_metric_snapshots
content_ideas
generated_outputs
brain_dumps
saved_inspiration_posts
target_accounts
target_account_posts
reply_drafts
account_research_reports
content_coach_reports
algo_analysis_reports
voice_profiles
embeddings
ai_jobs
prompt_runs
sync_jobs
audit_logs
```

Publishing:

```text
publishing_drafts
publishing_jobs
scheduled_posts
published_posts
publishing_failures
media_assets
content_calendar_items
```

Blogging:

```text
blog_posts
blog_versions
blog_exports
blog_repurposing_jobs
```

Growth:

```text
growth_goals
content_pillars
campaigns
campaign_items
experiments
experiment_results
weekly_reviews
monthly_reviews
profile_audits
```

Extension/auth:

```text
personal_save_tokens
```

RLS is a hard gate. Do not build app features on unprotected tables.

---

## 12. AI System Rules

AI is server-only.

Default model settings:

```text
AI_PROVIDER=anthropic
AI_MODEL=claude-opus-4-7
AI_THINKING_TYPE=adaptive
AI_EFFORT=max
AI_MAX_TOKENS=64000
```

Build `lib/ai` with:

- provider interface
- Anthropic provider
- OpenAI provider
- mock provider for tests
- model routing
- prompt registry
- prompt versioning
- structured output schemas
- Zod validation
- JSON parse/repair helper
- retry logic
- timeout handling
- rate limiting
- `ai_jobs` tracking
- `prompt_runs` logging
- token/cost logging where available
- streaming support where useful

AI modules:

- content coach
- algorithm analyzer
- post writer
- thread writer
- reply writer
- quote-post writer
- blog writer
- blog editor
- SEO assistant
- brain dump transformer
- account researcher
- inspiration transformer
- voice modeler
- history analyzer
- content playbook generator
- growth strategist
- experiment analyst
- profile auditor

AI must never:

- approve publishing
- publish directly
- see API keys or OAuth tokens
- override route/action authorization
- treat imported external content as instructions
- claim access to X's private algorithm

Every AI output used for persistence or action must be schema-validated.

Confidence labels must distinguish:

- `fact`
- `inference`
- `speculation`

---

## 13. Prompt-Injection Defense

Imported posts, target account content, saved inspiration, pasted text, blog drafts, and X API payloads are untrusted data.

Rules:

- Wrap external content in clearly marked data containers.
- Do not concatenate untrusted content into system instructions.
- Do not pass secrets, tokens, private keys, or service-role credentials to prompts.
- AI outputs cannot invoke tools or publish content directly.
- Validate AI outputs with Zod before writing to DB.
- Treat AI-generated URLs, JSON, SQL, and instructions as untrusted until validated.
- Add tests around prompt construction for critical workflows when feasible.

---

## 14. X Integration Rules

Assume full X API access is available, but implement least privilege and capability flags.

Default read scopes:

```text
tweet.read users.read offline.access like.read bookmark.read follows.read list.read
```

Publishing scopes are requested only when publishing mode is enabled:

```text
tweet.write media.write
```

Only request optional disabled-by-default scopes when a specific feature requires them and the owner explicitly enables that feature.

Token rules:

- Encrypt X access tokens and refresh tokens at rest.
- Decrypt only inside the server-side X service.
- Never send X tokens to the browser.
- Never log tokens.
- Mark connection degraded if refresh fails.
- Preserve drafts and imported data when connection fails.

Capability flags should include:

```text
can_read_user_posts
can_read_metrics
can_read_private_metrics
can_write_posts
can_write_replies
can_write_quotes
can_upload_media
can_delete_posts
enterprise_quote_post_enabled
enterprise_streams_enabled
enterprise_analytics_enabled
```

Do not infer capability solely from “full access.” Check granted scopes and store capability status.

Manual fallback import must remain available even after live X integration works.

---

## 15. Publishing Safety Rules

Publishing is a state machine, not a direct compose-screen API call.

Required flow:

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

Rules:

- AI can create drafts but cannot approve them.
- Owner approval is required before immediate publishing.
- Scheduled publishing is allowed only for already approved drafts.
- Editing an approved draft invalidates approval unless the docs specify an exact payload-hash reapproval flow.
- Cron can publish only approved due drafts.
- Retry only if failure is retryable and draft remains approved.
- Every external write must be auditable.
- Preview exact X payload before approval/publish.
- Show exact X account being used.
- Show required scopes/capabilities.
- Run duplicate/similarity and policy/risk checks before approval.
- Use idempotency keys for jobs.
- Reconcile published posts with platform IDs and URLs.

Never implement:

- uncontrolled autonomous posting
- mass replies
- mass likes
- mass follows
- mass DMs
- reply storms
- spam workflows
- browser automation to bypass X APIs
- rate-limit bypassing

---

## 16. Blog System Rules

Blogs are first-class, not a nice-to-have.

Implement:

- blog ideas
- outlines
- long-form drafts
- editor
- versions
- SEO titles
- meta descriptions
- slugs
- tags/categories
- Markdown export
- HTML export
- JSON export
- MDX-ready export where specified
- blog-to-X threads
- blog-to-X post series
- X-to-blog expansion
- brain-dump-to-blog
- inspiration-to-blog with plagiarism guard
- account-research-to-blog

Blog status workflow:

```text
idea -> outlining -> drafting -> editing -> ready -> exported -> published_externally -> archived
```

---

## 17. Growth System Rules

The growth system is a real operating layer, not dashboard decoration.

Implement:

- growth goals
- content pillars
- account positioning
- audience hypotheses
- weekly strategy
- campaigns
- experiments
- experiment results
- weekly reviews
- monthly reviews
- profile audits
- target accounts
- engagement opportunities
- cadence tracking
- growth dashboard

Experiment types:

- hook
- topic
- format
- posting time
- CTA
- reply strategy
- blog repurposing

Experiment decisions:

```text
continue
stop
iterate
scale
```

---

## 18. Inspiration and Extension Rules

The inspiration system must transform structure, not copy expression.

Rules:

- Avoid plagiarism.
- Never preserve another creator's distinctive phrasing.
- Extract abstract patterns, not wording.
- Warn when generated output is too similar to the source.
- Store source post, notes, tags, and transformations.

Extension endpoint:

- In-app saves may use Supabase session auth.
- Extension saves must use `Authorization: Bearer <personal_save_token>`.
- Personal save token is scoped initially to `inspiration:create` only.
- Token must be hashed, peppered, shown once, revocable, rotatable, and rate-limited.
- Extension token cannot read, update, delete, publish, or trigger expensive AI endpoints.

---

## 19. API and Server Action Rules

Every route handler/server action must include:

- admin auth check unless explicitly public login/OAuth callback/extension token route
- input validation with Zod
- typed response envelope
- rate limit where relevant
- audit behavior for sensitive operations
- sanitized error handling
- no secret leakage

For API contracts, follow `docs/API_CONTRACTS.md`.

Required route/action categories:

- auth/session checks
- X OAuth start/callback
- X disconnect
- X scope escalation
- X manual sync
- X cron sync
- X publish post/thread/reply/quote
- publishing approval/schedule/retry/cancel
- post import/update
- idea CRUD
- generated output CRUD
- blog CRUD/export
- algo analysis
- brain dump generation
- coach chat
- account research
- reply generation
- inspiration save/transform
- voice profile generation
- embedding generation
- growth review
- experiment creation/result
- settings update
- diagnostics
- data export/delete
- personal save token create/revoke

---

## 20. Security Requirements

Security is production-critical because the app can publish to X and stores OAuth tokens.

Never expose to browser:

- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `X_CLIENT_SECRET`
- `ENCRYPTION_KEY`
- `CRON_SECRET`
- `PERSONAL_SAVE_TOKEN_PEPPER`
- X access tokens
- X refresh tokens

Required protections:

- Supabase Auth
- `ADMIN_EMAILS` allowlist
- RLS on all exposed tables
- encrypted X tokens
- hashed personal save tokens
- server-only AI provider calls
- server-only X API calls
- Zod validation
- rate limits
- cron secret verification
- audit logs
- data export/delete controls
- prompt-injection defenses
- no secret logging
- publishing approval logs
- idempotency for publishing jobs

Audit at minimum:

- login success/denied
- admin access denied
- X connect/disconnect/scope escalation/token refresh failure
- sync/import
- publishing approval/schedule/publish/retry/cancel/failure/delete
- AI job start/success/failure
- settings changes
- personal token create/revoke/use failure
- data export/delete

---

## 21. Testing Requirements

Add tests as the project becomes testable. Do not leave critical logic untested.

Required unit tests:

- scoring helpers
- import parsers
- AI JSON schema parsing
- auth guards where feasible
- publishing state transitions
- personal save token hashing/validation
- payload hash approval invalidation

Required Playwright smoke tests with mocked AI/X where needed:

- private access flow
- dashboard loads
- create idea
- manually import post
- view post history
- analyze draft with mocked AI
- save generated output
- create blog draft
- create publishing draft
- approve/schedule draft in dry-run mode
- extension save endpoint rejects missing/invalid token

Run appropriate checks at the end of each phase:

```bash
npm run typecheck
npm run lint
npm run test
npm run test:e2e
```

If the repo uses `pnpm`, `bun`, or `yarn`, use the matching scripts. Do not invent passing results. Report failures honestly and fix them when in scope.

---

## 22. Documentation Status Ledger

Maintain `docs/IMPLEMENTATION_STATUS.md` throughout the build.

It should include:

```text
# Implementation Status

## Current Phase

## Completed Phases

## Completed Features

## Partially Implemented Features

## Blocked / Requires Credentials

## Security Notes

## Tests and Checks

## Known Limitations

## Next Phase

## Recommended Next Prompt
```

Update this file at the end of every phase and after major repairs.

---

## 23. Coding Standards

TypeScript:

- strict mode
- no implicit `any`
- no broad `as any` unless isolated with a comment explaining why
- prefer discriminated unions for state machines
- prefer Zod-derived types for API inputs/outputs
- use typed DB helper functions
- keep server-only modules marked and isolated

React/Next:

- Server Components by default
- Client Components only when interactivity requires them
- keep data loading server-side when possible
- route handlers for external callbacks, cron, extension, export/download
- server actions for first-party mutations where appropriate

General:

- small focused modules
- no god files
- no hidden global mutable state for security-sensitive flows
- no dead buttons
- no placeholder features without visible status/TODO and docs entry
- no copied proprietary UI/copy/assets

---

## 24. Error Handling

Every meaningful operation needs explicit error behavior.

Examples:

- missing AI key: disable AI action, show diagnostics link
- missing X publishing scope: show scope escalation path, no hidden publish action
- X rate limit: show reset timestamp and preserve queued job
- token refresh failure: mark connection degraded, preserve drafts
- publish failure: write `publishing_failures`, show sanitized reason and retry eligibility
- AI schema failure: preserve prompt run, show structured failure, allow retry
- import parse failure: show row-level errors and allow partial import where safe
- extension invalid token: reject with no private data leakage

Do not swallow errors. Do not expose secrets in errors.

---

## 25. Data Export and Delete

Export:

- export owner data as JSON/CSV where specified
- never export decrypted tokens or secrets
- include enough metadata to restore analysis context

Delete:

- require exact confirmation
- audit before deletion
- delete token material first
- delete owner data in dependency-safe order
- never leave orphaned sensitive rows

---

## 26. Agent Behavior Rules

When starting a task:

1. Read this file.
2. Read `docs/IMPLEMENTATION_STATUS.md` if present.
3. Read the docs relevant to the requested phase.
4. Inspect existing code before editing.
5. State the phase and acceptance gates internally in your plan.
6. Make targeted changes.
7. Run appropriate checks.
8. Update `docs/IMPLEMENTATION_STATUS.md` to mark the phase complete.
9. Run `/review-orchestrator` against the completed phase and resolve any blocking findings.
10. Commit the phase as a single logical commit referencing the phase number and name.
11. Stop at the phase boundary.

When blocked:

- Do not guess third-party API behavior.
- Add capability flags and safe adapters.
- Document required credentials/configuration.
- Keep the app compiling where possible.
- Prefer dry-run implementations over unsafe live behavior.

When asked to continue:

- Continue from `docs/IMPLEMENTATION_STATUS.md`.
- Do not restart the project.
- Do not redesign completed architecture.
- Do not add forbidden SaaS features.

---

## 27. Final Acceptance Standard

The project is acceptable when:

- app is private and admin-only
- no SaaS billing or public marketing exists
- design system is implemented throughout
- owner can connect X
- owner can sync/import posts
- owner can manually import posts if API sync fails
- owner can analyze post history
- owner can generate a voice profile
- owner can create posts, threads, replies, quote posts
- owner can approve and publish to X
- owner can schedule approved posts
- owner can view queue/status/failures
- owner can write and export blogs
- owner can repurpose blogs into X content and X content into blogs
- owner can manage campaigns and experiments
- owner can use AI coach with internal evidence citations
- owner can research accounts
- owner can save inspiration from web app and extension endpoint
- owner can transform inspiration into original content
- owner can track performance after publishing
- every external write action is auditable
- tokens and secrets are secure
- RLS protects data
- AI and X APIs are server-side only
- typecheck, lint, and core tests pass

Production-oriented means secure, auditable, typed, testable, and faithful to the docs. Do not ship shallow mockups as completed features.

---

## 28. Codebase Implementation Invariants

These are non-obvious patterns enforced in the code that future agents must preserve. They go beyond the spec — they are the contract the existing implementation already meets.

### 28.1 Stack pin

- Next.js 16 App Router with `typedRoutes: true` and Server Components by default.
- TypeScript `strict` + `noUncheckedIndexedAccess: true` + `noImplicitOverride: true`.
- React 19, Zod v4, `@supabase/ssr` + `@supabase/supabase-js`.
- Package manager is **pnpm 10.33.2** (lockfile is `pnpm-lock.yaml`). Do not switch to npm/yarn/bun for installs.
- `proxy.ts` is the Next.js middleware (named `proxy`, not `middleware.ts`) and is wired to `updateSupabaseSession`.

### 28.2 Server-only and module discipline

- Every module that touches secrets, DB, or providers carries `import "server-only"` at the top.
- The runtime-agnostic exceptions are pure helpers: `lib/ai/json.ts`, `lib/auth/allowlist.ts`, `lib/auth/routes.ts`, `lib/audit/redaction.ts`. These are imported by client and server but contain no I/O.
- Server-only barrels: `@/lib/ai`, `@/lib/audit`, `@/lib/security`, `@/lib/db`, `@/lib/x`, `@/lib/auth/admin`, etc. Prefer barrels over deep paths.

### 28.3 Admin guard contract

- `requireAdmin()` for Server Components → redirects to `/login?error=*` on failure.
- `requireAdminForRoute(request)` for route handlers → returns `{ ok: true, admin }` or a sanitized `NextResponse` with envelope `{ ok: false, error: { code, message }, data: null, request_id }`.
- `getAdminContext({ auditDenied: true, request })` writes an `admin_access_denied` audit row for every denial, including pre-auth probes (user_id null for anonymous).
- `requireCronAuth(request, { route })` uses constant-time bearer comparison and a memory-backed cron-failure rate limiter (30/min). Loads the cron `AdminContext` via the service-role client and the first `ADMIN_EMAILS` profile.
- E2E bypass: `CREATOROS_E2E_AUTH_BYPASS=1` + matching `CREATOROS_E2E_AUTH_SECRET` (or header `x-creatoros-e2e-secret`) short-circuits the guard to a fixture `AdminContext`. Production must never set the bypass var.

### 28.4 Confirmation regex (load-bearing)

Live publishing, X publish, and X delete routes all share the same Zod refinement:

```ts
const confirmationPattern = /^(?:confirm|approve|delete)\b/;
```

Located in `lib/publishing/validation.ts`, `lib/x/validation.ts`, and asserted again at runtime in `assertLivePublishConfirmation` inside `lib/publishing/index.ts`. The value is trimmed and lowercased before matching. Prior substring matches accepted "we will never approve" — do not regress to substring or `includes`.

### 28.5 Publishing approval payload hash

- `computePublishingPayloadHash(draft, connection)` builds the canonical payload preview via `buildPublishingPayloadPreview` and SHA-256s a stable-sorted JSON serialization.
- Approval persists this hash; any subsequent draft edit nulls `approval_payload_hash`, flips `approval_status` to `invalidated`, and demotes status to `owner_edited`. Re-approval is required.
- Three-layer duplicate-publish protection (do not weaken any layer):
  1. CAS on `publishing_drafts.status` from `[approved|scheduled|failed]` → `publishing` before any external work.
  2. Deterministic retry idempotency keys (`liveIdempotencyKey` includes `priorFailedJobId`) so concurrent retries collide on `publishing_jobs.idempotency_key` unique index.
  3. Partial unique index `published_posts_publishing_draft_uidx` on `published_posts(publishing_draft_id) WHERE published_via='api' AND deleted_at IS NULL AND publishing_draft_id IS NOT NULL` (phase 26 / C-1).

### 28.6 Encryption and AAD versioning

- AES-256-GCM via `lib/security/encryption.ts`. Key derived as `SHA-256(ENCRYPTION_KEY)`. Rejects keys with `<16` distinct characters or entropy `<3.0 bits/char` (`assertEncryptionKeyStrength`).
- AAD format for X tokens: `x-${'access'|'refresh'}:${userId}:k1`. `tokenLegacyPurposes` returns prior shapes so pre-k1 rows still decrypt; refresh path re-encrypts under the current AAD on every successful refresh.
- Personal save tokens: `cos_live_${base64url(32 bytes)}` raw → stored as `pst_v1$<base64url(HMAC-SHA256(token, PERSONAL_SAVE_TOKEN_PEPPER))>`. Verification uses `timingSafeEqual`. The prefix index (`personal_save_tokens_prefix_idx`) allows lookup without exposing the raw token.
- IP audit hashing: if `AUDIT_IP_HASH_PEPPER` is set, IPs are HMAC-SHA256-hashed; otherwise plain SHA-256 (which is reversible for IPv4 — set the pepper in production).

### 28.7 Audit redaction patterns

- `redactAuditMetadata` walks objects (max depth 6) and redacts any key matching `/authorization|cookie|credential|encryption|key|oauth|password|pepper|secret|session|token/i` or `/email/i`.
- String values are scanned for tokens, JWTs, AWS keys, Anthropic keys, `pst_v1$...`, postgres/mysql/redis URLs, etc., and replaced with `[redacted]`.
- Strings over 500 chars are truncated with `[truncated]` suffix.
- Use `redactAuditMetadata` (not raw concatenation) for any new metadata field that may contain user-controlled or provider-returned text.

### 28.8 AI provider contract

- `runStructuredPrompt({ admin, input, jobType, promptId, provider? })` is the single entry point. It creates an `ai_jobs` row, calls the provider, records a `prompt_runs` row with redacted/truncated input+output and a SHA-256 `input_hash`, then completes the job. On schema-validation failure it persists `raw_sample` + `validation_issues` on the failed `prompt_run`.
- Three-pass JSON repair in `parseStructuredJson`: raw → common-syntax repair (smart quotes, trailing commas) → `balanceBraces` recovery for `max_tokens`-truncated output. Stops at first successful parse. Hard cap of 200KB input bytes for brace-balancing.
- `safeJsonReviver` drops `__proto__`, `constructor`, `prototype` keys to block prototype pollution.
- Anthropic: streams via SSE, maps `effort` (`low|medium|high|max`) to `thinking.budget_tokens` (skip thinking if `requestMaxTokens < THINKING_MIN_TOTAL_TOKENS = 2048`). `output_config` is NOT sent — Anthropic's Messages API rejects it; Zod is the sole structured-output enforcer for Anthropic.
- OpenAI: uses Responses API with `text.format` JSON schema mode + streaming.
- Mock provider: returns `mockOutput` from the prompt registry; used automatically when `AI_PROVIDER=mock` (E2E + tests).
- `validateAiStructuredOutput(value, schema)` is the consumer-side double-validate helper that converts Zod errors to `AiStructuredOutputError` with truncated `rawSample` — use this when re-parsing structured output downstream.

### 28.9 Prompt registry

22 prompts in `lib/ai/prompts/index.ts`, all `*.v1` ids. Shared system block enforces:
- No private X algorithm claims.
- No publishing/approval/scheduling from AI output.
- External content (imports, target accounts, inspiration, pasted text, X payloads) wrapped in `--- BEGIN_UNTRUSTED_DATA ... --- END_UNTRUSTED_DATA ---` boundary markers, with boundary tokens in user data scrubbed via `scrubBoundaryMarkers`.
- Task/objective/owner notes wrapped in `--- BEGIN_OWNER_REQUEST ... ---` containers so they cannot pose as system instructions.
- Confidence labels: `fact | inference | mixed | speculation` (the schema is the single source of truth).

### 28.10 Retrieval + embeddings

- `text-embedding-3-large` (3072 dims). Storage in `embeddings.embedding extensions.vector(3072)`. HNSW index uses `halfvec(3072) halfvec_cosine_ops` (pgvector ≥ 0.7 required; the phase 26 migration wraps creation in `DO ... EXCEPTION` so older databases skip with a notice).
- Refresh chunks at 64 docs/batch. Dimension mismatch on any chunk reverts to keyword-only retrieval mode and audits the cause.
- Retrieval: embedding-first (cosine similarity), falls back to keyword overlap on empty matches or provider failure. Mode (`embedding|keyword`) and reason (`embedding_provider_unavailable | no_embedding_matches | embedding_query_failed`) are returned in the result and shown in coach metadata.
- Coach citation sanitization: AI-returned `evidence` is filtered through `citationMap(context)` and only retained if the `(record_type, record_id)` pair appears in `context.allowedEvidence`. Removed-citation count is logged in `metadata.citation_filter`.

### 28.11 Voice profile activation ordering

`generateVoiceProfile` deactivates all current `voice_profiles` (records previous active ids), then inserts the new one with `is_active=true`. If insertion fails, the previous profiles are reactivated. Never invert this order — the partial unique index `voice_profiles_active_uidx WHERE is_active AND deleted_at IS NULL` will reject any state with two active profiles.

### 28.12 Inspiration plagiarism guard

- Six transform modes: `structure | hook_pattern | argument_pattern | original_version | counterpoint | voice_profile_version | x_post_drafts`.
- `assessSimilarityRisk(sourceText, candidates[])` computes Jaccard similarity on length-≥3 tokens and longest shared n-gram. Thresholds: Jaccard ≥ 0.45 or ≥8-token shared phrase → `high`; Jaccard ≥ 0.25 or ≥5-token → `medium`.
- Final risk = `max(AI-reported risk, deterministic similarity risk)` so the AI cannot under-report by claiming low when content overlap is high.
- `voice_profile_version` mode is the only transform that uses owner-trusted voice data as a style source.

### 28.13 Extension save endpoint (personal save token)

- Two-layer rate limiting: pre-verification 120/hr per token-bucket + 120/hr per IP-bucket, then post-verification token-specific limit (default 30/hr, owner-configurable up to 240). Both use HMAC-keyed bucket ids derived from `PERSONAL_SAVE_TOKEN_PEPPER` so the bucket id is not a brute-forceable plain hash.
- Token scope is `inspiration:create` only; column constraint `personal_save_tokens_inspiration_scope_only` enforces it at the DB.
- Audit events: `personal_save_token_use_failed` with structured `reason` (`missing_token | invalid_token | inactive_token | expired_token | missing_scope | validation_error | rate_limited | persistence_error`).

### 28.14 Database / RLS contract

- 43 `public.*` tables across two phase migrations. Every owner-data table has RLS enabled with `auth.uid() = user_id` policies for select/insert/update/delete; service-role bypasses for cron/oauth/inspiration extension.
- `x_connections` and `personal_save_tokens` are revoked from `authenticated` then re-granted **column-by-column** so the browser session role cannot SELECT `encrypted_*` token fields. This is enforced at GRANT level, not just RLS — do not run `GRANT SELECT ON public.x_connections TO authenticated`.
- `audit_logs` insert is service-role only (phase 26 / M-17); `lib/audit/logger.ts` uses the service-role client. Owner retains SELECT for in-app audit views.
- `post_metric_snapshots` insert (phase 16) requires the owner to also own the referenced `posts.id` — a join check in the RLS `WITH CHECK`.
- Append-only tables: `post_metric_snapshots`, `prompt_runs`, `audit_logs`. No UPDATE/DELETE policies are granted to authenticated.
- Soft delete: `deleted_at` timestamp on most owner tables; queries filter `is_null('deleted_at')` and the unique indexes are partial on that condition.

### 28.15 Atomic Postgres functions (service-role only)

- `creatoros_update_blog_with_version(...)` — single transaction blog update + version insert. The function does its own `auth.uid()` check (`security invoker`).
- `creatoros_delete_owner_data(p_user_id, p_delete_profile)` — `security definer`, deletes owner data in dependency order; clears token material first, then deletes rows. Returns row counts as JSONB.
- `creatoros_rate_limit_increment(...)` — `security definer`, atomic upsert+count for `rate_limit_buckets`. Falls back to in-process memory store on any DB error (`PostgresRateLimitStore`).
- `creatoros_x_oauth_states_cleanup(p_now)` and `creatoros_rate_limit_cleanup(p_now)` — periodic cleanup helpers, executed via cron route or operator.

### 28.16 Rate limit store

- `MemoryRateLimitStore` for tests + E2E.
- `PostgresRateLimitStore` is the default in production via `createDefaultRateLimitStore()` (lazy-imports `lib/db/service-role` so module imports don't require Supabase env in tests).
- Always fail open on infra blip — never fail closed. Logged via `console.error` with `reason`.
- Bucket IDs in `lib/rate-limit/index.ts:rateLimitIdFromRequest` are `${scope}:sha256(ip + ua).slice(0,32)`.

### 28.17 Publishing state machine notes

- Status flow: `draft|ai_generated|owner_edited|analyzed → approved → scheduled? → publishing → published|failed`. Terminal: `canceled | archived | failed`.
- `assertApprovalPayload(draft, suppliedHash, connection)` is the guard called before any external write. It checks `approval_status='approved'`, hash matches current draft (re-computed via `computePublishingPayloadHash`), and supplied hash (if any) matches stored.
- Thread partial failure: if N of M thread items succeed before an error, `XThreadPartialFailure` carries the `createdPosts[]` so reconciliation can still record the successfully published items and link them to a single `published_posts` row with `metadata.partial = true`.
- Deferred scheduled republish: rate-limited failures with `retryAfter` and `scheduledPostId` defer the `scheduled_posts` row to the new time instead of marking the draft failed. The cron tick will pick it up again.
- Scheduled executor uses `lock_token` + `locked_at` on `scheduled_posts` for inter-tick concurrency control. Two ticks claiming the same row collide via the conditional update.
- Default cancellation flips `approval_status` to `revoked` only if it was `approved` — preserves earlier `invalidated` state for audit.

### 28.18 X OAuth state

- `x_oauth_states` table (phase 26 / H-5): stores `state`, PKCE `code_verifier`, requested `scopes`, `mode`, `return_to`, `user_id`, bound to the initiating Supabase user. Service-role only access (RLS deny-all to authenticated). Single-use via atomic CAS on `consumed_at IS NULL AND expires_at >= now()`.
- `return_to` is allowlisted to `/settings/x-connection` only — any other value is silently rewritten back to the allowed default.
- Scope handling: token-endpoint-returned scope wins over the recorded scope set. The recorded scopes are the fallback, not the cookie/body.
- Refresh classification: `XOAuthRefreshError.kind = invalid_grant | transient | unknown`. `invalid_grant` → `markXConnectionRevoked` (force reconnect); transient → `markXConnectionDegraded` (recover automatically next attempt). Token-shaped substrings are scrubbed from any persisted `last_error` via `scrubXMessage`/`X_OAUTH_TOKEN_PATTERNS`.
- Disconnect attempts X `/oauth2/revoke` for both access and refresh tokens before wiping local material. Revoke success/failure is recorded in `audit_logs.metadata` as `revoke_access_ok` / `revoke_refresh_ok` per the new schema (not the legacy `token_material_deleted` flag).

### 28.19 Intentionally large files (M-14, M-15)

Per FINAL_CODEBASE_REVIEW deferral notes:

- `lib/publishing/index.ts` (~2500 lines) bundles types/adapters, payload-hash, state guard, idempotency, dry-run, live publish, retry/cancel, scheduled cron executor, workspace + calendar loaders. Section markers at the top of the file describe the planned split into `state-machine.ts | idempotency.ts | adapter.ts | executor.ts | workspace.ts`.
- `lib/growth/index.ts` (~1170 lines) bundles types, citations, goals/pillars/campaigns/experiments CRUD, weekly/monthly review generation, profile audits, workspace loaders. Section markers describe the planned split into `types.ts | citations.ts | entities.ts | reviews.ts | workspace.ts`.

Do not attempt the split as a side effect of unrelated work — it is "pure refactor, no behavior change" deferred.

### 28.20 Tests

- Unit: Vitest, `tests/unit/**/*.test.ts`, `environment: node`. Each phase has a phase-marker test file (e.g. `phase15-publishing-state-machine.test.ts`, `phase22-growth.test.ts`).
- E2E: Playwright, `tests/e2e/*.spec.ts`. Spawns its own `next dev --port 3100` with E2E bypass env vars and `AI_PROVIDER=mock`. Workers are forced to 1, no parallel.
- The mock AI provider is the test boundary — never call the real Anthropic/OpenAI endpoints from unit or E2E tests.

### 28.21 Naming and shape conventions

- DB rows are `snake_case`, in-memory app types are `camelCase`. `rowTo*` adapters (`rowToDraft`, `rowToBlog`, etc.) are the single point of conversion.
- API envelope shape: `{ ok: true, data, request_id }` or `{ ok: false, error: { code, message }, data: null, request_id }`. Code values are stable strings, not localized text.
- Metadata fields always include `phase: "XX-name"` markers via `metadataWithPhase()` so audit lineage survives data export and migrations.
- JSON columns are typed via the generated `Json` type (`@/types/database`). Use `toJson(value)` (round-trips through `JSON.stringify`) to convert structurally rather than `as unknown as Json` casts.

### 28.22 Status ledger updates after structural work

Whenever you complete a phase or address a review finding that lands in the codebase, update `docs/IMPLEMENTATION_STATUS.md` with:

- The phase/finding identifier (e.g. `C-1`, `H-3`, `phase 17`).
- The files touched.
- The audit/RLS/test consequences.
- The before/after invariant if behavior changed.

The ledger is the source of truth for "what is actually shipped" vs "what is documented in `docs/`."

