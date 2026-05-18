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

## Encryption Key Rotation

SCA-534 (S-28). `ENCRYPTION_KEY` encrypts X OAuth access + refresh tokens at
rest (AES-256-GCM, AAD-versioned per `x-${kind}:${userId}:k1`). Two
independent rotation axes are supported, both decrypt-side only — encrypt
always uses the primary key + the current AAD purpose.

**AAD purpose rotation** (most common):

1. Bump the AAD version string at the encrypt call site (e.g. `:k1` →
   `:k2`).
2. Pass `legacyPurposes: ["x-${kind}:${userId}:k1"]` to every `decryptToken`
   call so prior rows decrypt under the old AAD.
3. Roll forward — newly-written rows use the new AAD. Old rows continue to
   decrypt under the legacy AAD until they are naturally re-encrypted (X
   token refresh writes a fresh ciphertext with the new AAD).
4. Once all rows are old enough that they cannot possibly still be on the
   legacy AAD (e.g. X tokens expire and re-refresh every 2 hours, so 24 h
   is conservative), drop `legacyPurposes`.

**Encryption key rotation** (rare; only after key compromise or scheduled
key roll):

1. Generate a new 32+ char high-entropy key. Verify with
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
2. Store the new value as `ENCRYPTION_KEY` in production env. Move the
   prior value into `ENCRYPTION_KEY_PREVIOUS` (or any operator-defined
   slot — `process.env.ENCRYPTION_KEY` is the only one
   `resolveEncryptionSecret` reads by default; legacy values must be
   passed explicitly).
3. At every `decryptToken` call site that handles tokens written before
   the rotation, pass
   `legacyKeys: [process.env.ENCRYPTION_KEY_PREVIOUS!]`.
4. Roll forward — new rows are encrypted under the new key. Old rows
   decrypt under either, transparently to callers.
5. Force a re-encrypt of every X token row by calling
   `refreshStoredXConnection` for each owner (or wait for natural
   refresh) — once every row has been re-written under the new key,
   drop `ENCRYPTION_KEY_PREVIOUS` from env and the `legacyKeys` option
   from call sites.

Combined rotations (key + AAD at the same time) are supported but
expensive on the decrypt path (`|legacyKeys| × |legacyPurposes|`
attempts on miss). Prefer to rotate one axis at a time.

Audit logging of rotation is operator responsibility; record the
rotation start/end timestamps in `audit_logs` via a manual event so a
later forensic review can correlate ciphertext age with the active key
window.

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
