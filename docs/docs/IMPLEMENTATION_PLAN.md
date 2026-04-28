# docs/IMPLEMENTATION_PLAN.md

This is a sequencing plan for the full production project, not an MVP plan.

## Phase: Foundation

**Objective:** Initialize Next.js, TypeScript, Tailwind token bridge, repo layout, quality gates.

**Deliverables:** Project scaffold, strict TS, lint, test config, env schema.

**Files likely touched:** package files, app skeleton, lib/env, tests config.

**Dependencies:** none.

**Implementation order:** design data contracts, implement server boundary, build UI using design-system primitives, add tests, verify diagnostics.

**Acceptance criteria:** Build/typecheck pass; no public app routes beyond login.

**Risks:** scope creep, security bypasses, provider/API drift, design-token drift.

**Failure modes:** invalid config, RLS denial, mock/live provider mismatch, accidental client-side secret import, incomplete audit logging.

## Phase: Design-system implementation

**Objective:** Port attached design system into production components.

**Deliverables:** Tokens, globals, component primitives, shell, command palette, state components.

**Files likely touched:** components/design-system, app/globals.css, tailwind config, design docs.

**Dependencies:** Foundation.

**Implementation order:** design data contracts, implement server boundary, build UI using design-system primitives, add tests, verify diagnostics.

**Acceptance criteria:** Screens render dark/light without shadcn drift.

**Risks:** scope creep, security bypasses, provider/API drift, design-token drift.

**Failure modes:** invalid config, RLS denial, mock/live provider mismatch, accidental client-side secret import, incomplete audit logging.

## Phase: Data model/RLS

**Objective:** Create Supabase schema and policies.

**Deliverables:** Migrations for all tables, indexes, triggers, RLS, generated types.

**Files likely touched:** supabase/migrations, lib/db.

**Dependencies:** Foundation.

**Implementation order:** design data contracts, implement server boundary, build UI using design-system primitives, add tests, verify diagnostics.

**Acceptance criteria:** RLS tests pass and all required tables exist.

**Risks:** scope creep, security bypasses, provider/API drift, design-token drift.

**Failure modes:** invalid config, RLS denial, mock/live provider mismatch, accidental client-side secret import, incomplete audit logging.

## Phase: Private auth

**Objective:** Implement login, allowlist, protected layout.

**Deliverables:** Supabase SSR auth, requireAdmin, denial audit.

**Files likely touched:** app/(auth), app/(app)/layout, lib/auth.

**Dependencies:** Data model.

**Implementation order:** design data contracts, implement server boundary, build UI using design-system primitives, add tests, verify diagnostics.

**Acceptance criteria:** Owner enters; non-owner denied.

**Risks:** scope creep, security bypasses, provider/API drift, design-token drift.

**Failure modes:** invalid config, RLS denial, mock/live provider mismatch, accidental client-side secret import, incomplete audit logging.

## Phase: Manual import

**Objective:** Build fallback content ingestion.

**Deliverables:** Manual/CSV/JSON imports, metric edit, score recalculation.

**Files likely touched:** app/api/posts, lib/imports, lib/scoring.

**Dependencies:** Auth/Data.

**Implementation order:** design data contracts, implement server boundary, build UI using design-system primitives, add tests, verify diagnostics.

**Acceptance criteria:** Post history works without X.

**Risks:** scope creep, security bypasses, provider/API drift, design-token drift.

**Failure modes:** invalid config, RLS denial, mock/live provider mismatch, accidental client-side secret import, incomplete audit logging.

## Phase: AI foundation

**Objective:** Implement provider abstraction and prompt registry.

**Deliverables:** Anthropic default, OpenAI optional, mock provider, Zod schemas, prompt_runs, ai_jobs.

**Files likely touched:** lib/ai, app/api/ai.

**Dependencies:** Auth/Data.

**Implementation order:** design data contracts, implement server boundary, build UI using design-system primitives, add tests, verify diagnostics.

**Acceptance criteria:** Mocked and real provider diagnostics pass.

