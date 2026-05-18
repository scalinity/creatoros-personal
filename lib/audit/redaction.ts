// Pure data redaction helpers — no I/O, safe to import from any runtime. The
// `lib/audit/index.ts` barrel and `lib/audit/logger.ts` modules that DO touch
// secrets and the service-role client carry the `server-only` marker instead.

import type { Json } from "@/types/database";

const sensitiveKeyPattern = /authorization|cookie|credential|encryption|key|oauth|password|pepper|secret|session|token/i;
const emailKeyPattern = /email/i;
const emailValuePattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const secretValuePatterns = [
  /\bsk-ant-(?:api03-)?[A-Za-z0-9_-]{8,}\b/i,
  /\b(?:sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9_]{12,}|AKIA[A-Z0-9]{12,}|Bearer\s+[A-Za-z0-9._~+/-]+=*)\b/i,
  /\b(?:password|passwd|pwd|secret|client_secret|access_token|refresh_token|api[_-]?key|token)=([^\s&]+)/i,
  /\b(?:postgres(?:ql)?|mysql|redis):\/\/[^\s]+/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:ya29\.|xox[baprs]-|cos_live_)[A-Za-z0-9._~+/-]{8,}\b/i,
  /\bpst_v1\$[A-Za-z0-9_-]{8,}\b/,
  // SCA-521 (S-15): coverage gaps surfaced in the SA1 review.
  /\bgithub_pat_[A-Za-z0-9_]{22,}\b/,
  /\bglpat-[A-Za-z0-9\-_]{20,}\b/,
  /\bxapp-[A-Za-z0-9-]{10,}\b/,
];
const maxDepth = 6;
const maxStringLength = 500;

function redactString(value: string): string {
  if (emailValuePattern.test(value) || secretValuePatterns.some((pattern) => pattern.test(value))) {
    return "[redacted]";
  }

  if (value.length > maxStringLength) {
    return `${value.slice(0, maxStringLength)}[truncated]`;
  }

  return value;
}

function redactValue(value: unknown, key = "", depth = 0): Json {
  if (sensitiveKeyPattern.test(key) || emailKeyPattern.test(key)) {
    return "[redacted]";
  }

  if (depth > maxDepth) {
    return "[truncated]";
  }

  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, key, depth + 1));
  }

  if (typeof value === "object" && value) {
    const redacted: Record<string, Json> = {};

    for (const [childKey, childValue] of Object.entries(value)) {
      redacted[childKey] = redactValue(childValue, childKey, depth + 1);
    }

    return redacted;
  }

  return String(value);
}

export function redactAuditMetadata(metadata: unknown): Json {
  return redactValue(metadata);
}

export function redactAuditString(value: unknown): string {
  const redacted = redactValue({ value });
  if (redacted && typeof redacted === "object" && !Array.isArray(redacted) && typeof redacted.value === "string") {
    return redacted.value;
  }

  return "[redacted]";
}