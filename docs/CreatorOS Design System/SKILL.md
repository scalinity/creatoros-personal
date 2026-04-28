---
name: creatoros-design
description: Use this skill to generate well-branded interfaces and assets for CreatorOS Personal — an editorial-workshop, dark-first design system for an AI-powered X/Twitter creator OS. Contains design guidelines, OKLCH tokens, type ramps, paper-grain background, and a full UI kit (primitives, composites, domain components, shell layout). Use for production code or throwaway prototypes.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. The fastest path: copy `globals.css` + `components.css` + `components.jsx` and load them as in `CreatorOS Design Showcase.html`. All components are exported to `window` and immediately usable.

If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

**Non-negotiable aesthetic rules** (from README.md, in priority order):

1. **Ink-on-paper, dark-first.** Warm charcoal canvas, warm cream ink. Never pure black or white.
2. **Paper-grain noise overlay must be present** on `body::before` (already in globals.css — do not remove).
3. **Hairline rules carry hierarchy, not shadows.** Shadows only on dialogs / popovers / command palette.
4. **Smallcaps + folio marks** for section eyebrows. Use real `font-variant-caps: all-small-caps`, never `text-transform: uppercase`.
5. **Numbers are mono, tabular, lining.** All IDs, timestamps, scores, metrics.
6. **No rounded-full except avatars + status dots.** No rounded-2xl. No pill rounding.
7. **No emoji.** Use Fraunces ornaments (`❦ § ¶ ※`) and mono symbols.
8. **No purple/pink gradients, no glassmorphism, no Inter, no Geist, no lorem ipsum.**
9. **Vermillion is the only loud color.** Moss / ochre / rust for semantics. Info-blue exists but is used very sparingly.
10. **Reduced motion respected** — count-ups, sweeps, stagger collapse to instant.

**Files in this skill:**
- `README.md` — full system documentation
- `globals.css` — tokens + base + paper-grain
- `components.css` — every component's styles
- `components.jsx` — every component (Button, Input, Card, RuleHeader, ScoreGauge, ChatMessage, Sidebar, AppShell, CommandPalette, etc.)
- `sample-data.jsx` — domain-true sample data
- `CreatorOS Design Showcase.html` — reference page demonstrating every component
- `preview/*.html` — design system tab cards
