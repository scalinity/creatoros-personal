# Known Limitations

Last updated: 2026-04-28
Phase: 25 - Final Production Review and Handoff

This file lists honest remaining limitations after final local review. These are not hidden completed features.

## Production Validation Gaps

| Limitation | Impact | Recommended follow-up |
|---|---|---|
| Live Supabase RLS integration tests were not run locally. | Migrations define RLS and tests inspect schema/service boundaries, but production confidence requires a real Supabase project with owner/non-owner sessions. | Run the staging RLS repair prompt from `docs/FINAL_REVIEW.md`. |
| Live Anthropic/OpenAI calls were not exercised in final checks. | Mock provider coverage verifies schemas and workflows, but provider-specific failures, latency, and model settings need staging validation. | Run live-provider staging validation with sanitized prompt-run logging. |
| Live X OAuth/read/write behavior was not exercised in final checks. | OAuth, sync, publishing, capability, and reconciliation code exists, but real API permissions, rate limits, and callback config must be verified with credentials. | Validate read OAuth first, then scope escalation, then a single explicit live test post in staging or a disposable account. |
| Real Chrome extension successful save was not run. | Invalid-token rejection is covered by Playwright; successful saves need a configured extension origin and real personal save token. | Validate extension origin and token rotation/revocation in staging. |
| Dedicated visual regression testing is not implemented. | Functional route smoke tests pass, but pixel-level design drift is not automatically detected. | Add Playwright screenshot baselines for app shell, dashboard, publishing, blogs, analytics, and settings. |
| Rate limits use process-memory fixed-window stores. | This is acceptable for a private workstation and local tests, but limits are not durable across serverless instances or deploy replicas. | Replace with a durable store before high-frequency production use or multi-instance deployment. |
| Only implemented cron routes are `/api/cron/x-sync` and `/api/cron/publish`. | Metric snapshots, weekly review, and monthly review cron routes are documented as planned but should not be configured yet. | Do not configure planned cron routes until handlers are implemented. Trigger reviews manually through existing app workflows. |
| Production build reads `.env.local` in this workstation. | Local build success proves compile readiness, but deployed environments must be configured separately. | Verify Vercel/Supabase env values through diagnostics after deploy. |
| Browser Playwright E2E uses an in-memory fixture. | The smoke suite validates private flows without live credentials, but does not prove live database persistence or provider calls. | Keep fixture tests for regression speed and add staging smoke checks for credentialed integrations. |

## Current Non-Blockers

- `pnpm` is not installed globally in this shell. The repo declares `pnpm@10.33.2`, and all final checks passed through `npx pnpm@10.33.2`.
- Playwright emits npm config warnings and `NO_COLOR`/`FORCE_COLOR` warnings in this environment. The test run exits successfully.
- `CLAUDE.md` is an unrelated untracked local file present before Phase 25. It was not modified or staged by this phase.

## Repair Prompt Queue

Use these prompts only if the owner wants to continue hardening beyond final handoff:

1. `Run a staging Supabase RLS verification pass for CreatorOS: apply all migrations to a disposable project, seed owner and non-owner users, verify every exposed table rejects cross-user access, and document results in docs/FINAL_REVIEW.md.`
2. `Run live-provider staging validation for CreatorOS AI and X: connect real X OAuth read scopes, run one read sync, run one AI prompt with Anthropic or OpenAI, perform one publishing dry-run, and document sanitized outcomes without exposing secrets.`
3. `Add visual regression smoke coverage for the private app shell and core routes using Playwright screenshots, preserving the CreatorOS design-system rules and ignoring dynamic data regions.`
4. `Validate a real Chrome extension save against /api/inspiration/save using a scoped personal save token from staging, then document the extension ID, CORS setup, token rotation, and revocation steps without recording token values.`

Next prompt to run: No next phase; final handoff complete.
