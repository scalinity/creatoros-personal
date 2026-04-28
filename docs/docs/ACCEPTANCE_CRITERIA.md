# docs/ACCEPTANCE_CRITERIA.md

## Full Project Acceptance Criteria

The project is acceptable when every section below passes.

## Private Access

- App is private and admin-only.
- No public homepage/signup/marketing/pricing/billing/team/support flows.
- `/login` is minimal and private.
- All protected routes require auth and allowlist.
- Non-allowlisted access is denied and audited.

## Design System

- Attached design system is implemented throughout.
- Dark-first warm ink-on-paper style is preserved.
- Paper grain overlay exists.
- No generic shadcn defaults leak.
- Tokens used instead of hardcoded colors/radii/type.
- Dense tables, score gauges, rule headers, folios, smallcaps, mono numerics are used consistently.

## X Read/Write

- Owner can connect X.
- Owner can sync/import posts.
- Manual import works if API sync fails.
- Owner can escalate publishing scopes intentionally.
- Owner can create posts, threads, replies, quote posts.
- Owner can approve and publish to X.
- Owner can schedule approved posts.
- Queue/status/failure views work.
- Failed publishing jobs are retryable only when safe.
- Every external write is audited.

## AI and Content

- Owner can analyze post history.
- Owner can generate voice profile from own posts/blogs.
- Owner can create posts/threads/replies/quotes in learned voice.
- Algo Analyzer returns 9 heuristic scores plus rewrites and publish readiness.
- Brain Dump generates posts, threads, blogs, scripts, campaigns, questions.
- Coach answers with internal evidence citations.

## Blogs

- Owner can create/edit/version blogs.
- Owner can generate ideas/outlines/full drafts/SEO metadata.
- Owner can export Markdown/HTML/JSON/MDX-ready.
- Owner can repurpose blogs into X content.
- Owner can turn X content into blogs.

## Growth

- Owner can manage goals, pillars, campaigns, experiments.
- Weekly and monthly AI reviews work.
- Experiment results track hypothesis, metrics, interpretation, decision.
- Profile audits generate actionable recommendations.

## Inspiration and Extension

- Owner can save inspiration in app.
- Extension endpoint saves with personal save token only.
- Inspiration transforms into original content.
- High plagiarism/similarity risk blocks ready/publish until reviewed.

## Security

- X tokens encrypted.
- Personal save tokens hashed.
- AI keys/server keys never exposed to browser.
- RLS protects data.
- Cron routes verify secret.
- Data export/delete works and excludes decrypted secrets.
- Prompt injection protections exist.

## Testing

- Typecheck passes.
- Lint passes.
- Unit tests pass.
- Integration tests pass where feasible.
- Playwright smoke tests pass with mocked AI/X.
- Publishing dry-run and approval tests pass.
- Design regression checks pass where implemented.
