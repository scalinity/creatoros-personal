# docs/SECURITY.md

## Security Model

CreatorOS Personal is private, but it has high-risk capabilities: X publishing, token storage, AI context processing, and data export/delete. Security must be production-grade.

## Auth and Allowlist

- Supabase Auth for identity.
- `ADMIN_EMAILS` allowlist for admission.
- `/login` only public UI.
- All routes/actions check admin.
- Non-admin denied and audited.
- RLS enforces ownership.

## Secrets

Never expose to browser:

- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `X_CLIENT_SECRET`
- `ENCRYPTION_KEY`
- `CRON_SECRET`
- `PERSONAL_SAVE_TOKEN_PEPPER`
- X access/refresh tokens.

Diagnostics show present/missing only.

## X Token Security

- Encrypt OAuth tokens at rest.
- Decrypt only in X service.
- Null tokens on disconnect.
- Audit refresh failures.
- Do not store tokens in prompt runs, audit metadata, client props, or logs.

## Personal Save Tokens

- Generate high entropy token.
- Show once.
- Store hash + prefix only.
- Hash includes `PERSONAL_SAVE_TOKEN_PEPPER`.
- Scope-limited to `inspiration:create`.
- Revocable/rotatable.
- Rate-limited.
- No read/update/delete/publish/AI.

## Publishing Protection

- AI cannot approve.
- Owner approval required before publishing/scheduling.
- Approval binds exact payload hash.
- Editing invalidates approval.
- Immediate publish requires confirmation.
- Cron publishes only approved due drafts.
- Every external write audited.
- Dry run available and tested.
- Idempotency keys prevent duplicate posts.

## Prompt Injection Protection

Imported content, target account posts, inspiration, and pasted text are untrusted data.

Rules:

- Wrap external content in data containers.
- Never let imported content override system/developer instructions.
- Do not pass secrets into prompts.
- Validate AI outputs before actions.
- AI outputs cannot call publishing services directly.

## RLS

- RLS enabled on every exposed table.
- Policies restrict `user_id = auth.uid()`.
- Embedding search functions filter user id.
- Service role only server-side.

## Rate Limiting

Protect:

- AI endpoints.
- Publishing endpoints.
- OAuth start/scope escalation.
- Sync/import.
- Data export/delete.
- Extension endpoint.
- Cron routes by secret.

## Audit Events

Required:

- Login success/denied.
- Admin access denied.
- X connect/disconnect/scope escalation/token refresh failure.
- Sync/import.
- Publishing approval/schedule/publish/retry/cancel/failure/delete.
- AI job start/success/failure.
- Settings changes.
- Token create/revoke/use failure.
- Data export/delete.

## Data Export/Delete

- Export excludes decrypted tokens/secrets.
- Delete requires exact confirmation.
- Delete token material first.
- Then hard-delete owner data in dependency order.
- Audit before deletion.

## Acceptance Criteria

- Browser bundle contains no server secrets.
- Plaintext X tokens never stored.
- Personal save tokens are hashed.
- Publishing cannot happen without approval.
- Cron rejects invalid secret.
- RLS tests pass.
