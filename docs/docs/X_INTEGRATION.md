# docs/X_INTEGRATION.md

## X Access Decision

Assume the owner has full X API access: X API v2 pay-per-use and Enterprise-level/custom capabilities where needed. Implementation must still use least privilege, capability flags, and official endpoints first.

## OAuth Scopes

Default read-centric request:

- `tweet.read`
- `users.read`
- `offline.access`
- `like.read`
- `bookmark.read`
- `follows.read`
- `list.read`

Publishing mode may request only when explicitly enabled:

- `tweet.write`
- `media.write` when media upload/attach is used.
- `tweet.moderate.write` only for supported moderation features.

Disabled-by-default optional scopes:

- `like.write`, `bookmark.write`, `follows.write`, `list.write`, `block.read`, `block.write`, `mute.read`, `mute.write`, `dm.read`, `dm.write`, `users.email`, `space.read`.

X documents granular OAuth scopes and notes that `offline.access` is required for refresh-token access; without it, OAuth 2.0 PKCE access tokens default to two hours.

## OAuth Flow

1. Admin opens `/settings/x-connection`.
2. Connect with read scopes.
3. Server creates state and PKCE verifier.
4. X authorization.
5. Callback validates state, exchanges code, encrypts tokens.
6. Store scopes and capabilities.
7. Capability check runs.
8. Publishing mode separate CTA triggers scope escalation for write scopes.

## Token Handling

- AES-256-GCM or equivalent authenticated encryption.
- Store key version, iv, ciphertext, auth tag.
- Never log tokens.
- Refresh before expiry.
- On refresh failure, mark degraded/revoked.
- On disconnect, null encrypted token columns.

## Read Sync

Store when available:

- X user id, username, display name, avatar URL.
- Post id, URL, text, created_at.
- Public metrics: likes, replies, reposts/retweets, quotes, bookmarks, impressions.
- Non-public/organic/promoted metrics for owned posts where available.
- Media metadata.
- Language.
- Referenced/replied/quoted metadata.
- Raw API payload JSONB.

Field rules:

- Request `tweet.fields=created_at,public_metrics,author_id,conversation_id,in_reply_to_user_id,referenced_tweets,attachments,lang,possibly_sensitive` as supported.
- Request expansions and `user.fields`/`media.fields` explicitly.
- Missing fields mean null/unknown, not failure.

## Write Capabilities

Supported with explicit owner approval:

- Create single post.
- Create thread.
- Create reply.
- Create quote post when capability enabled.
- Upload/attach media when `media.write` and media endpoint capability are enabled.
- Delete own post if supported and explicitly confirmed.
- Publish scheduled approved draft.
- Retry failed publish job when safe.
- Mark externally posted content as published manually.

X’s current create/edit endpoint is `POST /2/tweets`, supports fields such as `text`, `reply`, `quote_tweet_id`, and `media`; docs note quote-posting with `quote_tweet_id` requires Enterprise and is not available on self-serve pay-per-use tiers. This app assumes Enterprise is available but must still gate quote posting behind `enterprise_quote_post_enabled`.

## Thread Publishing

- Publish root post first.
- Publish subsequent posts as replies to previous or root according to configured thread mode.
- Store each platform id.
- If partial failure occurs, mark `partial_failure`; do not blindly retry from root.
- Owner must decide whether to continue, repair, or mark partial as final.

## Media

- Use official media upload endpoint when capability enabled.
- Store media metadata in `media_assets`.
- Upload before publishing.
- Attach returned `media_id` to post payload.
- Size restrictions are enforced by current X docs/capability: image 5MB, GIF 15MB, video 512MB for configured categories unless docs change.
- Media upload failure blocks publish unless owner confirms publish without media.

## Rate Limits

- Track X rate-limit headers when available.
- Store reset in job rows.
- Queue/defer scheduled publishing if rate-limited.
- Do not retry tight loops.
- Dashboard shows reset timestamp.

## Fallback Import

Manual paths remain:

- Paste URL.
- Paste text.
- Enter metrics.
- CSV.
- JSON.
- Archive-like export.
- Manual target account posts.
- Manual inspiration posts.
- Manual mark as externally published.

## Safety Prohibitions

- No mass replies.
- No mass likes/follows/DMs.
- No autonomous engagement loops.
- No scraping private data.
- No rate-limit bypass.
- No browser automation to simulate user posting.

## Audit Events

- `x_connect_started`
- `x_connected`
- `x_scope_escalation_started`
- `x_scope_escalation_completed`
- `x_disconnected`
- `x_token_refresh_failed`
- `x_sync_started/succeeded/failed`
- `x_publish_requested`
- `x_publish_succeeded`
- `x_publish_failed`
- `x_post_deleted`


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
