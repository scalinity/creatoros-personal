# docs/OPEN_QUESTIONS.md

## Closed Decisions

| Question | Final answer |
|---|---|
| Which exact X API product/access level and scopes will be available? | Assume full X API access is available. The owner has X API v2 pay-per-use and Enterprise-level capabilities where needed. Default to official X API v2 endpoints; Enterprise/Gnip-style endpoints only behind capability flags. |
| Which scopes? | All scopes are available, but least privilege is required. Default request: `tweet.read users.read offline.access like.read bookmark.read follows.read list.read`. Publishing scopes are disabled until publishing mode: `tweet.write`, `media.write` where needed, `tweet.moderate.write` only for explicit moderation features. Optional disabled scopes: `like.write`, `bookmark.write`, `follows.write`, `list.write`, `block.*`, `mute.*`, `dm.*`, `users.email`, `space.read`. |
| Which AI model should be default? | Claude Opus 4.7 with adaptive thinking and max effort. Env: `AI_PROVIDER=anthropic`, `AI_MODEL=claude-opus-4-7`, `AI_THINKING_TYPE=adaptive`, `AI_EFFORT=max`, `AI_MAX_TOKENS=64000`. |
| Should extension endpoint require Supabase session only or personal save token? | Both auth modes exist, but extension calls require `Authorization: Bearer <personal_save_token>`. In-app saves may use Supabase session. Token is scoped to `inspiration:create`, hashed, shown once, revocable, rotatable, rate-limited, and cannot read/update/delete/publish/AI. |

## Remaining Implementation Questions

These do not block the spec but must be decided during implementation:

1. Which exact X Enterprise capabilities are enabled in the production developer account?
2. Will quote-post support be enabled immediately or hidden until `enterprise_quote_post_enabled` is verified?
3. Which storage provider should hold media assets: Supabase Storage, Vercel Blob, or owner-controlled S3-compatible storage?
4. Should blog editor use Markdown textarea first or a structured editor document model from day one?
5. Which export adapter should be built first after core exports: MDX static site, Ghost, WordPress, or personal website webhook?
6. Should follower-growth metrics be imported manually, pulled from an available X endpoint, or both?
7. Should weekly/monthly reviews be generated automatically on cron or manually triggered with cron as optional?
8. Should published test posts be automatically deleted after staging validation, or manually confirmed?

## Documentation Mismatch Notes

- Anthropic docs currently show `output_config={{"effort":"..."}}` for effort and `thinking={{"type":"adaptive"}}` for Opus 4.7. They also document that manual `budget_tokens` is rejected on Opus 4.7. If the SDK parameter shape changes, update `docs/AI_SYSTEM.md`, tests, and env mapping before implementation.
- X docs currently note `quote_tweet_id` on create post requires Enterprise and is not available on self-serve pay-per-use. This spec assumes Enterprise is available but still gates quote posting behind a capability flag.
