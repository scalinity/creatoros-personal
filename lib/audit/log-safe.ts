// SCA-481 (W-2): centralised platform-log scrubber for console.error paths.
// Per CLAUDE.md §28.7 the audit_logs path already runs redactAuditMetadata /
// redactAuditString, but console.error calls in lib/{audit,ai,x,exports,...}
// previously logged raw error.message directly to stdout. On Vercel / CloudWatch
// / Datadog those streams receive whatever the upstream provider (Anthropic,
// X, Postgres, OAuth) echoed back — token fragments, JWTs, connection strings,
// PII. The audit-layer scrub never applied to platform logs.
//
// This module is pure (no I/O, no `server-only`) so it can be imported from
// any runtime including test mocks. The redactor lives in lib/audit/redaction
// alongside the audit-row redactor; we share the same pattern set so a new
// secret format only needs one home.

import { redactAuditString } from "./redaction";

const DEFAULT_PLATFORM_LOG_LIMIT = 500;

export type LogSafeContext = Record<string, unknown>;

function safeReason(error: unknown, limit: number) {
  if (error instanceof Error) {
    return redactAuditString(error.message).slice(0, limit);
  }
  if (typeof error === "string") {
    return redactAuditString(error).slice(0, limit);
  }
  if (error && typeof error === "object") {
    try {
      return redactAuditString(JSON.stringify(error)).slice(0, limit);
    } catch {
      return "[unredactable error]";
    }
  }
  return "unknown";
}

function safeContext(context: LogSafeContext | undefined, limit: number) {
  if (!context) return undefined;
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === "string") {
      scrubbed[key] = redactAuditString(value).slice(0, limit);
    } else {
      scrubbed[key] = value;
    }
  }
  return scrubbed;
}

export function logSafeError(label: string, error: unknown, context?: LogSafeContext, limit = DEFAULT_PLATFORM_LOG_LIMIT) {
  const reason = safeReason(error, limit);
  const ctx = safeContext(context, limit);
  if (ctx) {
    console.error(label, { reason, ...ctx });
  } else {
    console.error(label, { reason });
  }
}
