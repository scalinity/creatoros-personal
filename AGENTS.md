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
