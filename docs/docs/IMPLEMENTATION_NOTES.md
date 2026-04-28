# docs/IMPLEMENTATION_NOTES.md

## Design-System Synthesis

Attached files were read and synthesized. The design system is not a generic dark theme. It has specific constraints:

- Editorial workshop + financial terminal.
- Dark-first warm charcoal and cream ink.
- Persistent paper-grain overlay.
- Fraunces/Public Sans/JetBrains Mono.
- Smallcaps folios and hairline section rules.
- Dense tables, score gauges, metric blocks.
- No emoji, no pill rounding, no gradients except skeleton sweep and gauge fill.

Implementation must preserve this language for publishing, blog, campaign, and growth screens too.

## Current API Verification Notes

- Anthropic: Opus 4.7 model id is `claude-opus-4-7`; adaptive thinking is documented as the supported Opus 4.7 thinking mode; use `thinking: { type: "adaptive" }` and `output_config: { effort: "max" }` for the configured default. Manual `budget_tokens` is not supported on Opus 4.7.
- Anthropic structured outputs: current docs use `output_config.format` and/or strict tool use for schema-constrained JSON.
- X OAuth: X docs list granular scopes including read, write, media, DM, block/mute/list/bookmark/follow scopes. `offline.access` is required for refresh tokens; access tokens otherwise default to two hours.
- X create/edit post: official route is `POST /2/tweets`. It supports reply, media, and quote target fields subject to capability. Quote posting is gated as Enterprise in current docs.
- X delete post: official route is `DELETE /2/tweets/{id}` for an owned post.
- X media: upload returns media ids that are attached to entities such as posts.
- X metrics: public metrics include retweets/reposts, quotes, likes, replies, impressions, bookmarks; private/organic/promoted metrics require user context and are time/capability constrained.
- Supabase: RLS must be enabled on exposed schema tables.
- Vercel: Cron sends `CRON_SECRET` as Authorization header when configured, does not retry failed invocations automatically, and can duplicate/overlap invocations, so jobs must be locked and idempotent.

## Fact / Inference / Speculation Standard

- Fact: directly from internal stored record, deterministic calculation, or official docs.
- Inference: reasoned interpretation from internal evidence.
- Speculation: strategic hypothesis not directly measured.

Every coach/growth/account/analytics narrative must label claims accordingly.

## Implementation Warnings

- Do not import server-only modules into client components.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` through Next public env variables.
- Do not allow cron publishing to bypass approval state.
- Do not store full personal save token after creation.
- Do not assume X fields/scopes are available merely because access is “full”; always check granted scopes/capabilities.
- Do not use AI to make final publish decisions.


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
