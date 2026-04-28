# docs/SPEC.md

## Product Definition

**Product name:** CreatorOS Personal  
**Product type:** Private single-owner creator-growth operating system  
**Primary owner:** One allowlisted admin  
**Primary platforms:** X/Twitter and long-form blog writing/export  
**Core architecture:** Next.js App Router, TypeScript, Supabase Postgres/Auth/RLS/pgvector, server-only AI provider abstraction, X OAuth 2.0, Vercel-compatible jobs.

CreatorOS Personal is a private AI-powered creator-growth cockpit that helps the owner connect an X account, import/sync history, write and publish X posts, schedule pre-approved posts, generate replies and quote posts with explicit approval, write blogs, repurpose between X and long-form content, manage campaigns and experiments, and build a personal intelligence layer over writing, metrics, audience signals, ideas, inspiration, and strategy.

This is the full production product specification. Phases in `docs/IMPLEMENTATION_PLAN.md` are sequencing, not scope reduction.

## Architectural Decisions

| Decision | Final specification |
|---|---|
| Access model | Single private admin. `/login` is the only public UI route. Every other route requires Supabase session plus `ADMIN_EMAILS` allowlist. |
| Product model | Not SaaS. No public signup, pricing, Stripe, subscriptions, memberships, billing, teams, trials, support flows, or marketing pages. |
| X access | Assume full X API access is available: X API v2 pay-per-use plus Enterprise/custom capability where needed. Use official X API v2 first; Enterprise/Gnip-style endpoints only behind capability flags. |
| OAuth scopes | Least privilege by default. Start read-centric. Escalate write scopes only when publishing mode is explicitly enabled. |
| Publishing | Supported, but guarded. Owner must explicitly approve any immediate publish. Scheduled publishing is allowed only for drafts already approved by the owner. |
| External write audit | Every X write, delete, retry, schedule, cancel, approval, and failure writes `audit_logs`. |
| AI default | Anthropic Claude Opus 4.7, adaptive thinking, max effort, `AI_MAX_TOKENS=64000`. Model routing stays configurable. |
| AI safety | AI produces drafts, analysis, recommendations, and structured reports. It cannot publish by itself. |
| Design | Attached design system is authoritative: editorial workshop, dark-first, paper-grain, hairline rules, Fraunces/Public Sans/JetBrains Mono, smallcaps folios, dense data displays. |
| Database | Supabase Postgres with RLS on every exposed table. Keep `user_id` everywhere for security and future portability even though product is single-user. |
| Embeddings | Supabase pgvector. Use exact or indexed vector search filtered by `user_id`. |
| Manual fallback | Manual imports and manual mark-as-published remain supported even with full X access. |

## Closed Decisions

1. **X API product/access level:** Full X API access is assumed. Default to official X API v2. Enterprise endpoints are behind capability flags.
2. **X OAuth scopes:** Default request is `tweet.read users.read offline.access like.read bookmark.read follows.read list.read`. Publishing mode may request `tweet.write`, `media.write` when needed, and `tweet.moderate.write` only for explicitly supported moderation features. Disabled optional scopes include `like.write`, `bookmark.write`, `follows.write`, `list.write`, `block.*`, `mute.*`, `dm.*`, `users.email`, and `space.read`.
3. **AI model default:** `AI_PROVIDER=anthropic`, `AI_MODEL=claude-opus-4-7`, `AI_THINKING_TYPE=adaptive`, `AI_EFFORT=max`, `AI_MAX_TOKENS=64000`.
4. **Extension auth:** In-app saves may use Supabase session. Extension saves must use `Authorization: Bearer <personal_save_token>`. The token is scoped only to `inspiration:create`, stored hashed, shown once, revocable, rotatable, rate-limited, and cannot read/update/delete/publish/call heavy AI endpoints.

## Target Outcomes

The app should let the owner:

