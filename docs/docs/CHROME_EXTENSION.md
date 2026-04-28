# docs/CHROME_EXTENSION.md

## Purpose

The extension-compatible system allows the owner to save inspiration posts from X into CreatorOS Personal without granting broad app access.

## Auth Decision

Two auth modes exist:

- In-app saves: Supabase session.
- Extension saves: `Authorization: Bearer <personal_save_token>` required.

The personal save token:

- Scope: `inspiration:create` only by default.
- Stored hashed with `PERSONAL_SAVE_TOKEN_PEPPER`.
- Shown once.
- Revocable.
- Rotatable.
- Rate-limited.
- Cannot read/update/delete data.
- Cannot publish.
- Cannot trigger heavy AI endpoints.

## Endpoint

`POST /api/inspiration/save`

Headers:

- `Authorization: Bearer <personal_save_token>` for extension path.
- `Content-Type: application/json`.

Payload:

- `post_url`
- `post_id`
- `author_username`
- `author_display_name`
- `text`
- `captured_at`
- `tags?`
- `notes?`

Response:

- Created inspiration id.
- Duplicate status if already saved.
- No other records.

## Extension Scaffold

Future files:

```text
extension/
  manifest.json
  src/content-script.ts
  src/popup.tsx
  src/options.tsx
  src/api.ts
```

Features:

- Save current/selected X post.
- Popup token setup.
- Minimal status indicator.
- No reading app data.
- No publishing.
- No AI calls.

## Security

- Restrict CORS where possible.
- Rate limit by token hash and IP hash.
- Token prefix shown in settings for identification.
- Token full value never shown after creation.
- Revoked token rejects immediately.
- Audit token create/revoke/use failures.

## Acceptance Criteria

- Extension endpoint works with personal token.
- Supabase session alone is not sufficient for extension saves.
- Token can create inspiration only.
- Token cannot publish, transform, read, update, or delete.
