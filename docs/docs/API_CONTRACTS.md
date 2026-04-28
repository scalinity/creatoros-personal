# docs/API_CONTRACTS.md

## Global Contract Rules

All route handlers/server actions must:

- Validate input with Zod.
- Authenticate session and check `ADMIN_EMAILS`, except cron routes that verify `CRON_SECRET` and extension save-token create-only route.
- Enforce ownership and RLS.
- Return stable JSON envelopes: `ok`, `data`, `error`, `request_id`.
- Never return tokens, provider keys, service-role keys, decrypted secrets, raw auth headers, or full unredacted provider payloads.
- Rate-limit expensive or external-write endpoints.
- Audit external writes, approvals, token operations, exports/deletes, settings, syncs, and denied access.

Common errors: `unauthenticated`, `access_denied`, `validation_error`, `rate_limited`, `not_found`, `conflict`, `missing_scope`, `capability_disabled`, `x_api_error`, `ai_invalid_output`, `provider_unavailable`, `cron_secret_invalid`, `internal_error`.


## Auth

| Method | Route | Purpose | Input schema | Output | Auth | Rate limit | Side effects | Audit |
|---|---|---|---|---|---|---|---|---|
| GET | /api/auth/session | Return current authenticated/admin status. | none | session profile | optional | none | updates last_seen for admin | admin_access_denied if needed |

## X OAuth and Sync

| Method | Route | Purpose | Input schema | Output | Auth | Rate limit | Side effects | Audit |
|---|---|---|---|---|---|---|---|---|
| GET | /api/x/oauth/start | Start least-privilege OAuth flow. | return_to?, mode=read|publishing | redirect | admin | 5/min | stores state/PKCE | x_connect_started |
| GET | /api/x/oauth/callback | Complete OAuth and store encrypted tokens. | code,state,error? | redirect | admin/state | 10/min | upserts x_connections | x_connected or x_connect_failed |
| POST | /api/x/scope-escalation | Request publishing scopes only when publishing enabled. | requested_scopes[], reason | authorization redirect | admin | 3/hour | updates pending scope request | x_scope_escalation_started |
| POST | /api/x/disconnect | Disconnect and null token material. | delete_imported_posts?, delete_snapshots? | status | admin | 10/min | nulls tokens | x_disconnected |
| POST | /api/x/sync | Manual sync posts/metrics. | mode,max_posts,include_metrics | sync_job | admin | 5/hour | upserts posts/snapshots | sync_started/succeeded/failed |
| GET | /api/cron/x-sync | Scheduled sync. | none | job summary | cron secret | cron | runs sync jobs | sync_* |

## Publishing

| Method | Route | Purpose | Input schema | Output | Auth | Rate limit | Side effects | Audit |
|---|---|---|---|---|---|---|---|---|
| POST | /api/publishing/drafts | Create publishable draft. | content_type,text/thread_items,source,campaign_id?,experiment_id? | draft | admin | 60/min | creates draft | publishing_draft_created |
| PATCH | /api/publishing/drafts/{id} | Edit draft/status metadata. | mutable draft fields | draft | admin | 60/min | updates draft | publishing_draft_updated |
| POST | /api/publishing/drafts/{id}/approve | Approve exact draft for publishing/scheduling. | confirmation,payload_hash | approved draft | admin | 30/min | sets approved_at | publishing_draft_approved |
| POST | /api/publishing/drafts/{id}/schedule | Schedule approved draft. | scheduled_for,timezone | scheduled_post | admin | 30/min | creates scheduled row/calendar item | publishing_scheduled |
| POST | /api/publishing/drafts/{id}/publish | Immediate publish after explicit approval. | confirmation,payload_hash,dry_run? | published_post or job | admin | 10/hour | calls X when dry_run false | x_publish_* |
| POST | /api/publishing/jobs/{id}/retry | Retry safe failed publish. | confirmation | job | admin | 10/hour | creates/updates job | publishing_retry |
| POST | /api/publishing/jobs/{id}/cancel | Cancel queued/scheduled job. | reason | job | admin | 30/min | marks canceled | publishing_canceled |
| GET | /api/cron/publish | Publish due approved scheduled drafts. | none | job summary | cron secret | cron | publishes due items | scheduled_publish_* |
| POST | /api/x/publish/post | Low-level X single-post publish service route. | publishing_draft_id,dry_run? | result | admin/internal | 10/hour | X POST /2/tweets | x_post_publish |
| POST | /api/x/publish/thread | Publish thread sequentially. | publishing_draft_id,dry_run? | result | admin/internal | 5/hour | multiple X creates | x_thread_publish |
| POST | /api/x/publish/reply | Publish approved reply. | publishing_draft_id,dry_run? | result | admin/internal | 20/hour | X create with reply | x_reply_publish |
| POST | /api/x/publish/quote | Publish approved quote post if capability enabled. | publishing_draft_id,dry_run? | result | admin/internal | 10/hour | X create with quote_tweet_id | x_quote_publish |

## Content and Blogs