- Connect X with least-privilege OAuth and optional publishing-mode scope escalation.
- Import and sync X posts, metrics, media metadata, replies, quotes, and scheduled/published states.
- Draft, analyze, approve, schedule, publish, retry, cancel, and audit X content.
- Publish single posts, threads, replies, quote posts, and media-attached posts where configured capabilities permit.
- Maintain a timezone-aware content calendar and publishing queue.
- Track draft status, approval status, schedule status, publish status, failure reasons, and post-publish metrics.
- Write blog ideas, outlines, full blog drafts, SEO metadata, summaries, slugs, tags/categories, and export Markdown/HTML/JSON/MDX-ready payloads.
- Repurpose X-to-blog, blog-to-X thread, blog-to-X post series, brain-dump-to-blog, inspiration-to-blog, and account-research-to-blog.
- Analyze post history, blog history, campaigns, experiments, cadence, content pillars, hooks, formats, and growth signals.
- Maintain a personal growth strategy layer with goals, audience hypotheses, account positioning, campaigns, experiments, weekly/monthly reviews, and profile audits.
- Save inspiration via web app and extension-compatible endpoint, then transform it into original posts/threads/blogs/campaigns without copying distinctive wording.

## Product Modules

| Module | Production scope |
|---|---|
| Private App Shell | Login, protected layout, sidebar, topbar, command palette, diagnostics, settings, responsive shell, dark/light mode, design-system states. |
| Dashboard | Dense growth/publishing cockpit with X status, publishing permissions, scheduled posts, failed jobs, history, drafts, blogs, campaigns, experiments, daily AI suggestions. |
| X Integration | OAuth, least-privilege scopes, scope escalation, token encryption/refresh, sync, metrics, capability flags, fallback import, official write endpoints. |
| Publishing System | Draft approval pipeline, calendar, queue, scheduling, publishing jobs, media, retry/cancel, failures, manual overrides, audit, duplicate/similarity/rate-limit guardrails. |
| Blog System | Ideas, outlines, drafts, editor, SEO, exports, blog-to-X campaigns, X-to-blog expansion, adapters for future publishers. |
| Growth System | Goals, pillars, positioning, campaigns, experiments, reviews, profile audits, target accounts, cadence, growth dashboard. |
| AI System | Claude Opus 4.7 default, OpenAI optional, provider abstraction, structured outputs, prompt registry, retrieval, citations, rate limits, audit. |
| Composer | Ideas, drafts, content packs, voice controls, generated outputs, links to publishing/blog/campaigns/experiments. |
| Coach | Chat with internal evidence over posts, drafts, blogs, campaigns, experiments, publishing history, voice profile, inspiration, account research. |
| Algo Analyzer | Heuristic analyzer only. 9 metrics, score, diagnosis, publish readiness, rewrites, thread expansion, risk warnings. |
| Reply Guy | Target accounts/posts, reply generation, approval, optional publish after approval, no mass behavior. |
| Account Researcher | Public/pasted/API account analysis, patterns, ethical learnings, reply strategy, ideas/blogs/campaigns. |
| Post History | Search, filters, sorts, metric editing, snapshots, AI categorization, playbook, repurposing, publish/blog integration. |
| Brain Dump | Messy input to posts, threads, blogs, scripts, campaigns, clarifying questions; schedule/publish only after approval. |
| Inspiration | Save, tag, transform patterns, plagiarism guard, extension endpoint, convert to post/thread/blog/campaign. |
| Voice Modeling | Generate from owner posts/blogs only; use across posts, replies, quote posts, blogs, coach, growth strategy. |
| Analytics | Engagement, virality, recency, velocity, cadence, follower growth where available/manual, best hooks/topics/formats, blog/campaign/experiment performance. |

## Routes

Required routes:

- `/login`
- `/dashboard`
- `/coach`
- `/algo-analyzer`
- `/composer`
- `/brain-dump`
- `/reply-guy`
- `/account-research`
- `/post-history`
- `/inspiration`
- `/publishing`
- `/calendar`
- `/campaigns`
- `/blogs`
- `/blogs/new`
- `/blogs/[id]`
- `/analytics`
- `/experiments`
- `/settings`
- `/settings/x-connection`
- `/settings/ai`
- `/settings/data`
- `/settings/tokens`
- `/settings/diagnostics`

