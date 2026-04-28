# Repo Audit

Date: 2026-04-27
Phase: 01 - Spec Ingestion and Repo Audit

## Summary

CreatorOS currently contains a specification and design package only. There is no application scaffold, package manifest, source tree, test setup, or database migration folder.

The documentation package is nested under `docs/` rather than spread at the repository root. The implementation should continue from this actual layout unless a later phase explicitly decides to reorganize it.

## Bootstrap Findings

| Area | Finding |
|---|---|
| Root contents | `.DS_Store`, `docs/` |
| Root `README.md` | Missing. The package README is `docs/README.md`. |
| Package manifest | No root `package.json` found. |
| Package manager | Not detectable because no lockfile is present. No `bun.lockb`, `pnpm-lock.yaml`, `yarn.lock`, or `package-lock.json` exists at repo root. |
| Monorepo indicators | None detected. No root `workspaces`, `turbo.json`, or `nx.json`. |
| Framework | Not implemented yet. Spec requires Next.js App Router with TypeScript. |
| Test runner | Not implemented yet. Spec requires Vitest and Playwright later. |
| Git state | Git repository exists at the repo root; current files are untracked. |
| Existing product code | None found. |

## Documentation Artifacts Verified

The phase-specific docs are present at these actual paths:

| Required artifact | Actual path | Status |
|---|---|---|
| `README.md` | `docs/README.md` | Present |
| `docs/SPEC.md` | `docs/docs/SPEC.md` | Present |
| `docs/ARCHITECTURE.md` | `docs/docs/ARCHITECTURE.md` | Present |
| `docs/IMPLEMENTATION_PLAN.md` | `docs/docs/IMPLEMENTATION_PLAN.md` | Present |
| `docs/ACCEPTANCE_CRITERIA.md` | `docs/docs/ACCEPTANCE_CRITERIA.md` | Present |
| `docs/OPEN_QUESTIONS.md` | `docs/docs/OPEN_QUESTIONS.md` | Present |
| `design/tokens.json` | `docs/design/tokens.json` | Present |
| `design/component-map.md` | `docs/design/component-map.md` | Present |

Additional implementation docs are also present under `docs/docs/`, including API contracts, data model, security, AI system, publishing system, X integration, UX, test plan, deployment, and implementation notes.

## Design Package Verified

The attached design system source package is present at `docs/CreatorOS Design System/` and includes:

- `README.md`
- `SKILL.md`
- `globals.css`
- `components.css`
- `components.jsx`
- `sample-data.jsx`
- `CreatorOS Design Showcase.html`
- `preview/*.html`

The implementation should preserve these files as authoritative reference material for the dark-first editorial workshop UI.

## Implementation-Critical Decisions

- Product is `CreatorOS Personal`, a private single-owner creator-growth operating system.
- `/login` is the only public UI route; all other routes require Supabase session plus `ADMIN_EMAILS` allowlist.
- The app is not SaaS: no pricing, Stripe, subscriptions, trials, memberships, teams, public onboarding, testimonials, or marketing funnels.
- Intended stack is Next.js App Router, TypeScript, Supabase Auth/Postgres/RLS/pgvector, Tailwind, server-only AI providers, X OAuth 2.0, and Vercel-compatible jobs.
- Default AI provider is Anthropic Claude Opus 4.7 with adaptive thinking, max effort, and configurable routing.
- AI may draft, analyze, recommend, and produce structured reports, but cannot approve or publish content by itself.
- External text from imports, inspiration, target accounts, and external posts must be treated as untrusted data inside prompts.
- X write actions must be explicit, owner-approved, capability-gated, state-machine driven, and audited before and after execution.
- Scheduled publishing is allowed only for already-approved drafts.
- Browser code must never receive AI keys, Supabase service-role keys, X OAuth tokens, personal save tokens, or encryption material.
- Every exposed database table must have RLS, with `user_id` kept for security and future portability.
- Quote-post and enterprise-only X features must remain behind capability flags.
- Manual import and manual mark-as-published flows remain required fallbacks.
- Design must use the provided tokens and component anatomy: warm ink-on-paper palette, paper grain, hairline hierarchy, Fraunces/Public Sans/JetBrains Mono, dense tables, smallcaps folios, and restrained radii.
- Direct React `useEffect` should be avoided in later implementation per project instructions; prefer derived state, data-fetching libraries, handlers, keys, or explicit mount-only wrappers.

## Existing Code to Preserve, Refactor, or Replace

| Category | Finding | Action |
|---|---|---|
| Spec docs | Complete documentation package exists under `docs/`. | Preserve and reference during implementation. |
| Design source | Design system source and previews exist under `docs/CreatorOS Design System/`. | Preserve as authoritative UI reference. |
| Product source | No app, components, lib, tests, or migrations exist yet. | Nothing to refactor or replace in product code. |
| OS artifacts | `.DS_Store` files exist. | Do not rely on them; add `.gitignore` in foundation phase. |

## Constraints for Later Phases

- Do not create public marketing, billing, SaaS, team, or upgrade surfaces.
- Do not use CreatorBuddy branding, copy, assets, or UI identity.
- Do not implement mass engagement, uncontrolled autonomous posting, or platform-rule bypass behavior.
- Verify provider and platform APIs against official docs during implementation because Anthropic, X, Supabase, Next.js, and Vercel details can change.
- Keep implementation status honest. Scaffolded or mocked features must be labeled as such.
- Add package manager, scripts, lint/type/test tooling, `.gitignore`, and source skeleton in `02_FOUNDATION_AND_TOOLING.md`, not in this phase.

## Tooling Notes

- Morph codebase search was used to inspect for existing app code and phase prompt files.
- Sequential-thinking MCP was requested by project instructions but is not available in this Codex session. This audit used an explicit plan/checklist instead.
- No package-manager checks can run until the foundation phase creates a manifest and scripts.

## Recommended Next Step

Run `02_FOUNDATION_AND_TOOLING.md` next. That phase should initialize the actual application scaffold and tooling while preserving the documentation package.