# Final Codebase Review — CreatorOS Personal

Reviewer: independent production-readiness audit
Reviewed at: 2026-04-28
Branch: `main`
Commit at review start: `b5c256b` (Phase 25 final production review and handoff)

This review is independent of the prior `docs/FINAL_REVIEW.md` self-assessment. Findings here are produced by direct inspection of code, migrations, configuration, and run-time checks. Severity ratings follow the model defined in the audit prompt: Critical, High, Medium, Low.

---

## Remediation Status (2026-04-28)

Every finding below has been addressed. Summary:

| Severity | Count | Status |
|---|---|---|
| Critical | 1 | C-1 fixed (deterministic retry idempotency + draft-status CAS + partial unique index on `published_posts(publishing_draft_id)`). Regression tests added at `tests/unit/x/phase17-x-publishing.test.ts`. |
| High | 9 | All fixed. See per-item details below. |
| Medium | 17 | All fixed except M-14 / M-15 (god-file split deferred per the original review's "pure refactor, no behavior change" recommendation; section markers added in lieu of physical split). |
| Low | 30 | All fixed except L-25 (orphan `_pending-route.tsx` deleted), L-30 (mobile constraint documented in code comment + RUNBOOK), and minor naming items handled in-place. |

Fixes are intentionally tagged in code with the audit ID (e.g. `// C-1:`, `// H-3:`) so the diff against `b5c256b` traces directly back to this report. The new migration is `supabase/migrations/20260428240000_phase26_review_hardening.sql`. The boot-time env validator is wired up in `instrumentation.ts`.

Verification after the remediation pass:

| Check | Result |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm test` | PASS — 165 tests (162 original + 3 added: 2 C-1 regression tests, 1 M-12 brace-balancing recovery) |
| `pnpm build` | PASS |
| `pnpm test:e2e` | PASS (after `pnpm exec playwright install chromium`; this prerequisite is now documented in RUNBOOK.md) |

---

## 1. Executive Summary

CreatorOS Personal is a substantial, well-architected, doc-faithful private creator-growth workstation. The product scope is correctly framed (no SaaS / billing / public marketing surfaces). All 25 documented build phases have been merged. Static checks pass. Architecture, bounded contexts, RLS posture, secret hygiene, prompt-injection wrapping, and the publishing state-machine are mostly correct.

**However, the prior "Phase 25 acceptance gates met" summary overstates production readiness in three load-bearing areas that I would not ship without fixing first:**

1. **Publishing duplicate-write window.** The retry path is not idempotent against concurrent retries. Two clicks of "Retry" on a failed publishing job, or a click during in-flight retry, will publish to X twice. This is the single most dangerous issue in the codebase given the product is a private X publishing console.
2. **Cron-secret comparison and X OAuth disconnect both have real gaps.** Plain `!==` on bearer tokens; disconnect doesn't call X's `/oauth2/revoke` while the audit log claims the token material is deleted; PKCE/state cookies aren't bound to the user session.
3. **Rate limiting and the env validator are fictional in production.** Limits live in process memory and reset on every cold start; the validated env schema (`lib/env/server.ts`) is not imported anywhere, so misconfiguration only fails on first call instead of at boot.

Best-implemented areas: Supabase migrations + RLS, the design-system tokens + warm ink-on-paper aesthetic, the AI provider abstraction with versioned prompt registry, the audit-log redaction layer, and the AES-256-GCM encryption of X tokens.

Worst-implemented areas: the publishing state-machine retry semantics (mostly the idempotency key generator), the OAuth/PKCE cookie-only state model, and a small set of design-system primitives that the spec requires but the implementation either inlines or omits (Checkbox, Tooltip, Dialog, Sheet, Tabs, Toast).

---

## 2. Readiness Rating

**Functional but not production-ready.**

Reasoning: The app compiles, lints, type-checks, runs, and exercises its happy paths through 162 unit tests + 8 Playwright smoke tests. The owner can plausibly use it locally with mock providers without harm. But the live X publishing surface is the *whole point* of the product, and that surface has an unfixed concurrency hole that can post duplicates to a real X account; in addition, the disconnect path leaves the X token usable upstream while pretending it's deleted. These are not theoretical defects — they are reachable from the existing UI with two clicks.

A staged path to production-ready:
- Fix the C-1 idempotency hole.
- Fix the H-1 cron secret compare.
- Fix the H-3 disconnect-doesn't-revoke.
- Replace the in-memory rate limiter with a durable store *or* commit to a single-instance deployment in deploy docs.
- Run a real Supabase RLS verification pass with two seeded users (already documented as a follow-up; should be a gate, not a follow-up).

After those, the app meets the bar to trust with a real X account, AI keys, OAuth tokens, and Supabase service credentials.

---

## 3. Checks Run

| Command | Result | Notes |
|---|---|---|
| `npx pnpm@10.33.2 typecheck` | PASS | Clean output. |
| `npx pnpm@10.33.2 lint` | PASS | Clean output. ESLint 9 + next/core-web-vitals + next/typescript. |
| `npx pnpm@10.33.2 test` | PASS | 34 files, 162 tests, 880 ms. |
| `npx pnpm@10.33.2 test:e2e` | PASS (after `playwright install chromium`) | 8 Chromium tests, 8.0 s. First attempt failed because Playwright browsers were not present — `RUNBOOK.md` should mention this prerequisite explicitly. |
| `npx pnpm@10.33.2 build` | PASS | Production Next 16 build completes; 62 routes; "Proxy (Middleware)" is reported (Next 16 renamed `middleware.ts` → `proxy.ts`). |
| `pnpm` global | NOT INSTALLED | `pnpm not found` in this shell. RUNBOOK already documents the `npx pnpm@10.33.2` fallback. |
| Forbidden product scan (`stripe|pricing|subscription|trial|membership|CreatorBuddy`) | PASS | No matches in `app/`, `components/`, `lib/`, `package.json`, `.env.example`. |
| Direct `useEffect` scan | PASS | Single use is the sanctioned wrapper at `components/app-shell/use-mount-effect.ts:8`. |
| `any` / `@ts-ignore` / `@ts-expect-error` scan | PASS | None found in source. ~20 `as unknown as Json` casts (acceptable). |
| Empty catch / silent-failure scan | PASS | None. |
| Browser-storage and unsafe-DOM scan | PASS | Zero hits in `app/` or `components/` for browser localStorage/sessionStorage, raw HTML injection sinks, or dynamic-code-eval primitives. |

---

## 4. Spec Compliance Matrix

Status: PASS, PARTIAL, FAIL, NOT VERIFIED. PARTIAL means the implementation exists but a defect or staging dependency keeps me from claiming production confidence.

### Private Access
| Criterion | Status | Evidence | Severity if gap |
|---|---|---|---|
| App is private and admin-only | PASS | `app/(app)/layout.tsx:8` calls `requireAdmin()`; non-admin email redirected to `/login?error=not_allowlisted`. | — |
| No public homepage/signup/marketing/pricing/billing/team/support | PASS | Forbidden-keyword scan clean; root `app/page.tsx:4` redirects to `/login`. | — |
| `/login` is minimal and private | PASS | `app/(auth)/login/page.tsx` is a plain login form, no marketing copy. | — |
| All protected routes require auth and allowlist | PASS | Layout-level `requireAdmin()` + `requireAdminForRoute(...)` in API routes. Server actions (16 of them) all start with `await requireAdmin()`. | — |
| Non-allowlisted access is denied and audited | PASS | `lib/auth/admin.ts:54-71` audits `admin_access_denied`. | — |

### Design System
| Criterion | Status | Evidence | Severity if gap |
|---|---|---|---|
| Attached design system implemented throughout | PARTIAL | `app/globals.css` (3.5k lines) implements the full token system; `tailwind.config.ts` bridges `tokens.json`. But `components/design-system/index.tsx` is missing several documented primitives (`Checkbox, Tooltip, Dialog, Sheet, Tabs, Toast, Pagination, LoadingSkeleton, ConfidenceLabel`). The CommandPalette is hand-rolled rather than reusing a `Dialog` primitive. | High |
| Dark-first warm ink-on-paper preserved | PASS | CSS variables + paper-grain SVG + Fraunces/Public Sans/JetBrains Mono. | — |
| Paper grain overlay exists | PASS | `body::before` SVG noise overlay. | — |
| No generic shadcn defaults leak | PASS | No `shadcn` package; no rounded-full buttons; no `bg-blue/red/yellow/purple` Tailwind defaults; no emoji. | — |
| Tokens used (no hardcoded colors/radii/type) | PASS | Tailwind theme is wired to `var(--…)` for color/radius/font/spacing. | — |
| Dense tables, gauges, headers, folios, smallcaps, mono numerics | PASS | `Table`, `ScoreGauge`, `MetricBlock`, `RuleHeader` all used in route surfaces. | — |

### X Read/Write
| Criterion | Status | Evidence | Severity if gap |
|---|---|---|---|
| Owner can connect X | PASS | OAuth start/callback with PKCE (verifier ≥ 43 chars). | — |
| Owner can sync/import posts | PASS | `lib/x/sync.ts` + manual import parser. | — |
| Manual import works if API sync fails | PASS | `lib/imports/index.ts` + `app/api/posts/import/route.ts`. | — |
| Owner can escalate publishing scopes intentionally | PASS | `/api/x/scope-escalation` audits + 3/h limiter. | — |
| Owner can create posts/threads/replies/quote posts | PASS | Composer + reply-guy + blog repurposing into publishing drafts. | — |
| Owner can approve and publish to X | PARTIAL | Approve + live-publish path exists, but the retry path is not concurrency-safe (see §5 C-1). | Critical |
| Owner can schedule approved posts | PASS | `scheduleApprovedDraft` requires approved + matching payload hash. | — |
| Queue/status/failure views work | PASS | Publishing workspace loads drafts/jobs/scheduled/failures. | — |
| Failed publishing jobs retryable only when safe | PARTIAL | `retryPublishingJob` checks `failure.retryable` and `retry_after`, but does not check `draft.status` and uses a randomized idempotency key, so two concurrent retries each succeed. | Critical |
| Every external write is audited | PASS | `x_publish_requested/succeeded/failed`, `publishing_*`, `x_post_deleted`. | — |

### AI and Content
| Criterion | Status | Evidence | Severity if gap |
|---|---|---|---|
| Owner can analyze post history | PASS | `algoAnalysisOutputSchema` with 9 metric scores + heuristic disclaimer. | — |
| Owner can generate voice profile | PASS | Sources strictly limited to owner posts (`is_owner_post=true`) + owner blogs. | — |
| Owner can create posts/threads/replies/quotes in learned voice | PASS | `voice_profile_version` packet wired into composer/coach/etc. | — |
| Algo Analyzer returns 9 heuristic scores + rewrites + readiness | PASS | Schema enforced. | — |
| Brain Dump generates posts/threads/blogs/scripts/campaigns/questions | PASS | `brainDumpOutputSchema` covers all six. | — |
| Coach answers with internal evidence citations | PASS | `sanitizeCitations` drops hallucinated record IDs; empty-evidence path forces `["speculation"]`. | — |

### Blogs
| Criterion | Status | Evidence | Severity if gap |
|---|---|---|---|
| Create/edit/version blogs | PASS | Atomic versioning via `creatoros_update_blog_with_version` RPC. | — |
| Generate ideas/outlines/drafts/SEO | PASS | Blog writer route + 4 prompt schemas. | — |
| Export Markdown/HTML/JSON/MDX | PASS | All four formats supported in `lib/blogs/index.ts`. | — |
| Repurpose blogs into X content | PASS | Goes through publishing draft approval flow, not direct publish. | — |
| Turn X content into blogs | PASS | `x_to_blog` prompt + workflow. | — |

### Growth
| Criterion | Status | Evidence | Severity if gap |
|---|---|---|---|
| Goals, pillars, campaigns, experiments | PASS | All entity types present with create/update/list. | — |
| Weekly and monthly AI reviews | PASS | Period-bounded context, citation sanitizer. | — |
| Experiment results track hypothesis/metrics/interpretation/decision | PASS | `experiment_results` schema matches. Confidence-label logic has a small classification looseness for non-AI results (Low). | Low |
| Profile audits generate actionable recommendations | PASS | `runProfileAudit` produces scores + findings + recommendations + pinned-post drafts. Citation sanitizer is not applied here (Low). | Low |

### Inspiration and Extension
| Criterion | Status | Evidence | Severity if gap |
|---|---|---|---|
| Save inspiration in app | PASS | `/api/inspiration/save` (in-app via session). | — |
| Extension endpoint saves with personal save token only | PARTIAL | Bearer-token path works; rate-limit hash uses unpeppered SHA-256 (see H-4). | High |
| Inspiration transforms into original content | PASS | Wraps source as `trusted: false`. | — |
| High plagiarism/similarity risk blocks ready/publish until reviewed | PASS | Stored on draft + checked in `assertApprovalGuardrails`. | — |

### Security
| Criterion | Status | Evidence | Severity if gap |
|---|---|---|---|
| X tokens encrypted | PASS | AES-256-GCM, random 12-byte IV, AAD per purpose. | — |
| Personal save tokens hashed | PASS | HMAC-SHA256 with peppered key + timing-safe verify. | — |
| AI/server keys never exposed to browser | PASS | `import "server-only"` on every secret-bearing module; no `NEXT_PUBLIC_*` leak. | — |
| RLS protects data | PASS (schema) / NOT VERIFIED (live) | All 42 required tables have RLS enabled, owner-scoped policies use the optimized `(select auth.uid())` form. Live RLS verification with two users was not run. | High to verify |
| Cron routes verify secret | PARTIAL | Verifies, but with non-timing-safe `!==` (see H-1). | High |
| Data export/delete works and excludes decrypted secrets | PASS | `lib/audit/redaction.ts` strips token/secret/key patterns; export API rate-limited and audited. | — |
| Prompt injection protections exist | PASS (with caveat) | Untrusted-data wrappers + boundary-marker scrubbing. The scrubber's `---` regex is narrower than the comment claims (Low). | Low |

### Testing
| Criterion | Status | Evidence | Severity if gap |
|---|---|---|---|
| Typecheck passes | PASS | — | — |
| Lint passes | PASS | — | — |
| Unit tests pass | PASS | 162/162. | — |
| Integration tests pass where feasible | PARTIAL | Service-shape unit tests pass against a fixture client; live Supabase/X/Anthropic integration not exercised. | Medium |
| Playwright smoke tests pass with mocked AI/X | PASS | 8/8 (after browser install). | — |
| Publishing dry-run + approval tests pass | PASS | Phase 15 + Phase 17 unit suites. | — |
| Design regression checks pass where implemented | PARTIAL | Functional smoke only; no visual regression suite. | Low |

---

## 5. Critical Issues (must-fix before live X publishing)

### C-1. Concurrent retries on a failed publishing job double-write to X

- **Severity:** Critical
- **Files:**
  - `lib/publishing/index.ts:1284-1287` (`liveIdempotencyKey`)
  - `lib/publishing/index.ts:1939-1980` (`retryPublishingJob`)
  - `lib/publishing/index.ts:1780-1899` (`runXPublishingJob` live branch)
  - `supabase/migrations/20260428004011_publishing_blog_growth_schema_rls.sql:528-529` (no unique constraint on `published_posts(publishing_draft_id)`)
- **Evidence quote:**
  ```ts
  function liveIdempotencyKey(draft, payloadHash, jobType, scheduledPostId) {
    const base = `${jobType}:${draft.id}:${payloadHash}:${hashString(...)}:${scheduledPostId ?? "immediate"}`;
    return jobType === "retry" || scheduledPostId ? `${base}:${randomUUID()}` : base;
  }
  ```
- **Impact:** The DB unique constraint on `publishing_jobs.idempotency_key` is the only application-level guard against double-publish. By appending `randomUUID()` for retries and scheduled runs, every retry produces a fresh key — the constraint stops nothing. There is no row-level lock on the draft, no `select … for update`, no compare-and-swap on `draft.status`, and `published_posts` has only a non-unique index on `publishing_draft_id`. Two clicks of "Retry" (or a manual retry while a cron tick is in flight) each pass `assertApprovalPayload`, each call `publishDraftToX`, each insert a new `published_posts` row, and X gets two posts. The downstream `(user_id, platform, platform_post_id)` unique index does not help because each X create returns a different post id.
- **Recommended fix:**
  1. Stop randomising the retry idempotency key. Use a deterministic key like `retry:${draft.id}:${payloadHash}:${prior_failed_job_id}`. Combined with the existing unique index, two concurrent retries off the same failed job will collide and one will roll back before any X call.
  2. Add a partial unique index on `published_posts(publishing_draft_id)` where `published_via = 'api'` so even if two retries somehow get past app-level checks, the second insert fails closed.
  3. Take a row lock on the draft (`for update`) at the top of `runXPublishingJob`, OR transition `draft.status -> 'publishing'` with a CAS check (`update where status in ('approved','failed') returning *`) and bail if zero rows updated.
- **Estimated effort:** ~1–2 hours including a regression test that calls retry twice in parallel against the dry-run fixture.

---

## 6. High Priority Issues

### H-1. Cron secret comparison is non-timing-safe
- **Files:** `app/api/cron/publish/route.ts:87`, `app/api/cron/x-sync/route.ts` (same shape).
- **Evidence:** `if (!expected || bearerToken(request) !== expected)` — plain `!==` short-circuits. The personal-save-token path uses `crypto.timingSafeEqual` correctly (`lib/security/personal-save-token.ts:41`); the cron route should match.
- **Impact:** Network-observable timing oracle on a secret that authorises X publishing batches.
- **Fix:** Compare with `crypto.timingSafeEqual` on equal-length buffers; fall back to fixed-time `false` if lengths differ. Mitigated today by `cronAuthLimiter`, not a substitute.

### H-2. `retryPublishingJob` doesn't validate `draft.status`
- **File:** `lib/publishing/index.ts:1939-1980`.
- **Evidence:** Only `job.status === "failed"` and `failure.retryable` are checked at the endpoint level. The downstream `runXPublishingJob` reloads the draft and calls `assertApprovalPayload`, but does not check `draft.status` (it can be `failed`, `approved`, or even `published` if a prior race already won).
- **Impact:** Combined with C-1, this is the second hole in the retry path. A stale-but-still-approved draft can publish again without an explicit retry-time owner reconfirmation.
- **Fix:** Reject retry if `draft.status` is not `"failed"`. Force the user to re-approve to publish again.

### H-3. `disconnectXConnection` zeroes local columns but never calls X `/oauth2/revoke`
- **File:** `lib/x/oauth.ts:440-483`.
- **Evidence:** The function nulls `encrypted_access_token` and `encrypted_refresh_token`, then writes audit metadata `token_material_deleted: true`. The X access/refresh token remains valid upstream until natural expiry.
- **Impact:** The audit log lies about token revocation. If the encrypted token store is ever exfiltrated *before* this disconnect (or a backup of it is restored), the tokens are still valid at X.
- **Fix:** Decrypt access + refresh tokens, `POST /2/oauth2/revoke` for each (`token_type_hint=access_token` then `refresh_token`), then null locally. Audit `revoked_at_provider: true|false` based on response.

### H-4. Extension rate-limit key uses unpeppered SHA-256 of the raw token
- **File:** `lib/inspiration/index.ts:622-635` (`hashLimitKey` + `tokenAttemptLimitKey`).
- **Evidence:** `createHash("sha256").update(value).digest("hex").slice(0, 32)` is fed the raw bearer token. The storage hash uses `hashPersonalSaveToken` (HMAC + pepper).
- **Impact:** Anyone with read access to in-memory rate-limit state, server logs, or memory dumps could mount an offline rainbow-table / bruteforce against the rate-limit key to recover token plaintext. The rate-limit hash is currently weaker than the storage hash.
- **Fix:** Reuse `hashPersonalSaveToken` (or a peppered HMAC) for the rate-limit key. Don't truncate to 32 hex chars.

### H-5. OAuth state and PKCE verifier are not bound to the user session
- **Files:** `app/api/x/oauth/start/route.ts:51-81`, `app/api/x/oauth/callback/route.ts:58-64`.
- **Evidence:** State and verifier are stored in plain (httpOnly, lax, secure-in-prod) cookies with no binding to the `guard.admin.userId` that started the flow. The callback validates state equality against the cookie but does not verify the callback's signed-in admin matches the start.
- **Impact:** While the app is single-admin, this still leaves a gap if the cookie is replayed in a different browser session. State is also not single-use server-side — clearing the cookie inside the response cannot stop a same-tick replay.
- **Fix:** Persist `(state, verifier, scopes, mode, userId, expires_at)` in a server-side store (a small Postgres table is enough) keyed by state. Delete the row after a successful exchange or expiry. Reject if the callback userId doesn't match.

### H-6. Rate limiter is in-memory only — limits reset per cold start, fail open across instances
- **Files:** `lib/rate-limit/index.ts:31-58`, `lib/ai/rate-limit.ts:21`, `lib/inspiration/index.ts:36`.
- **Evidence:** Every `createFixedWindowRateLimiter` call instantiates `new MemoryRateLimitStore()`. There is no Redis/Upstash/D1/Postgres backend.
- **Impact:** On Vercel / any multi-instance deployment, documented caps (e.g. account-research 20/24h, voice-profile 5/24h, extension 30/h, blog-export 30/h, cron-auth-failure 30/min) are bypassable by horizontal fan-out and routine cold starts. The auditor's previous review acknowledges this in `KNOWN_LIMITATIONS.md` but does not mark it as a deploy gate.
- **Fix:** Replace `MemoryRateLimitStore` with a durable backend (Postgres `rate_limits` table is enough for personal scale; Upstash is faster). Or commit to a single-instance deployment and document it as a hard constraint.

### H-7. `components/design-system/index.tsx` is missing primitives the spec requires
- **File:** `components/design-system/index.tsx` and the CSS in `app/globals.css`.
- **Missing:** `Checkbox`, `Tooltip`, `Dialog`, `Sheet`, `Tabs`, `Toast`, `Pagination`, `LoadingSkeleton`, `ConfidenceLabel`. (`PostRow`, `ChatMessage`, `ReplyDraftCard`, `InspirationCard` are inlined in feature directories rather than promoted to primitives.)
- **Evidence:** `grep -n "export function" components/design-system/index.tsx` lists only `Button, IconButton, Input, Textarea, Select, Switch, Badge, RuleHeader, Card, KeyValueRow, Table, MetricBlock, ScoreGauge, ErrorFallback, EmptyState, AssumptionFlag, RewriteCard`.
- **Impact:** Five raw native checkbox inputs across `components/posts`, `composer`, `account-research`, `growth`, `analyzer` instead of a primitive — labels are not always wrapped via `<label>`/`htmlFor`. CommandPalette is hand-rolled rather than reusing a shared `Dialog`. There is no toast layer (no `aria-live`); status is propagated via `?notice=` query strings, which is hostile to screen readers.
- **Fix:** Add the missing primitives now, even as thin wrappers, so the next feature added uses them. Convert raw checkboxes to `<Checkbox>`. Add a `<Toaster>` at the app shell.

### H-8. AI prompt-run failure path drops the raw provider response
- **File:** `lib/ai/run.ts:166-178`.
- **Evidence:** On failure, `recordPromptRun` is called with `output: {}` and no provider raw text. `usage` and `latencyMs` are also dropped.
- **Impact:** When the model returns malformed JSON that fails Zod, the failed `prompt_runs` row is essentially empty — there is no way to debug what the model actually produced. `KNOWN_LIMITATIONS.md` says "Preserve failed prompt-run logs for debugging" but the code does not.
- **Fix:** On the failure path, persist `output: { raw: providerText.slice(0, 8_000) }` and the `usage` fields when available. Continue to redact at the audit boundary.

### H-9. Anthropic provider sends `output_config` that the Anthropic Messages API doesn't accept
- **File:** `lib/ai/providers/anthropic.ts:99-115`.
- **Evidence:** Request body includes `output_config: { effort, format: { type: "json_schema", schema } }`. Anthropic's `/v1/messages` (`anthropic-version: 2023-06-01`) does not accept this — it is silently ignored. JSON-schema enforcement only works on OpenAI; Anthropic relies entirely on the textual prompt instruction + Zod parsing on our side.
- **Impact:** Soft enforcement masquerading as schema-enforced output. Higher schema-failure rate on Anthropic than the diagnostics imply (`structured_outputs: "zod_validated_with_one_repair_attempt"` at `lib/ai/diagnostics.ts:48` is misleading).
- **Fix:** Remove `output_config` from the Anthropic request, document the Zod-only enforcement in diagnostics, and translate `effort` to `thinking.budget_tokens` (the actual Anthropic knob).

---

## 7. Medium Priority Issues

| ID | File | Issue | Fix |
|---|---|---|---|
| M-1 | `app/api/cron/publish/route.ts:91-105` | No envelope audit event for publishing executor start/success/failure (per-draft events exist, batch envelope does not). | Audit `cron_publishing_started/succeeded/failed` with batch counts. |
| M-2 | `lib/publishing/index.ts:1779-1797` | `expectedContentTypes` route check skipped in dry-run. | Move check above the dry-run branch. |
| M-3 | `lib/env/server.ts`, `lib/env/client.ts` | Validated env modules are not imported anywhere (`grep` for the export names returns zero hits). Boot-time validation never runs; misconfiguration only fails on first use. | Import and invoke the parser on app boot (e.g. instrumentation hook). |
| M-4 | `app/api/x/oauth/start/route.ts:78` | PKCE verifier transported in a plain cookie without integrity binding. | Either sign the cookie or move state to a server-side ephemeral store. |
| M-5 | `app/api/x/oauth/callback/route.ts:64` | State not single-use. | Server-side store keyed by state; delete on first use. |
| M-6 | `lib/x/oauth.ts:312` | `tokenSet.scope ?? input.scopes` falls back to the requested-scopes cookie, which is attacker-controllable on the client side. | Treat missing `scope` from X as zero-scope; do not infer from the cookie. |
| M-7 | `lib/x/oauth.ts:286-291, 408-422` | Refresh failure does not differentiate `invalid_grant`/401 (revoked) vs transient 5xx (degraded). | Branch on status code; mark `revoked` on hard failures, `degraded` on transient. |
| M-8 | `lib/x/oauth.ts:97-99`, `lib/security/encryption.ts:31-33` | AAD includes only `userId`, not connection id or key version. | Include `connection.id` and a monotonic `key_version`. Implement key rotation. |
| M-9 | `lib/security/encryption.ts:16-21` | Encryption key strength check is `length >= 32`. A string of 32 identical letters passes. | Add Shannon-entropy check or require base64-encoded 32+ random bytes. |
| M-10 | Various `lib/*/index.ts` | Schema validation runs twice — once inside `parseStructuredJson`, once at the call site (`schema.parse(response.structured)`). The second `parse()` throws `ZodError` directly to the route handler instead of going through `runStructuredPrompt`'s logging. | Trust the inner validation, or surface the call-site failure as a structured `prompt_run` error. |
| M-11 | `lib/ai/retry.ts:62-85` | Retried attempts that consumed tokens are not logged in `prompt_runs`. Only the final attempt's usage is recorded. | Log per-attempt usage; aggregate for cost reporting. |
| M-12 | `lib/ai/json.ts:64-67` | JSON repair is one-pass `repairCommonJsonSyntax`. Truncated JSON (common when `max_tokens` is hit) is not handled. | Add brace-balancing recovery or a single retry with `repair=true` instruction. |
| M-13 | `app/api/inspiration/save/route.ts:99-125` | Origin allowlist only governs CORS response headers, not request rejection. Bearer requests with arbitrary origins succeed. | Reject non-extension origins outright if a Bearer token is supplied. |
| M-14 | `lib/publishing/index.ts` (entire file, 2343 lines) | God file. Validation, state machine, dry-run, X adapter, reconciliation, retry, audit, formatting all inlined. | Split into `state-machine.ts`, `adapter.ts`, `reconciliation.ts`, `failures.ts`. |
| M-15 | `lib/growth/index.ts` (1138 lines) | Concerns: goals, pillars, campaigns, experiments, reviews, audits. | Split per sub-domain. |
| M-16 | Embeddings | `embeddings.embedding` has no HNSW index; sequential scan fallback. Acceptable today, will degrade as content grows. | Add `using hnsw (embedding vector_cosine_ops)` when volume justifies. |
| M-17 | `audit_logs` | Owner has INSERT on the table from authenticated client. | Prefer service-role-only inserts; tighten policy if any client-side audit writes are happening. |

---

## 8. Low Priority Issues

| ID | File | Issue |
|---|---|---|
| L-1 | `app/api/cron/publish/route.ts:53-58` | Cron admin context casts a `ProfileRow` to `AdminContext` rather than going through `requireAdmin*`. RLS is bypassed via service-role correctly, but the cast is fragile. |
| L-2 | `app/api/publishing/_utils.ts:32-40` | `publishingErrorResponse` classifies by `error.message` substring matches (`"approved"`, `"payload hash"`, `"transition"`). Brittle under message rewording. |
| L-3 | `lib/auth/config.ts:1` | Reads `SUPABASE_SERVICE_ROLE_KEY` but does not declare `import "server-only"`. Currently safe by transitive use only. |
| L-4 | `lib/ai/providers/anthropic.ts:83-97` | `effort: "max"` is not part of the Anthropic Messages API. Dead config when Anthropic is selected. |
| L-5 | `lib/ai/providers/openai.ts:145` | `temperature: 0.2` hardcoded in adapter rather than centralized in `getAiRuntimeConfig`. |
| L-6 | `lib/ai/prompts/index.ts:97` | Boundary-marker scrubber regex only handles `---` form. Custom delimiters like `### END_UNTRUSTED_DATA ###` would not be scrubbed. Defense-in-depth only. |
| L-7 | `lib/coach/index.ts:204-232` | Voice profile is loaded as `operatingEvidence` (`trusted: false`) instead of as trusted owner-derived context. Functional impact small; conflicts with §12 spec wording. |
| L-8 | `lib/coach/index.ts:559` | Coach success audit only on `success: true` path. AI failures bubble up as exceptions logged via `console.error` only — no `audit_logs` row. |
| L-9 | `app/(app)/blogs/actions.ts:49-61`, `app/(app)/campaigns/actions.ts:73-83` | `let blogId: string;` / `campaignId` accessed after a possible-throw `try`. Runtime-safe (redirect throws), fragile under future TS strictness changes. |
| L-10 | `app/api/blogs/[id]/export/route.ts:54` | Export rate limiter shares a single bucket across formats. 30/h global cap is fine. |
| L-11 | `lib/growth/index.ts:791-793` | `recordExperimentResult` defaults `confidence_label: "mixed"` for non-AI runs without a decision. "speculation" is more accurate. |
| L-12 | `lib/growth/index.ts:1043` | `runProfileAudit` truncates `contextPackets.slice(0, 12)` and does not call `sanitizeCitations` (weekly/monthly do). AI may cite records outside the shown set. |
| L-13 | `supabase/migrations/20260428091700_phase17_publishing_job_idempotency.sql` | Per-user unique index on `idempotency_key` is redundant with the global unique at `core_schema_rls.sql:522`. Drop one. |
| L-14 | `supabase/migrations/20260428091400_phase14_blog_atomic_versioning.sql` | `blog_versions_post_version_uidx` duplicates `blog_versions_blog_post_id_version_number_key`. Drop one. |
| L-15 | `lib/x/oauth.ts:373-375` | Refresh fallback re-encrypts old refresh-token ciphertext rather than re-encrypting the plaintext. Minor (no functional change). |
| L-16 | `lib/x/sync.ts:415, 450, 457`, `lib/x/oauth.ts:425-431` | `safeError` truncates to 500 chars but does not strip token-shaped substrings. If X echoes a token fragment in an error body, it persists to `last_error` / `audit_logs`. |
| L-17 | `lib/x/sync.ts:317-329` | Concurrent syncs (manual + cron) can race on token refresh. No row lock. |
| L-18 | `lib/x/client.ts:150-159` | `parseRateLimitReset` only honors `x-rate-limit-reset`. X also returns `Retry-After` on some 429s. |
| L-19 | `lib/x/sync.ts:259-272` | `post_metric_snapshots` has no idempotency key; repeated syncs accumulate near-duplicate rows. |
| L-20 | `components/design-system/index.tsx` (`Switch`) | Native checkbox input is not given `role="switch"`/`aria-checked`. Screen reader announces as checkbox. |
| L-21 | `app/api/health/route.ts` | Returns raw diagnostics rather than the `{ ok, data, error, request_id }` envelope from API_CONTRACTS.md. |
| L-22 | Numerous `lib/*/index.ts` | ~20 occurrences of `as unknown as Json` to bridge to the generated Supabase `Json` type. Pragmatic; a `toJson<T>()` helper would document intent. |
| L-23 | `lib/analytics/index.ts:920` | Stale comment: `"Phase 19 will replace this placeholder with evidence-citing coach recommendations."` Phase 19 has shipped; verify and rip out the placeholder branch or update the reason string. |
| L-24 | `lib/posts/index.ts:139-140` | Naming: `detected_format_placeholder` / `detected_hook_type_placeholder` are real semantic flags ("auto-detected vs user-supplied") with confusing names. |
| L-25 | `app/(app)/_pending-route.tsx` | `PendingRoutePage` export is not referenced anywhere. Underscore-prefix excludes it from routing, so it's dead. Either wire to stub pages or delete. |
| L-26 | `lib/embeddings/index.ts:353` | Single `provider.embed(...)` call passes up to 250 docs (each up to 12k chars). No chunking, no retry/backoff. A single batch failure aborts the whole refresh and stores zero embeddings. |
| L-27 | `lib/retrieval/index.ts:126-130` | `embeddingModelForRows` falls back to `rows[0]?.embedding_model` if no row matches the configured model. Mixing two models silently drops vectors via the dimension filter. |
| L-28 | `lib/imports/index.ts:108-110` | `parseMetric` returns 0 for empty cells without a `null` flag, conflating "0 impressions" with "unknown impressions" downstream. |
| L-29 | `lib/brain-dumps/index.ts:46-87` | When stored JSON fails schema parse, the placeholder pack contains user-visible "regenerate" strings displayed as if they were AI output. UI should branch on a parse-failure flag. |
| L-30 | App Shell | No mobile drawer/collapse for the sidebar. Per-spec for a desktop workstation; flag if mobile use is intended. |

---

## 9. Security Review (consolidated)

### Strong
- AES-256-GCM token encryption with random per-call IV and AAD (`lib/security/encryption.ts`).
- HMAC-SHA256 + pepper + timing-safe verify on personal save tokens (`lib/security/personal-save-token.ts`).
- `import "server-only"` on every secret-bearing module (with the L-3 exception).
- Audit redaction layer with bounded recursion, key/value pattern stripping, and length truncation (`lib/audit/redaction.ts`).
- No browser-storage of secrets; no raw HTML injection sinks in any TSX file; no dynamic-code-evaluation primitives anywhere in `app/` or `components/`.
- `console.log` does not appear in source (only `console.error/warn`) and all error logs use `{ reason }` shapes — no token leaks.
- `NEXT_PUBLIC_*` is limited to `NEXT_PUBLIC_APP_URL`.

### Weak (referenced above)
- C-1, H-1, H-3, H-4, H-5, M-4..M-9, M-13, L-3, L-16, L-17.

### Two outright lies in the audit log
- `disconnectXConnection` writes `token_material_deleted: true` while leaving the token valid at X (H-3).
- `lib/ai/diagnostics.ts:48` advertises `"zod_validated_with_one_repair_attempt"` for structured outputs, but Anthropic's path is Zod-only and OpenAI's repair is one-pass with no truncation handling (H-9, M-12).

---

## 10. Publishing Safety Review

State-machine correctness:

| Transition | Implemented | Notes |
|---|---|---|
| `draft` → analyzed/edited | yes | Editing invalidates approval (`updatePayloadForDraft`). |
| `analyzed/draft` → `approved` | yes | `approvePublishingDraft` recomputes guardrails first. |
| `approved` → `scheduled` | yes | Requires `payloadHash` match. |
| `approved/scheduled` → `publishing` (live) | yes | `assertLivePublishConfirmation` requires "confirm" substring. |
| `publishing` → `published` | yes | `markDraftAndSchedule(draft, "published", …)`. |
| `publishing` → `failed` | yes | Writes failure row + scheduled-post status + calendar status. |
| `failed` → retry | partial | C-1 + H-2. |
| any → `canceled` | yes | Only from `queued`/`running`. |
| any → `archived` | yes | `archiveDraft`. |

Capability flags are correctly derived server-side from granted scopes (with the M-6 exception). Quote/thread/media all gated. Dry-run is the default; live requires explicit `confirm` substring (except retry/scheduled paths, which inherit prior approval — this is the design choice that creates H-2).

Audit events fire before AND after external writes for individual drafts. Cron-batch envelope events are missing (M-1).

---

## 11. Database / RLS Review

42 of 42 required tables exist. RLS enabled on every one. All policies use the optimized `(select auth.uid()) = user_id` form. No `USING (true)` policies. Owner-scoped SELECT/INSERT/UPDATE/DELETE on most tables; audit-style tables (`audit_logs`, `prompt_runs`, `post_metric_snapshots`, `publishing_failures`, `blog_versions`, `blog_exports`, `experiment_results`, `weekly_reviews`, `monthly_reviews`, `profile_audits`) are insert-only correctly.

`pgcrypto` and `vector` extensions referenced. `set_updated_at()` trigger applied broadly. Token columns (`encrypted_access_token`, `encrypted_refresh_token`, `personal_save_tokens.token_hash`) excluded from `authenticated` column grants — strong defense-in-depth.

RPCs:
- `creatoros_update_blog_with_version` (`security invoker`, asserts `auth.uid() = p_user_id`).
- `creatoros_delete_owner_data` (`security definer`, execute granted only to `service_role`).

Findings to track: M-16, M-17, L-13, L-14, plus the deferred live RLS verification (NOT VERIFIED in §4).

No critical DB issues. Do not ship without running the staging RLS verification (two-user pass) before going live.

---

## 12. AI / Prompt Safety Review

Provider abstraction is clean. All 22 prompts are `*.v1` versioned. External content is wrapped in untrusted-data containers across all eight inspected workflow consumers (algo-analyzer, brain-dumps, account-research, reply-guy, inspiration, coach, voice). Voice modeler correctly uses owner-only sources.

Defects: H-8, H-9, M-10, M-11, M-12, L-4, L-5, L-6, L-7, L-8.

The AI/publishing boundary is enforced: AI outputs cannot trigger X writes, are not given tools that call publishing APIs, and approval lives in a separate state machine that requires an explicit owner action.

---

## 13. X Integration Review

OAuth 2.0 with PKCE (verifier ≥ 43 chars). Tokens encrypted at rest. Capabilities derived server-side. Manual fallback import remains in place. Rate-limit headers parsed on syncs.

Defects: H-3 (no revoke on disconnect), H-5 (state/PKCE not bound to session), M-4..M-7, M-8 (AAD), L-15..L-19.

---

## 14. UI / Design-System Review

Strong: tokens fully wired; warm ink-on-paper preserved; paper grain via `body::before`; folio + smallcaps typography correct; vermillion accent reserved; no rounded-full buttons; no shadcn defaults.

Weak (H-7 + L-20, L-21, L-30): missing primitives, `Switch` doesn't announce as switch, no toast layer, no mobile drawer, `/api/health` doesn't follow the API envelope contract.

---

## 15. Testing Review

| Area | Coverage |
|---|---|
| Auth allowlist | unit (`tests/unit/auth/allowlist.test.ts`) |
| Encryption | unit |
| Personal save token | unit |
| Imports / scoring | unit |
| Posts / composer / settings UI | unit (component tests) |
| Db schema shape | unit |
| AI providers / prompts / json / run / schemas / run-logging | unit (6 files) |
| Phase 12 AI workflows (account research, algo analyzer, brain dump, etc.) | unit |
| Phase 13 voice + retrieval | unit (2 files) |
| Phase 14 blog system | unit |
| Phase 15 publishing state machine | unit |
| Phase 16 X OAuth + sync | unit |
| Phase 17 X publishing | unit |
| Phase 18 analytics | unit |
| Phase 19 coach | unit |
| Phase 20 inspiration + extension route | unit (2 files) |
| Phase 21 reply guy + account research | unit |
| Phase 22 growth | unit |
| Phase 23 data export/delete | unit |
| Diagnostics | unit |
| Rate-limit | unit |
| Login + Phase 24 smoke flows | Playwright (8 tests) |

Gaps:
- No live Supabase RLS integration test (would require seeding two users in a disposable Supabase).
- No live Anthropic/OpenAI integration test.
- No live X OAuth/read/write integration test.
- No regression test for the C-1 concurrent-retry race.
- No retry-doubles test that asserts deterministic idempotency keys.
- No visual regression suite (acknowledged in `KNOWN_LIMITATIONS.md`).
- No test that asserts `disconnectXConnection` revokes upstream — a fixture mock for `/oauth2/revoke` would suffice once H-3 is fixed.

162 unit tests + 8 Playwright tests is a strong baseline; coverage is broad but shallow at the integration layer.

---

## 16. Deployment Review

`.env.example` covers all required keys per AGENTS section 10. `RUNBOOK.md` is comprehensive and includes the migrations list, cron auth shape, OAuth/X validation order, AI defaults, dry-run vs live publishing contract, data export/delete, extension setup, and incident-response sections.

Gaps:
- M-3 (env validator never runs at boot).
- H-6 (rate limits assume single instance — not in deploy gates).
- RUNBOOK does not mention `playwright install` as a prerequisite for `pnpm test:e2e`. Add this; otherwise the e2e suite fails on a fresh machine and the failure is misattributable to test code.
- No `instrumentation.ts` for boot-time health checks — recommend a minimal one that calls `parseServerEnv` and warns on missing optional keys.
- `proxy.ts` is correct for Next 16 (the build output confirms "Proxy (Middleware)"). Worth a one-line note in RUNBOOK that this is intentional, since `middleware.ts` is the more familiar name and a reader might assume it's misnamed.

---

## 17. Recommended Fix Order

Do these in order. Stop after step 5 if you only want to ship; the rest are hygiene.

1. **C-1 idempotency hole** — deterministic retry idempotency key + partial unique index on `published_posts(publishing_draft_id) where published_via='api'` + draft-status CAS in `runXPublishingJob`.
2. **H-1 cron timing-safe compare** — replace `!==` with `timingSafeEqual` in both cron routes.
3. **H-3 disconnect revokes upstream** — call X `/oauth2/revoke` with access + refresh tokens before nulling locally; record success/failure in the audit metadata.
4. **H-2 retry endpoint validates `draft.status`** — reject if not `"failed"`.
5. **H-4 peppered HMAC for extension rate-limit key** — reuse `hashPersonalSaveToken`.
6. H-5 OAuth state/PKCE → server-side ephemeral store bound to `userId`.
7. H-6 durable rate-limit store (or pin to single instance + document).
8. H-7 design-system primitives (`Checkbox`, `Tooltip`, `Dialog`, `Sheet`, `Tabs`, `Toast`).
9. H-8 + H-9 + M-10..M-12 AI runtime hardening.
10. M-3 env-validator wired to boot.
11. M-1 cron-batch envelope audit.
12. M-2 expectedContentTypes pre-dry-run.
13. M-6 capability inference no longer trusts requested-scopes cookie.
14. M-7 refresh failure differentiation (`invalid_grant` vs transient).
15. M-8 + M-9 AAD/key-rotation + entropy check on `ENCRYPTION_KEY`.
16. M-13 reject non-extension origins on Bearer requests.
17. M-14 + M-15 split `lib/publishing/index.ts` and `lib/growth/index.ts`.
18. Run staging RLS verification with two seeded users.
19. Run live-provider validation (Anthropic, X read, X write to a disposable account, extension save).
20. Sweep low-priority items.

---

## 18. Do Not Ship Until Fixed

| ID | Why it blocks ship |
|---|---|
| C-1 | Concurrent retries publish duplicates to X. The product premise breaks. |
| H-1 | Cron secret recoverable by timing oracle; cron auth gates a secret with X publishing power. |
| H-3 | Disconnect lies about token revocation. |
| H-2 | Combined with C-1, retry path can post without retry-time owner reconfirmation. |
| H-4 | Personal save token plaintext recoverable from rate-limit state. |
| Live RLS verification (NOT VERIFIED) | Not fixing this is gambling on RLS policies that have only been read by me, not by Postgres. |

After those, the remaining High items (H-5, H-6, H-7, H-8, H-9) can land in the first hardening sprint after first ship, but should be on the roadmap before a second X account is connected.

---

## 19. Safe To Defer

- All Low-severity items in §8 (L-1..L-30). Schedule in a hygiene sprint.
- M-14 / M-15 (god-file splits) — pure refactor, no behavior change.
- M-16 (HNSW index) — add when embedding count grows beyond a few thousand.
- Visual regression suite, mobile drawer, full primitives polish.

---

## 20. Final Handoff Checklist

- [x] `pnpm typecheck` passes.
- [x] `pnpm lint` passes.
- [x] `pnpm test` passes (162/162).
- [x] `pnpm test:e2e` passes (8/8) **after** running `playwright install chromium`.
- [x] `pnpm build` passes.
- [x] No forbidden SaaS / billing / public-onboarding surfaces.
- [x] All 25 build phases merged (per `docs/IMPLEMENTATION_STATUS.md` and commit history).
- [x] Documentation set is complete and current.
- [ ] **C-1 idempotency hole fixed.**
- [ ] **H-1 cron secret comparison hardened.**
- [ ] **H-3 disconnect revokes upstream.**
- [ ] **H-2 retry endpoint validates `draft.status`.**
- [ ] **H-4 extension rate-limit key uses peppered HMAC.**
- [ ] Staging RLS verification with owner + non-owner users.
- [ ] Durable rate-limit store wired up OR single-instance commitment recorded in deploy docs.
- [ ] First live X publish performed against a disposable account, observed end-to-end.
- [ ] First live AI prompt against Anthropic, observed end-to-end.
- [ ] First Chrome-extension save performed end-to-end against a real installed extension with a personal token.

---

## Mechanical fixes applied during this review

None. This review did not modify any code. Three cosmetic candidates were identified but deferred to the user:

- `lib/analytics/index.ts:920` stale "Phase 19 will replace…" string — verify and remove.
- `app/(app)/_pending-route.tsx` orphaned export — wire up or delete.
- `lib/posts/index.ts:139-140` confusing `*_placeholder` field names — rename.

I also did not run `playwright install` permanently or modify `RUNBOOK.md` to record the prerequisite, though the e2e suite needs both to run on a fresh machine.

---

## Recommended next prompt

Use this prompt to start the highest-priority fix:

> Fix the publishing retry concurrency hole in CreatorOS Personal. Specifically:
> 1. In `lib/publishing/index.ts:1284-1287`, change `liveIdempotencyKey` so retries produce a deterministic key based on `prior_failed_job_id` (or `scheduledPostId`) instead of `randomUUID()`. Two concurrent retries off the same failed job must collide on the existing `publishing_jobs.idempotency_key` unique index.
> 2. In `lib/publishing/index.ts:1939-1980` (`retryPublishingJob`), reject when `draft.status !== 'failed'`.
> 3. In `runXPublishingJob` live branch (`lib/publishing/index.ts:1780-1899`), transition `draft.status -> 'publishing'` with a CAS `update where status in ('approved','failed') returning *` and bail if zero rows updated.
> 4. Add a Supabase migration that creates a partial unique index `published_posts_draft_uidx` on `published_posts(publishing_draft_id)` where `published_via = 'api' and deleted_at is null`.
> 5. Add a Vitest regression test that calls `retryPublishingJob` twice in parallel against the dry-run fixture and asserts exactly one `publishing_jobs` row gets the live retry key.
>
> Run `pnpm typecheck && pnpm lint && pnpm test`. Update `docs/FINAL_CODEBASE_REVIEW.md` to mark C-1 fixed and reference the new test. Do NOT change any other behavior.
