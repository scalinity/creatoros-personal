import "server-only";

export { logAuditEvent, type AuditEventInput } from "./logger";
// SCA-536 (S-30): re-export redactAuditString so callers no longer need to
// deep-import from "./redaction". The barrel is the audit boundary; every
// public redactor belongs here so contributors discover them in one place.
export { redactAuditMetadata, redactAuditString } from "./redaction";
// SCA-481 (W-2): centralised platform-log scrubber for console.error paths.
export { logSafeError, type LogSafeContext } from "./log-safe";

