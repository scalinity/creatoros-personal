// This module is intentionally runtime-agnostic (no `import "server-only"`)
// because it is pure JSON repair + Zod validation with no I/O. All current
// importers are themselves server-only modules (`lib/ai/run.ts`, the provider
// implementations, and `lib/<domain>/index.ts` files); a future client import
// would not crash the build but would inflate the client bundle. Prefer
// importing through `@/lib/ai` (the server-only barrel) when adding new
// callers so the dependency direction stays clean.

import type { ZodTypeAny, z } from "zod";

export class AiStructuredOutputError extends Error {
  readonly code = "ai_invalid_output";
  readonly details: unknown;
  // H-8: keep the raw provider text (truncated) attached to the error so the
  // failure path in lib/ai/run.ts can persist it on the failed prompt_run row,
  // making malformed-JSON failures debuggable instead of silent.
  readonly rawSample: null | string;

  constructor(message: string, details?: unknown, rawSample?: null | string) {
    super(`ai_invalid_output: ${message}`);
    this.name = "AiStructuredOutputError";
    this.details = details;
    this.rawSample = rawSample ?? null;
  }
}

function stripMarkdownFence(input: string) {
  const trimmed = input.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);

  return fenceMatch?.[1]?.trim() ?? trimmed;
}

function sliceLikelyJson(input: string) {
  const stripped = stripMarkdownFence(input);
  const firstObject = stripped.indexOf("{");
  const firstArray = stripped.indexOf("[");
  const starts = [firstObject, firstArray].filter((index) => index >= 0);

  if (starts.length === 0) {
    return stripped;
  }

  const start = Math.min(...starts);
  const lastObject = stripped.lastIndexOf("}");
  const lastArray = stripped.lastIndexOf("]");
  const end = Math.max(lastObject, lastArray);

  if (end <= start) {
    return stripped;
  }

  return stripped.slice(start, end + 1);
}

function repairCommonJsonSyntax(input: string) {
  return input
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
}

// M-12: brace-balancing recovery for truncated JSON. When the model hits
// max_tokens mid-output, trailing braces/brackets are missing and parsing
// fails. Walk the string respecting string/escape state, then close unbalanced
// openers. Best-effort: it cannot reconstruct missing values, but it allows
// partial-but-syntactically-valid output to parse so callers can decide
// whether to use the partial result or fail loudly.
const BALANCE_BRACES_MAX_INPUT_BYTES = 200_000;
function balanceBraces(input: string): null | string {
  // Refuse repair on pathologically large inputs. The walk itself is O(n) but
  // an Anthropic max-tokens response of 250KB+ would re-iterate after each
  // earlier parse pass; a hard cap keeps the recovery cheap.
  if (input.length > BALANCE_BRACES_MAX_INPUT_BYTES) {
    return null;
  }

  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (const char of input) {
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{" || char === "[") {
      stack.push(char);
    } else if (char === "}") {
      if (stack[stack.length - 1] === "{") stack.pop();
      else return null;
    } else if (char === "]") {
      if (stack[stack.length - 1] === "[") stack.pop();
      else return null;
    }
  }

  if (stack.length === 0 && !inString && !escape) {
    return input;
  }

  let repaired = input;
  // Truncated mid-escape: the trailing `\` would otherwise consume the closing
  // `"` we are about to append, leaving an invalid string. Strip the dangling
  // backslash before closing.
  if (escape && repaired.endsWith("\\")) {
    repaired = repaired.slice(0, -1);
  }
  if (inString) repaired += '"';
  repaired = repaired.replace(/,\s*$/, "");
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    repaired += stack[i] === "{" ? "}" : "]";
  }
  return repaired;
}

// Reviver that drops `__proto__`, `constructor`, and `prototype` keys to defend
// against prototype pollution (CWE-1321) when the AI returns adversarial JSON.
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
function safeJsonReviver(key: string, value: unknown) {
  return DANGEROUS_KEYS.has(key) ? undefined : value;
}

function parseJsonOnce(input: string) {
  try {
    return JSON.parse(input, safeJsonReviver) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
}

function rawSampleOf(raw: string) {
  return raw.length > 8_000 ? raw.slice(0, 8_000) : raw;
}

// M-10: consumer-side double-validation helper. Many lib/* modules call
// `outputSchema.parse(response.structured)` after the provider has already
// validated. The second `.parse()` throws a raw ZodError that bypasses
// runStructuredPrompt's failure-logging path. Routing through this helper
// converts the failure to AiStructuredOutputError so the failed prompt_run
// row carries the same shape as a provider-side parse failure.
export function validateAiStructuredOutput<TSchema extends ZodTypeAny>(value: unknown, schema: TSchema): z.infer<TSchema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    let rawSample: null | string = null;
    try {
      rawSample = JSON.stringify(value).slice(0, 8_000);
    } catch {
      rawSample = null;
    }
    throw new AiStructuredOutputError("Consumer-side schema validation failed.", result.error.issues, rawSample);
  }
  return result.data;
}

export function parseStructuredJson<TSchema extends ZodTypeAny>(raw: string, schema: TSchema): z.infer<TSchema> {
  const candidate = sliceLikelyJson(raw);
  // Try in order: raw → common-syntax repair → brace-balanced repair (for
  // truncated max_tokens output). Stop at the first that parses.
  const parsed =
    parseJsonOnce(candidate) ??
    parseJsonOnce(repairCommonJsonSyntax(candidate)) ??
    (() => {
      const balanced = balanceBraces(candidate);
      return balanced ? parseJsonOnce(balanced) : null;
    })();

  if (parsed === null) {
    throw new AiStructuredOutputError("Provider returned invalid JSON syntax.", undefined, rawSampleOf(raw));
  }

  const validated = schema.safeParse(parsed);

  if (!validated.success) {
    throw new AiStructuredOutputError("Provider JSON failed schema validation.", validated.error.issues, rawSampleOf(raw));
  }

  return validated.data;
}
