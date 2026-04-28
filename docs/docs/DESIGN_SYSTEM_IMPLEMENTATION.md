# docs/DESIGN_SYSTEM_IMPLEMENTATION.md

## Source Files Synthesized

The attached design system is authoritative. This document synthesizes:

- `README.md`
- `SKILL.md`
- `globals.css`
- `components.css`
- `components.jsx`
- `sample-data.jsx`
- `CreatorOS Design Showcase.html`
- `badges.html`
- `brand-mark.html`
- `buttons.html`
- `chat-message.html`
- `colors-accent.html`
- `colors-ink.html`
- `colors-light.html`
- `colors-semantic.html`
- `colors-surfaces.html`
- `elevation.html`
- `fields.html`
- `globals-tokens.html`
- `_shared.css`

## Design Thesis

CreatorOS Personal must feel like a private quarterly journal crossed with a financial terminal: editorial, dense, dark-first, warm, and instrument-grade. The owner lives in this interface for long writing and analysis sessions, so the UI prioritizes calm hierarchy, legible density, and precise system feedback over brand spectacle.

## Non-Negotiable Visual Rules

| Rule | Implementation requirement |
|---|---|
| Ink-on-paper | Default dark warm charcoal background with cream ink; light mode uses warm bone, never pure black/white. |
| Paper grain | Keep fixed `body::before` SVG noise overlay at 4% opacity dark, 3% light. |
| Hairline hierarchy | Borders and rules define hierarchy. Shadows only for dialogs, sheets, popovers, command palette. |
| Editorial sectioning | Use `RuleHeader`, folio marks, smallcaps labels, hairline rule. |
| Dense data | Tables are compact, sticky-header, mono numeric, row hover with vermillion left rule. |
| Typography | Fraunces display, Public Sans UI/body, JetBrains Mono numerics/IDs/timestamps. |
| Smallcaps | Use real `font-variant-caps: all-small-caps`; do not fake uppercase transformation. |
| Radius | `2px`, `4px`, `6px`. No pill buttons. Rounded-full only avatars/status dots. |
| Color | Vermillion is the only loud color; moss/ochre/rust for semantic states. |
| Motion | 80/140/220/360/600ms tokens, cubic easing, reduced-motion compliant. |
| Iconography | Typography-first glyphs: `§`, `¶`, `❦`, `※`, `✦`, `⌘K`, `☾`, `☀`. No emoji. |

## Token Implementation

Use `design/tokens.json` as the exported token artifact. Implementation must import values from CSS variables, not hardcode.

Required Tailwind mapping:

- `colors.canvas -> var(--bg-canvas)`
- `colors.surface -> var(--bg-surface)`
- `colors.surface2 -> var(--bg-surface-2)`
- `colors.inset -> var(--bg-inset)`
- `colors.ink.primary -> var(--ink-primary)`
- `colors.ink.secondary -> var(--ink-secondary)`
- `colors.ink.tertiary -> var(--ink-tertiary)`
- `colors.ink.muted -> var(--ink-muted)`
- `colors.accent -> var(--accent-vermillion)`
- `colors.success -> var(--success-moss)`
- `colors.warning -> var(--warning-ochre)`
- `colors.danger -> var(--danger-rust)`
- `borderColor.hairline -> var(--rule-hairline)`
- `borderColor.strong -> var(--rule-strong)`
- `fontFamily.display -> var(--font-display)`
- `fontFamily.sans -> var(--font-sans)`
- `fontFamily.mono -> var(--font-mono)`
- spacing tokens from `--space-*`
- radius tokens from `--radius-*`

## Primitive Components

| Component | Required anatomy |
|---|---|
| Button | `btn`, variants primary/secondary/tertiary/destructive, sizes sm/md/lg, loading hairline bar, no transform press. |
| IconButton | 28px square, mono glyph, transparent border, surface-2 hover. |
| Field | Bottom-rule only input, smallcaps label, vermillion focus rule, mono option for URLs/IDs/secrets. |
| Textarea | Auto-grow where useful, no generic rounded textarea panel. |
| Select | Native select restyled with mono chevron. |
| Checkbox | Custom ink-stroke square, vermillion checked state. |
| Switch | Rectangular track, square thumb, no pill. |
| Badge | Flat, tiny smallcaps, neutral/accent/success/warning/danger/outline. |
| Tooltip | Hairline surface, small, delayed hover. |
| Dialog | Center overlay, 4px blur backdrop, hairline, shadow-md. |
| Sheet | Right-side inspector-like surface, 360px default. |
| Tabs | Underline only, smallcaps, active vermillion rule. |
| Toast | Hairline card with semantic left border and progress underline. |

## Composite Components