| Method | Route | Purpose | Input schema | Output | Auth | Rate limit | Side effects | Audit |
|---|---|---|---|---|---|---|---|---|
| POST | /api/posts/import | Manual CSV/JSON/single import. | mode,payload,is_owner_post | row results | admin | 10/min | upserts posts | import_* |
| PATCH | /api/posts/{id} | Update post/metrics/categories. | fields,metrics | post | admin | 60/min | updates/snapshot | post_updated |
| POST | /api/ideas | Create idea. | title,raw_text,tags,status,source | idea | admin | 60/min | creates idea | idea_created |
| PATCH | /api/ideas/{id} | Update idea. | mutable fields | idea | admin | 60/min | updates idea | idea_updated |
| POST | /api/generated-outputs | Save generated output. | type,text,variants,input | output | admin | 60/min | creates output | generated_output_saved |
| POST | /api/blogs | Create blog. | title,source,status | blog | admin | 30/min | creates blog/version | blog_created |
| PATCH | /api/blogs/{id} | Edit blog. | title,markdown,metadata,status | blog | admin | 60/min | creates version when content changes | blog_updated |
| POST | /api/blogs/{id}/export | Export blog. | format markdown|html|json|mdx | export | admin | 30/hour | creates blog_export | blog_exported |

## AI

| Method | Route | Purpose | Input schema | Output | Auth | Rate limit | Side effects | Audit |
|---|---|---|---|---|---|---|---|---|
| POST | /api/ai/algo-analysis | Analyze draft heuristically. | draft_text,content_type,use_voice_profile | analysis | admin | AI limit | creates report | ai_job_* |
| POST | /api/ai/brain-dump | Generate content pack. | raw_text,voice_mode | brain_dump | admin | AI limit | saves raw/output | ai_job_* |
| POST | /api/ai/coach | Coach chat with evidence. | message,filters,stream | coach output | admin | AI limit | creates report | ai_job_* |
| POST | /api/ai/account-research | Research account/posts. | username?,pasted_posts?,target_account_id? | report | admin | AI limit | creates report | ai_job_* |
| POST | /api/ai/reply | Generate reply drafts. | original_post_text,reply_type,count | reply drafts | admin | AI limit | creates drafts optional | ai_job_* |
| POST | /api/ai/blog-writer | Generate outline/full blog/SEO. | source,mode,voice_profile | blog draft | admin | AI limit | creates blog/version | ai_job_* |
| POST | /api/ai/growth-review | Weekly/monthly strategy review. | period,type | review | admin | AI limit | creates review | ai_job_* |
| POST | /api/voice-profile/generate | Generate voice profile. | post_ids?,blog_ids?,set_active | voice profile | admin | 5/day | creates profile | voice_profile_generated |
| POST | /api/embeddings/generate | Refresh embeddings. | entity_type?,entity_ids?,refresh_all? | counts | admin | 5/hour | upserts embeddings | embedding_refresh |

## Growth

| Method | Route | Purpose | Input schema | Output | Auth | Rate limit | Side effects | Audit |
|---|---|---|---|---|---|---|---|---|
| POST | /api/campaigns | Create campaign. | name,objective,pillar,hypothesis,dates | campaign | admin | 60/min | creates campaign | campaign_created |
| PATCH | /api/campaigns/{id} | Update campaign. | mutable fields | campaign | admin | 60/min | updates campaign | campaign_updated |
| POST | /api/experiments | Create experiment. | type,title,hypothesis,dates,metric | experiment | admin | 60/min | creates experiment | experiment_created |
| POST | /api/experiments/{id}/result | Record/analyze result. | metrics,decision | result | admin | 30/hour | creates result | experiment_result |

## Inspiration and Extension

| Method | Route | Purpose | Input schema | Output | Auth | Rate limit | Side effects | Audit |
|---|---|---|---|---|---|---|---|---|
| POST | /api/inspiration/save | Save inspiration in app or extension. | post_url,post_id,author,text,tags,notes | inspiration | session or save token | 30/hour token | creates only | inspiration_saved |
| POST | /api/inspiration/transform | Transform inspiration. | inspiration_id,mode,count,use_voice | outputs+risk | admin | AI limit | updates inspiration | ai_job_* |
| POST | /api/settings/tokens | Create personal save token. | name,expires_at?,rate_limit? | shown-once token | admin | 10/day | stores hash | token_created |
| DELETE | /api/settings/tokens/{id} | Revoke personal save token. | reason | revoked | admin | 30/min | revokes token | token_revoked |

## System

| Method | Route | Purpose | Input schema | Output | Auth | Rate limit | Side effects | Audit |
|---|---|---|---|---|---|---|---|---|
| PATCH | /api/settings | Update settings. | mutable settings | settings | admin | 30/min | updates settings | settings_changed |
| GET | /api/diagnostics | Sanitized diagnostics. | none | diagnostics | admin | 30/min | none | none |
| GET | /api/data/export | Export data. | format,include_logs | file | admin | 3/day | audit | data_exported |
| DELETE | /api/data/delete | Delete owner data. | confirmation,delete_auth_user? | result | admin | 1/day | hard delete | data_deleted |


## Publishing Dry Run Contract

Every publish route accepts `dry_run=true`. Dry run must:

- Validate draft status and scopes.
- Build exact X payload.
- Run duplicate/similarity/risk checks.
- Check media readiness.
- Check rate-limit metadata where available.
- Not call external write endpoints.
- Return the payload preview, required scopes, warnings, and publish eligibility.

## Zod Schema Requirements

- Metrics: non-negative integers or null.
- Text: required, trimmed, maximum configured by content type and current X capability.
- Thread items: ordered array, non-empty, each item validated independently.
- Schedule time: future timestamp, timezone required, no duplicate job for same draft.
- OAuth state: exact match, short TTL.
- Personal save token: bearer token only, create inspiration only.

## Acceptance Criteria

- Every requested route/action exists in implementation.
- AI and publish routes are mocked in tests.
- Dry run tests prove no external write occurs.
- All external write actions produce audit rows.
