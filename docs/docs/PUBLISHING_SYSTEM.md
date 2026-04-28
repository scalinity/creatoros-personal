# docs/PUBLISHING_SYSTEM.md

## Purpose

The Publishing System is the controlled state machine that turns ideas, AI generations, blogs, brain dumps, replies, quote posts, and campaign items into approved, scheduled, auditable external X writes.

## State Machine

```text
draft
  -> ai_generated
  -> owner_edited
  -> analyzed
  -> approved
  -> scheduled
  -> publishing
  -> published

Any non-terminal state -> archived
scheduled -> canceled
publishing -> failed
failed -> approved | canceled | archived
published -> deleted_external? | archived_local
```

Rules:

- AI may create `ai_generated` drafts.
- Owner edits move draft to `owner_edited`.
- Analysis creates an `algo_analysis_report` but does not approve.
- Owner approval is explicit and stores payload hash.
- Scheduled posts require `approved` state.
- Cron publishes only due approved scheduled rows.
- Immediate publish requires explicit confirmation.
- Failed jobs preserve draft and failure reason.

## Content Types

- Single X post.
- X thread.
- X reply.
- Quote post.
- Blog post.
- Blog-to-X thread.
- Blog-to-X post series.
- Campaign sequence.

## Approval Payload

Before approval/publish, show:

- X account username/display name/avatar.
- Content type.
- Exact text/thread items.
- Reply target or quote target if applicable.
- Media filenames, dimensions, alt text, upload status.
- Required scopes.
- Capability flags.
- Algo score.
- Duplicate/similarity/plagiarism risk.
- Spam/engagement-risk warnings.
- Scheduled time and timezone if scheduling.
- Campaign/experiment links.

The owner must approve the exact payload hash. Editing content invalidates approval.

## Scheduling

- Store timezone with every scheduled item.
- Calendar displays owner timezone by default.
- Cron operates in UTC and converts schedule times safely.
- If due job is rate-limited, defer to reset time and show warning.
- If due job lacks scope/capability, fail safely and do not publish.
- If scheduled draft is edited, schedule remains but approval resets; it will not publish until re-approved.

## Duplicate and Similarity Guardrails

Before approval:

- Compare against recent owner posts/drafts by normalized text hash.
- Compare inspiration-derived drafts against source text using n-gram/embedding similarity.
- Flag repeated hooks/content pillars if campaign requires diversity.
- Allow override only with explicit owner confirmation and stored reason.

## Retry Logic

Retry allowed only if:

- Failure is marked retryable.
- Draft remains approved.
- Payload hash unchanged.
- Rate-limit reset passed.
- Idempotency check indicates no successful publish already occurred.

Retry not allowed for:

- Missing scope.
- Capability disabled.
- Deleted/revoked connection.
- High plagiarism/similarity risk unresolved.
- Thread partial failure without owner decision.

## Post-Publish Reconciliation

On successful publish:

- Create `published_posts`.
- Upsert `posts` for owner history.
- Create initial metric snapshot.
- Link `publishing_draft_id` to platform post id(s).
- Mark calendar item published.
- Update campaign/experiment items.
- Audit success.

## Manual Override

Owner can mark content as manually posted externally.

Required fields:

- URL or platform post id.
- Published timestamp.
- Content text confirmation.
- Optional metrics.

Manual mark creates `published_posts.published_via=manual` and links archive rows.

## Failure Modes

| Failure | Handling |
|---|---|
| X 401 | Refresh token once; otherwise mark connection revoked/degraded. |
| X 403 | Mark missing scope/capability. |
| X 429 | Defer until reset. |
| X 5xx | Retry bounded; store failure. |
| Media upload failure | Block publish or require explicit publish-without-media confirmation. |
| Thread partial success | Store published ids; require owner decision. |
| Client double-submit | Idempotency key prevents duplicate external write. |

## Acceptance Criteria

- No draft publishes without owner approval.
- Scheduled cron publishes only approved due drafts.
- Every write action is audited.
- Failed publishing jobs are visible and retryable only when safe.
- Published content is reconciled into post history and campaign/experiment tracking.