| Component | Usage |
|---|---|
| RuleHeader | Every section header, route header, inspector header. Folio + label + optional sub + actions. |
| Card | Workhorse surface. Variants default/inset/elevated. Elevated only for transient emphasis. |
| KeyValueRow | Inspector details, diagnostics, publishing review payload. |
| Table | Post history, queue, jobs, experiments, blog exports. Dense, mono numeric columns. |
| Pagination | Compact mono nav. |
| EmptyState | Dashed hairline, ornament glyph, direct operator copy. |
| LoadingSkeleton | Surface-2 block with vermillion-tinted sweep. |
| ErrorFallback | Folio code, direct title, action. |
| ScoreGauge | Algo scores, growth scores, publish readiness. Count-up on mount. |
| MetricBlock | Dashboard metrics and analytics summaries. |
| ConfidenceLabel | FACT / INFERENCE / SPECULATION badges. |
| PostRow | Archive/publishing row with author/date/text/metrics/score. |
| RewriteCard | Analyzer/composer candidate outputs. |
| ChatMessage | Coach conversation; lowercase mono `you`/`coach`. |
| ReplyDraftCard | Reply review with parent context. |
| InspirationCard | Source post, risk, notes, actions. |
| AssumptionFlag | Ochre left-rule for assumptions and scope caveats. |
| AppShell | 240px sidebar, main, optional 360px inspector. |
| CommandPalette | `⌘K`, 640px max, grouped commands. |

## Domain Extensions Required

Build these as first-class components using the existing anatomy:

| New domain component | Base pattern | Required details |
|---|---|---|
| PublishingQueueRow | Table/PostRow | Status badge, scheduled time, content type, approval state, failure count, account, action menu. |
| ApprovalRail | KeyValueRow/Card | Exact X payload, scopes, target account, duplicate/risk checks, confirmation action. |
| CalendarDayCell | Card/Table | Timezone-aware entries, status badges, density without calendar SaaS look. |
| PublishFailureCard | ErrorFallback/Card | Failure code, safe retry eligibility, last API response summary. |
| BlogEditorFrame | Card/RuleHeader/Textarea | Fraunces title, Public Sans metadata fields, long-form reading rhythm, export actions. |
| BlogVersionTimeline | Table | Version id, timestamp, model, editor action, restore. |
| CampaignCard | Card/MetricBlock | Campaign goal, active items, score, drift warning. |
| ExperimentLedger | Table | Hypothesis, window, content ids, metrics, decision. |
| GrowthReviewPage | RuleHeader/Card/MetricBlock | Weekly/monthly review sections with evidence citations. |
| ProfileAuditCard | Card/ScoreGauge | Bio/header/pinned post checks, recommendations, confidence. |
| TokenManagementRow | KeyValueRow/Table | Personal save token metadata, scope, shown-once warning, revoke/rotate. |

## Page Layout Rules

- Every route begins with `RuleHeader` and folio. Example: `§ 07 — PUBLISHING QUEUE`.
- Use optional inspector for review-heavy screens: publishing approval, post detail, blog version, experiment result.
- Dense grids use 12/16/24/32px spacing; long-form blog/editor regions use larger vertical rhythm.
- Avoid generic cards stacked with random shadows. Prefer rules, tables, panels, and inspector details.
- Status badges use the provided variants:
  - neutral: draft/queued.
  - accent: scheduled/approved.
  - success: published/succeeded.
  - warning: drift/needs review/rate-limited.
  - danger: failed/destructive.
  - outline: archived/canceled.

## Copy Style

- Operator-to-self. Direct, analytical, no cheerleading.
- Avoid: “Welcome”, “Let’s”, “Oops”, exclamation points, emoji, mascots, lorem ipsum.
- Good toasts:
  - `DRAFT APPROVED — DRAFT-471 entered publishing queue.`
  - `POST PUBLISHED — X returned POST-1849420000000000000.`
  - `SYNC PAUSED — X rate limit resets at 14:08.`
- Good empty state:
  - `❦ NO SCHEDULED POSTS — Approve a draft to place it on the calendar.`

## Accessibility

- Preserve focus-visible vermillion outline.
- All glyph-only buttons require accessible labels.
- Color cannot be the only status signal; badges must include text.
- Tables need proper `th`, sort labels, and keyboard row activation where rows are interactive.
- Command palette traps focus and closes on Escape.
- Dialog/sheet uses aria-modal and labelled title.
- Reduced motion collapses count-ups and sweeps.

## Failure Modes

| Failure | Design response |
|---|---|
| Missing AI key | Ochre assumption/config card, diagnostics link, AI buttons disabled. |
| X publishing scope missing | Warning badge and scope escalation CTA in settings; no hidden publish action. |
| Publish failed | Rust failure card with sanitized reason and retry eligibility. |
| Rate-limited | Ochre status badge with reset timestamp in mono. |
| Draft risky/similar | Ochre `AssumptionFlag` plus plagiarism section before approval. |
| No data | Ornament empty state with one concrete action. |

## Acceptance Criteria

- UI uses the attached tokens and component anatomy across all routes.
- No generic shadcn visual defaults leak into production.
- Dark mode is default and visually complete.
- Light mode uses bone/warm ink and preserves contrast.
- Paper grain is visible on every page.
- Publishing, blog, growth, and analytics screens map to the design system rather than introducing unrelated product UI patterns.