**Risks:** scope creep, security bypasses, provider/API drift, design-token drift.

**Failure modes:** invalid config, RLS denial, mock/live provider mismatch, accidental client-side secret import, incomplete audit logging.

## Phase: Composer

**Objective:** Build idea/draft/output workbench.

**Deliverables:** Ideas, generation modes, voice controls, output saving, source links.

**Files likely touched:** app/(app)/composer, components/composer.

**Dependencies:** AI foundation.

**Implementation order:** design data contracts, implement server boundary, build UI using design-system primitives, add tests, verify diagnostics.

**Acceptance criteria:** Owner can create drafts and hand off to publishing.

**Risks:** scope creep, security bypasses, provider/API drift, design-token drift.

**Failure modes:** invalid config, RLS denial, mock/live provider mismatch, accidental client-side secret import, incomplete audit logging.

## Phase: Publishing system

**Objective:** Build state machine before external writes.

**Deliverables:** publishing_drafts/jobs/scheduled/published/failures UI and routes, dry run, approval.

**Files likely touched:** lib/publishing, app/(app)/publishing, app/(app)/calendar.

**Dependencies:** Composer/Data.

**Implementation order:** design data contracts, implement server boundary, build UI using design-system primitives, add tests, verify diagnostics.

**Acceptance criteria:** No publish without approval; dry runs pass.

**Risks:** scope creep, security bypasses, provider/API drift, design-token drift.

**Failure modes:** invalid config, RLS denial, mock/live provider mismatch, accidental client-side secret import, incomplete audit logging.

## Phase: X OAuth and sync

**Objective:** Connect X and read history/metrics.

**Deliverables:** OAuth, encrypted tokens, refresh, sync, metrics, capability flags.

**Files likely touched:** lib/x, app/api/x, settings/x.

**Dependencies:** Security/Data.

**Implementation order:** design data contracts, implement server boundary, build UI using design-system primitives, add tests, verify diagnostics.

**Acceptance criteria:** Sync imports posts; disconnect clears tokens.

**Risks:** scope creep, security bypasses, provider/API drift, design-token drift.

**Failure modes:** invalid config, RLS denial, mock/live provider mismatch, accidental client-side secret import, incomplete audit logging.

## Phase: X write/publish system

**Objective:** Enable official X writes under publishing guardrails.

**Deliverables:** Create post/thread/reply/quote, media upload, delete own post, retries, reconciliation.

**Files likely touched:** lib/x/publish, app/api/x/publish.

**Dependencies:** Publishing + X OAuth.

**Implementation order:** design data contracts, implement server boundary, build UI using design-system primitives, add tests, verify diagnostics.

**Acceptance criteria:** Approved drafts publish and audit correctly.

**Risks:** scope creep, security bypasses, provider/API drift, design-token drift.

**Failure modes:** invalid config, RLS denial, mock/live provider mismatch, accidental client-side secret import, incomplete audit logging.

## Phase: Blog system

**Objective:** Build long-form editor and exports.

**Deliverables:** Blog CRUD, versions, AI writer/editor/SEO, exports, repurposing.

**Files likely touched:** app/(app)/blogs, lib/blogs.

**Dependencies:** AI/Data.

**Implementation order:** design data contracts, implement server boundary, build UI using design-system primitives, add tests, verify diagnostics.

**Acceptance criteria:** Blog drafts/export/repurpose work.

**Risks:** scope creep, security bypasses, provider/API drift, design-token drift.

**Failure modes:** invalid config, RLS denial, mock/live provider mismatch, accidental client-side secret import, incomplete audit logging.

## Phase: Analytics

**Objective:** Build deterministic analytics and score explanations.

**Deliverables:** Scoring, velocity, aggregates, cadence, charts/tables, post/blog/campaign metrics.

**Files likely touched:** lib/analytics, app/(app)/analytics.

**Dependencies:** Post history/publishing/blog.

**Implementation order:** design data contracts, implement server boundary, build UI using design-system primitives, add tests, verify diagnostics.

**Acceptance criteria:** Analytics explain calculations.