## Design-System Requirements

The app must implement the attached design language throughout:

- Default dark theme: warm charcoal canvas, warm cream ink, vermillion accent.
- Light theme: warm bone canvas, warm ink, never pure black/white.
- Persistent paper-grain overlay on `body::before`.
- App shell with 240px sidebar, 48px topbar, optional 360px inspector.
- Editorial headers: `RuleHeader`, folio marks, all-small-caps labels, hairline rules.
- Dense instrument tables, mono tabular numerics, score gauges, metric blocks.
- Button, field, switch, badge, toast, dialog, sheet, command palette patterns from attached files.
- No pill buttons, no rounded-2xl, no marketing gradients, no emoji, no stock imagery, no mascots.

## Publishing Safety Requirements

Every X write action requires:

1. Authenticated allowlisted owner.
2. Current X connection with required scope and capability flag.
3. Publishing draft in an approved state, or explicit immediate owner approval action.
4. Preview of exact payload: account, content, media, reply target, quote target, AI disclosure field if used, scheduled time if any.
5. Duplicate/similarity and policy risk checks.
6. Rate-limit and cooldown check.
7. Audit log before and after write.
8. Post-publish reconciliation that stores platform id, URL, response payload, and initial metric snapshot.

## Fallbacks

- If X sync fails: manual import and manual metric edit remain available.
- If X write fails: store failure row, show retry eligibility, preserve draft.
- If media upload fails: allow publish without media only after explicit confirmation.
- If quote-post endpoint requires Enterprise capability: show capability missing unless `x_enterprise_quote_post_enabled=true`.
- If AI provider unavailable: drafts/editor/manual workflows remain usable.
- If embeddings unavailable: retrieval falls back to keyword, filters, and deterministic aggregates.


## Explicit Non-Goals

Do not build:

- Public marketing pages, public onboarding, public signup, pricing, subscriptions, trials, memberships, Stripe, payment processors, customer billing, plan permissions, upgrade flows, support-ticket flows, team accounts, tenant administration, testimonials, or customer-facing growth funnels.
- Uncontrolled autonomous engagement: no mass replies, mass likes, mass DMs, mass follows, auto-engagement storms, bot-like loops, scraping private data, browser automation to bypass X APIs, or rate-limit bypasses.
- UI, metadata, package names, or copy that references the inspiration product or imitates another product's branding/copy/assets.
- Claims of official X algorithm access. All draft scoring and growth advice must be labeled heuristic unless directly supported by internal metrics.


## Acceptance Summary

The full project is acceptable when it is private, admin-only, design-system-compliant, can connect/sync X, can publish approved/scheduled X content, can write/export blogs, can manage campaigns/experiments, can coach against internal evidence, and can secure/audit every external write action.


## Verified Official References

The implementation should verify against these official references during build because API details can change:

- Anthropic model overview: https://platform.claude.com/docs/en/about-claude/models/overview
- Anthropic adaptive thinking: https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking
- Anthropic Opus 4.7 migration guide: https://platform.claude.com/docs/en/about-claude/models/migration-guide
- Anthropic structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- X OAuth 2.0 Authorization Code with PKCE: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
- X create/edit post endpoint: https://docs.x.com/x-api/posts/create-post
- X delete post endpoint: https://docs.x.com/x-api/posts/delete-post
- X media introduction: https://docs.x.com/x-api/media/introduction
- X metrics: https://docs.x.com/x-api/fundamentals/metrics
- X fields and expansions: https://docs.x.com/x-api/fundamentals/fields
- X developer guidelines: https://docs.x.com/developer-guidelines
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase pgvector: https://supabase.com/docs/guides/database/extensions/pgvector
- Next.js Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Vercel Cron Jobs: https://vercel.com/docs/cron-jobs/manage-cron-jobs
