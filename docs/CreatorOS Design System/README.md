# CreatorOS Personal — Design System

**Editorial Workshop, Dark-First.** A private quarterly journal crossed with a financial terminal. The design system for a single-user, AI-powered X/Twitter creator OS where the operator lives for hours per day.

This is **not** a SaaS surface. There is no marketing, no signup. The interface exists to serve one person doing serious creative and analytical work over their own writing, post history, and content pipeline.

---

## Index

| File | Purpose |
|---|---|
| `globals.css` | Design tokens (color, type, space, radius, motion), base styles, **paper-grain noise overlay** |
| `components.css` | Stylesheet for every primitive, composite, and domain component |
| `components.jsx` | All React components (Phases 2–5) — primitives, composites, domain, shell |
| `sample-data.jsx` | Domain-true CreatorOS sample data (no lorem ipsum) |
| `CreatorOS Design Showcase.html` | The `/design` showcase — every component exercised with realistic data |
| `preview/*.html` | Small registered cards for the Design System tab (color, type, space, components) |
| `SKILL.md` | Agent skill manifest — usable in Claude Code |

---

## Aesthetic Direction (committed)

Three properties every screen has:

1. **Ink-on-paper feel.** Warm charcoal in dark; warm bone in light. Hairline rules instead of shadows. Borders in slightly-lighter ink than background.
2. **Editorial sectioning.** Page titles read like chapter headings. Section labels use `font-variant-caps: all-small-caps` + folio-style numbering (`§ 03 — POST HISTORY`). Drop caps on major page intros. Ornament glyphs (`❦`) separate sections.
3. **Instrument-grade data display.** Numbers are tabular-figured monospace. Scores have gauge bars. Tables are dense with hairline rules. Numbers count up when generated.

**The unforgettable detail:** A baked SVG paper-grain texture (`feTurbulence` baseFrequency 0.9, 2 octaves) overlaid on every page at 4% opacity (3% in light), `mix-blend-mode: overlay` (multiply in light). Fixed-position pseudo-element on `body::before`, `pointer-events: none`. This is what makes the app *feel like CreatorOS* and not like another shadcn site.

---

## Content Fundamentals

**Tone.** Analytical, mildly contrarian, allergic to platitude. Prefers structural critique over emotional reaction. Implicit CTAs — rarely asks for engagement; lets the assertion do the work.

**Voice.** Operator-to-self. There is no "you" because there is no audience to address — the operator *is* the audience. Where second-person is unavoidable (chat with the AI Coach), `coach` and `you` appear as lowercase mono attributions, never as "Coach:" or "You:".

**Casing.**
- Sentence case for body, page titles, drop-cap intros.
- Real **smallcaps** (`font-variant-caps: all-small-caps`, never `text-transform: uppercase`) for section eyebrows, status labels, table headers, sidebar nav.
- Mono **all-caps** allowed only for status badges and confidence labels (`FACT`, `INFERENCE`, `SPECULATION`).
- Folios use mono numerals zero-padded to two digits (`§ 03`, `§ Ⅰ`, `02 of 47`).

**Numbers.** Always tabular, lining figures, mono. IDs (`DRAFT-471`), timestamps (`2026-04-21 14:08`), hashes, percentages, scores — all `--font-mono` with `font-variant-numeric: tabular-nums lining-nums`.

**Forbidden.** Emoji (except `❦ ¶ § ※ ✦` ornament glyphs as type), exclamation points, "Let's…", "Welcome", marketing voice, mascots, "Oops!", lorem ipsum.

**Sample copy:**
- Empty state: `❦ NO INSPIRATION SAVED — Right-click any post in your timeline to save it here.`
- Toast: `DRAFT SAVED — DRAFT-471 stored to local archive.`
- Dialog: `Discard Draft? — DRAFT-471 has unsaved edits since 14:08. Discarding will revert to the last archived revision.`
- Coach: `Your "first-principles" posts outperform your "reaction" posts 3.2× on bookmarks this quarter.`

---

## Visual Foundations

**Color.** OKLCH throughout for perceptual consistency.
- **Dark (default):** warm charcoal canvas (`oklch(0.18 0.012 60)`), surface +0.04L, inset −0.04L. Ink primary near-cream (`oklch(0.94 0.015 80)`), three steps down to muted. Hairlines at L 0.32.
- **Light:** warm bone canvas (`oklch(0.96 0.010 85)`), warm near-black ink — **never** `#000` or `#fff`.
- **Accent:** vermillion (`oklch(0.65 0.18 35)`) — primary CTA, scores, focus rings, citation marks, hairline-left active states.
- **Semantic:** moss green (success), ochre (warning, drift, assumptions), rust (destructive, danger).
- Info-ink blue (`oklch(0.65 0.06 240)`) exists for completeness but is used **very sparingly** — never as a primary. Vermillion is the only loud color.

**Type.**
- Display: **Fraunces Variable** (Google Fonts) — page titles, h1–h4, score values, drop caps, body of rewrites.
- Body: **Public Sans Variable** (Google Fonts) — UI default. Characterful, not generic.
- Mono: **JetBrains Mono Variable** — all numerics, IDs, timestamps, code, table numeric columns, kbd shortcuts, folios.

> **Substitution flag:** Path A in the original spec called for licensed faces (Söhne / Berkeley Mono). This system ships Path B. If you want Söhne / Berkeley Mono, drop the WOFF2 files into `fonts/` and update the `@import` in `globals.css`.

Type scale is modular at 1.25, anchored at 16px body. Headlines tightened (`-0.01em` at 36px+, `-0.02em` at 48px+). Smallcaps positively tracked (`+0.06em`). Leading: 1.5 body, 1.7 long-form, 1.15 display, 1.25 mid headings.