**Risks:** scope creep, security bypasses, provider/API drift, design-token drift.

**Failure modes:** invalid config, RLS denial, mock/live provider mismatch, accidental client-side secret import, incomplete audit logging.

## Phase: Coach/retrieval

**Objective:** Build internal evidence coach.

**Deliverables:** Embeddings, keyword fallback, citations, coach UI, playbooks.

**Files likely touched:** lib/retrieval, app/(app)/coach.

**Dependencies:** AI/Analytics.

**Implementation order:** design data contracts, implement server boundary, build UI using design-system primitives, add tests, verify diagnostics.

**Acceptance criteria:** Coach answers with citations.

**Risks:** scope creep, security bypasses, provider/API drift, design-token drift.

**Failure modes:** invalid config, RLS denial, mock/live provider mismatch, accidental client-side secret import, incomplete audit logging.

## Phase: Growth system

**Objective:** Build goals, pillars, campaigns, experiments, reviews, profile audits.

**Deliverables:** CRUD, dashboards, AI strategy/review prompts.

**Files likely touched:** app/(app)/campaigns, experiments, growth.

**Dependencies:** Analytics/Coach.

**Implementation order:** design data contracts, implement server boundary, build UI using design-system primitives, add tests, verify diagnostics.

**Acceptance criteria:** Campaigns and experiments track outcomes.

**Risks:** scope creep, security bypasses, provider/API drift, design-token drift.

**Failure modes:** invalid config, RLS denial, mock/live provider mismatch, accidental client-side secret import, incomplete audit logging.

## Phase: Chrome extension

**Objective:** Build scoped inspiration save path.

**Deliverables:** personal_save_tokens, endpoint, scaffold, token settings.

**Files likely touched:** app/api/inspiration/save, settings/tokens, extension.

**Dependencies:** Security/Inspiration.

**Implementation order:** design data contracts, implement server boundary, build UI using design-system primitives, add tests, verify diagnostics.

**Acceptance criteria:** Token can create inspiration only.

**Risks:** scope creep, security bypasses, provider/API drift, design-token drift.

**Failure modes:** invalid config, RLS denial, mock/live provider mismatch, accidental client-side secret import, incomplete audit logging.

## Phase: Hardening

**Objective:** Production safeguards.

**Deliverables:** Rate limits, diagnostics, exports/delete, error boundaries, observability.

**Files likely touched:** lib/rate-limit, diagnostics, data routes.

**Dependencies:** All prior.

**Implementation order:** design data contracts, implement server boundary, build UI using design-system primitives, add tests, verify diagnostics.

**Acceptance criteria:** Secrets hidden; operations audited.

**Risks:** scope creep, security bypasses, provider/API drift, design-token drift.

**Failure modes:** invalid config, RLS denial, mock/live provider mismatch, accidental client-side secret import, incomplete audit logging.

## Phase: Testing

**Objective:** Complete automated coverage.

**Deliverables:** Vitest, Playwright, RLS, mocked AI/X, design regression.

**Files likely touched:** tests/**.

**Dependencies:** All prior.

**Implementation order:** design data contracts, implement server boundary, build UI using design-system primitives, add tests, verify diagnostics.

**Acceptance criteria:** Core tests pass.

**Risks:** scope creep, security bypasses, provider/API drift, design-token drift.

**Failure modes:** invalid config, RLS denial, mock/live provider mismatch, accidental client-side secret import, incomplete audit logging.

## Phase: Deployment

**Objective:** Production deployment and validation.

**Deliverables:** Vercel env, Supabase, cron, OAuth callbacks, runbook.

**Files likely touched:** deployment config.

**Dependencies:** Testing.

**Implementation order:** design data contracts, implement server boundary, build UI using design-system primitives, add tests, verify diagnostics.

**Acceptance criteria:** Production smoke passes.

**Risks:** scope creep, security bypasses, provider/API drift, design-token drift.

**Failure modes:** invalid config, RLS denial, mock/live provider mismatch, accidental client-side secret import, incomplete audit logging.
