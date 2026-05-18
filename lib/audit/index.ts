import "server-only";

export { logAuditEvent, type AuditEventInput } from "./logger";
// SCA-536 (S-30): re-export redactAuditString so callers no longer need to
// deep-import from "./redaction". The barrel is the audit boundary; every
// public redactor belongs here so contributors discover them in one place.
export { redactAuditMetadata, redactAuditString } from "./redaction";
// SCA-481 (W-2): centralised platform-log scrubber for console.error paths.
export { logSafeError, type LogSafeContext } from "./log-safe";
// SCA-525 (S-19): central phase-marker registry to replace per-module
// stringly-typed PHASE constants.
export { PHASES, type PhaseKey, type PhaseMarker } from "./phases";

