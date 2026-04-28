# CreatorOS Personal Full Specification Package

This package is a repo-ready documentation set for building **CreatorOS Personal**, a private, single-owner AI creator-growth operating system for X/Twitter publishing, long-form writing, analytics, experiments, and personal content intelligence.

This is a specification package only. It intentionally contains no implementation code.

## How to use this package

1. Start with `docs/SPEC.md` for product scope and architectural decisions.
2. Read `docs/DESIGN_SYSTEM_IMPLEMENTATION.md`, `design/tokens.json`, and `design/component-map.md` before implementing UI. The attached design system is authoritative and must prevent generic shadcn drift.
3. Implement data/security foundations from `docs/DATA_MODEL.md`, `docs/SECURITY.md`, and `docs/API_CONTRACTS.md` before AI or publishing features.
4. Treat `docs/PUBLISHING_SYSTEM.md` and `docs/X_INTEGRATION.md` as the binding safety specification for external X write actions.
5. Use `docs/IMPLEMENTATION_PLAN.md` as sequencing for the full production project. The plan is phased, but the product is not framed as an MVP.

## Package contents

- `docs/SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/DESIGN_SYSTEM_IMPLEMENTATION.md`
- `docs/UX_SPEC.md`
- `docs/DATA_MODEL.md`
- `docs/API_CONTRACTS.md`
- `docs/AI_SYSTEM.md`
- `docs/AI_PROMPTS.md`
- `docs/X_INTEGRATION.md`
- `docs/PUBLISHING_SYSTEM.md`
- `docs/BLOG_SYSTEM.md`
- `docs/GROWTH_SYSTEM.md`
- `docs/CHROME_EXTENSION.md`
- `docs/SECURITY.md`
- `docs/TEST_PLAN.md`
- `docs/DEPLOYMENT.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/OPEN_QUESTIONS.md`
- `docs/IMPLEMENTATION_NOTES.md`
- `design/tokens.json`
- `design/component-map.md`

## Product stance

CreatorOS Personal is a private personal cockpit, not a SaaS product. It may publish to X only when the owner explicitly approves or pre-approves scheduled content. Every external write action must be auditable.

## Design stance

The UI is **Editorial Workshop, Dark-First**: warm ink-on-paper, hairline hierarchy, dense instrument-grade tables, folio headings, mono numerics, and persistent paper grain. The design system files attached to the request were synthesized into the docs and token file.


## Explicit Non-Goals

Do not build:

- Public marketing pages, public onboarding, public signup, pricing, subscriptions, trials, memberships, Stripe, payment processors, customer billing, plan permissions, upgrade flows, support-ticket flows, team accounts, tenant administration, testimonials, or customer-facing growth funnels.
- Uncontrolled autonomous engagement: no mass replies, mass likes, mass DMs, mass follows, auto-engagement storms, bot-like loops, scraping private data, browser automation to bypass X APIs, or rate-limit bypasses.
- UI, metadata, package names, or copy that references the inspiration product or imitates another product's branding/copy/assets.
- Claims of official X algorithm access. All draft scoring and growth advice must be labeled heuristic unless directly supported by internal metrics.
