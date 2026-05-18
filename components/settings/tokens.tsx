"use client";

import { useActionState } from "react";

import { Badge, Button, Card, Input, KeyValueRow, RuleHeader, cn } from "@/components/design-system";
import type { PersonalSaveTokenRecord } from "@/lib/tokens/personal-save-tokens";

export type TokenSettingsActionState = {
  message: string;
  ok: boolean;
  rawToken?: string;
  tokenPrefix?: string;
} | null;

export type TokenSettingsAction = (state: TokenSettingsActionState, formData: FormData) => Promise<TokenSettingsActionState>;

export type TokenSettingsClientProps = {
  action: TokenSettingsAction;
  initialState?: TokenSettingsActionState;
  tokens: PersonalSaveTokenRecord[];
};

function formatDate(value: null | string | undefined) {
  if (!value) return "never";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "never";
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function statusVariant(status: string) {
  if (status === "active") return "success";
  if (status === "revoked" || status === "expired") return "danger";
  return "outline";
}

function TokenDisclosure({ state }: { state: TokenSettingsActionState }) {
  if (!state) return null;

  return (
    <div className={cn("token-action-state", !state.ok && "token-action-state-danger")}>
      <p role="status">{state.message}</p>
      {state.rawToken ? (
        <div aria-label="Shown once personal save token" aria-live="off" className="token-once-box">
          <span className="smallcaps">Shown once</span>
          <code>{state.rawToken}</code>
        </div>
      ) : null}
    </div>
  );
}

function CreateTokenForm({ formAction, pending }: { formAction: (formData: FormData) => void; pending: boolean }) {
  return (
    <Card className="token-create" variant="inset">
      <Card.Body>
        <form action={formAction} className="token-form">
          <input name="operation" type="hidden" value="create" />
          <RuleHeader folio="§ 01" label="Issue Token" sub="inspiration:create" />
          <Input label="Name" name="name" placeholder="Chrome extension" required />
          <div className="token-form-grid">
            <Input defaultValue="30" label="Hourly limit" min={1} max={240} name="rate_limit_per_hour" type="number" />
            <Input label="Expires at" name="expires_at" type="datetime-local" />
          </div>
          <Button disabled={pending} loading={pending} size="sm" type="submit">
            Create token
          </Button>
        </form>
      </Card.Body>
    </Card>
  );
}

function TokenRow({ formAction, pending, token }: { formAction: (formData: FormData) => void; pending: boolean; token: PersonalSaveTokenRecord }) {
  const active = token.status === "active";
  const actionLabel = `${token.name} ${token.tokenPrefix}`;

  return (
    <article className="token-row">
      <div className="token-row-head">
        <div>
          <h3>{token.name}</h3>
          <p className="mono">{token.tokenPrefix}</p>
        </div>
        <Badge variant={statusVariant(token.status)}>{token.status}</Badge>
      </div>
      <div className="token-row-grid">
        <KeyValueRow label="Scope" value={token.scopes.join(", ")} />
        <KeyValueRow label="Limit" mono value={`${token.rateLimitPerHour}/hour`} />
        <KeyValueRow label="Last used" mono value={formatDate(token.lastUsedAt)} />
        <KeyValueRow label="Expires" mono value={formatDate(token.expiresAt)} />
      </div>
      <div className="token-actions">
        <form action={formAction}>
          <input name="operation" type="hidden" value="rotate" />
          <input name="id" type="hidden" value={token.id} />
          <Button aria-label={`Rotate token ${actionLabel}`} disabled={pending} loading={pending} size="sm" type="submit" variant="secondary">
            Rotate
          </Button>
        </form>
        <form action={formAction}>
          <input name="operation" type="hidden" value="revoke" />
          <input name="id" type="hidden" value={token.id} />
          <input name="reason" type="hidden" value="revoked from settings" />
          <Button aria-label={`Revoke token ${actionLabel}`} disabled={!active || pending} loading={pending} size="sm" type="submit" variant="destructive">
            Revoke
          </Button>
        </form>
      </div>
    </article>
  );
}

export function TokenSettingsClient({ action, initialState = null, tokens }: TokenSettingsClientProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <section className="token-settings-panel" aria-label="Personal save tokens">
      <TokenDisclosure state={state} />
      <CreateTokenForm formAction={formAction} pending={pending} />
      <Card>
        <Card.Header>
          <RuleHeader folio="§ 02" label="Issued Tokens" sub="hash-only storage" />
        </Card.Header>
        <Card.Body>
          {tokens.length === 0 ? (
            <p className="token-muted">No personal save tokens yet.</p>
          ) : (
            <div className="token-list">
              {tokens.map((token) => (
                <TokenRow formAction={formAction} key={token.id} pending={pending} token={token} />
              ))}
            </div>
          )}
        </Card.Body>
      </Card>
    </section>
  );
}
