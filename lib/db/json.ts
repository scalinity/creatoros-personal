import "server-only";

import type { Json } from "@/types/database";

// SCA-487 (W-8): canonical JSON-shape coercion helpers, consolidated from
// ~8 module-local copies (lib/{publishing, blogs, growth, coach,
// account-research, reply-guy, voice, content, algo-analyzer}/index.ts).
// The drift between copies was silent — coach's asRecord returned
// Record<string, unknown> while every other copy returned Record<string, Json>,
// and asStringArray came in two flavors (whitespace-stripping vs not).
//
// This module exposes BOTH variants of asStringArray under distinct names
// since they encode different intent — strict (`asStringArray`) is for
// human-facing string lists and AI outputs we want sanitized; permissive
// (`safeStringArray`) is for inputs where empty positional entries are
// significant.

// ISO timestamp factory with optional injected clock for tests / dry-runs.
// Callers that need to substitute `Date.now` in test should pass
// `{ now: () => new Date(0) }` from their ServiceOptions shape.
export function nowIso(now?: () => Date): string {
  return (now?.() ?? new Date()).toISOString();
}

// Coerce a JSON value (or `unknown` from an AI output) into a plain
// `Record<string, Json>` map, treating arrays / scalars / null as empty.
export function safeObject(value: unknown): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

// Alias preserved from the prior coach/growth naming.
export const asRecord = safeObject;

// Strict variant — filters out non-string entries AND whitespace-only
// strings. Use for human-facing string lists (tags, IDs, pillar names).
export function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

// Permissive variant — filters only non-string entries; keeps empty
// strings. Use when positional alignment with another array matters
// (e.g. AI output preserves "" for "no value at this index").
export function safeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

// Round-trip through JSON.stringify so the result is structurally a Json
// (no Date instances, no functions, no undefined / Symbol values), not
// just a TS-level cast. Re-exported here as the canonical location and
// also from lib/db/index.ts for backwards compatibility with the L-22
// migration.
export function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? null)) as Json;
}

// Phase-tagged metadata helper used by service modules when writing audit
// trails and AI run logs. The phase string is the IMPLEMENTATION_PLAN
// identifier (e.g. "15-publishing-state-machine-dry-run-and-calendar"),
// stored as the FIRST key by convention so audit queries can use
// `metadata->>phase = ...` cheaply.
export function metadataWithPhase(
  phase: string,
  metadata: Record<string, Json> = {},
): Record<string, Json> {
  return {
    phase,
    ...metadata,
  } satisfies Record<string, Json>;
}

// Strips markdown formatting for plaintext previews and search snippets.
// Preserves the visible content: links collapse to their text, images and
// code blocks collapse to spaces. Not a sanitizer — only for display.
export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]+\]\([^)]*\)/g, (match) => match.replace(/^\[|\]\([^)]*\)$/g, ""))
    .replace(/[#>*_~\-]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