**Space.** Standard 4px-grid scale, exposed as `--space-1`…`--space-24`. Generous vertical rhythm in long-form regions, dense in tabular regions.

**Borders & Shadows.** Borders carry hierarchy — not shadows. Three border tokens: hairline, strong, accent. Shadows reserved for transient overlays only (dialog, popover, command palette). Three levels: ledge (`--shadow-xs`), dialog (`--shadow-md`), palette (`--shadow-lg`).

**Radius.** `--radius-sm: 2px` (buttons, inputs), `--radius-md: 4px` (cards, dialogs, chips), `--radius-lg: 6px` (rare, image masks). **No rounded-full except avatars and status dots. No `rounded-2xl`. No `rounded-3xl`.** Pill rounding is forbidden.

**Backgrounds.** Solid warm canvases with the persistent paper-grain noise overlay. Never use gradients as decoration. Linear gradients exist exactly twice in the system: the loading-skeleton sweep (vermillion-tinted, 1.6s linear) and the score-gauge fill (solid vermillion, no gradient).

**Hover / press states.**
- Buttons: hover = `--accent-vermillion-hover` (lighter +5L) for primary, `--bg-surface-2` for secondary. Press = no shrink, no transform — only color shifts. Editorial calm.
- Rows: hover = `--bg-surface-2` + `inset 2px 0 0 0 var(--accent-vermillion)` (hairline left rule).
- Tertiary text buttons: hover adds underline, 4px offset.

**Animation / Motion.**
- Easing: `cubic-bezier(0.2, 0, 0, 1)` standard. `(0.3, 0, 0, 1)` for enter. `(0.4, 0, 1, 1)` for exit.
- Durations: 80 / 140 / 220 / 360 / 600 ms.
- Score values count up on mount via rAF + cubic ease-out.
- Loading skeletons sweep with vermillion-tinted gradient (1.6s linear).
- Toasts auto-dismiss with a thin `scaleX` underline counting down.
- All animation respects `prefers-reduced-motion: reduce` — count-ups, ink-bleed, stagger reveals collapse to instant; opacity-only transitions halve duration.

**Transparency / Blur.** Used only on dialog and command-palette backdrops (4px and 3px blur respectively, oklch black at 40–50% alpha). Never used on cards, sidebars, or content surfaces. No glassmorphism.

**Imagery.** No stock photography. No mascots. No illustrations. Where an empty state needs a focal point, it gets a single Fraunces ornament glyph (`❦`) at `--text-3xl` in vermillion. The system is self-contained text + rule + numeral.

---

## Iconography

**Approach:** Iconography is **typographic first**. Most "icons" in CreatorOS are mono characters or Fraunces ornaments treated as glyphs:

| Glyph | Use |
|---|---|
| `§` | Folio mark prefix (`§ 03`, `§ POST HISTORY`) |
| `¶` | Paragraph / draft refs |
| `❦` | Ornament — section dividers, empty states, assistant message lead |
| `※` | Reference / footnote |
| `Ⅰ Ⅱ Ⅲ Ⅳ` | Roman folios (sidebar wordmark, inspector headers) |
| `▾ ▴ ▵` | Sort indicators |
| `‹ ›` | Pagination |
| `♥ ↺ ↩ ❝ ◉` | Post metric chips (likes / reposts / replies / quotes / views) |
| `✕` | Dismiss |
| `⌘K` | Command palette trigger (mono kbd) |
| `☾ ☀` | Theme toggle |

For UI affordances that genuinely benefit from a pictographic icon (sidebar nav), the system uses single-character mono symbols (`✎ ❘≡ ❑ ⌬ ❀ ❦ ✦ ❧ ✱`) at the same x-height as the label. **No emoji.** No multi-color SVG icon sets.

> **Flag for the operator:** If you'd prefer a hairline-stroke SVG icon set (Lucide's `--lucide-icon` style at 1px stroke), say the word and I'll replace the typographic sidebar icons with Lucide via CDN, override stroke to vermillion-on-active, and document the swap in this section. The current direction matches the editorial-typography-first spec; the Lucide path is a reasonable alternative.

**Logo.** The brand mark is the wordmark `CREATOROS` set in Fraunces small-caps, +0.08em tracked, followed by a vermillion folio `Ⅰ`. It appears once: top of the sidebar. There is no marketing logo; there is no marketing surface.

---

## How to use

1. **Read** `CreatorOS Design Showcase.html` first. It exercises every component with realistic data. It is the source of truth for visual fidelity.
2. **Reference tokens** via CSS variables. Never hardcode colors, type sizes, or radii.
3. **Use semantic alias tokens** in components (`--color-fg`, `--color-accent`) where possible. Drop to scale tokens (`--ink-primary`, `--accent-vermillion`) only when the component genuinely needs the specific scale value.
4. **All components** are exported to `window` from `components.jsx`. Import that file once after React + Babel and they're available globally in any subsequent `text/babel` script.
5. **Theme toggle:** call `useTheme()` — it reads/writes `localStorage["creatoros-theme"]` and respects `prefers-color-scheme` on first load. Theme is applied via `data-theme="light"` on `<html>`.

---

## Caveats

- **Fonts:** Path B (free Google Fonts) is wired. Drop in Söhne / Berkeley Mono WOFF2s if you want Path A.
- **Iconography:** typographic-first. See flag above for Lucide alternative.
- **Native Select:** the spec calls for a Radix-based Select; this is rendered with a styled native `<select>` for portability (no Radix in a static HTML artifact). The bottom-rule treatment matches.
- **Storybook:** the `/design` showcase page replaces a Storybook setup — it's a single page exercising every component with realistic data, per spec.
