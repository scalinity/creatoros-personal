import type { ZodTypeAny, z } from "zod";

export class AiStructuredOutputError extends Error {
  readonly code = "ai_invalid_output";
  readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(`ai_invalid_output: ${message}`);
    this.name = "AiStructuredOutputError";
    this.details = details;
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

function parseJsonOnce(input: string) {
  try {
    return JSON.parse(input) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
}

export function parseStructuredJson<TSchema extends ZodTypeAny>(raw: string, schema: TSchema): z.infer<TSchema> {
  const candidate = sliceLikelyJson(raw);
  const parsed = parseJsonOnce(candidate) ?? parseJsonOnce(repairCommonJsonSyntax(candidate));

  if (parsed === null) {
    throw new AiStructuredOutputError("Provider returned invalid JSON syntax.");
  }

  const validated = schema.safeParse(parsed);

  if (!validated.success) {
    throw new AiStructuredOutputError("Provider JSON failed schema validation.", validated.error.issues);
  }

  return validated.data;
}
