import "server-only";

import { createHash } from "node:crypto";

import { redactAuditMetadata } from "@/lib/audit/redaction";
import type { AdminContext } from "@/lib/auth/admin";
import type { Json } from "@/types/database";

import type { AiProviderName, AiUsage } from "./types";

type AiRunStatus = "canceled" | "failed" | "queued" | "running" | "succeeded";

type RunLoggerContext = Pick<AdminContext, "supabase" | "userId">;

export type AiJobInput = {
  inputEntityId?: null | string;
  inputEntityType?: null | string;
  jobType: string;
  metadata?: unknown;
  model?: null | string;
  promptVersion?: null | string;
  provider?: AiProviderName | null;
  status?: AiRunStatus;
};

export type PromptRunInput = {
  aiJobId?: null | string;
  error?: null | string;
  estimatedCostUsd?: null | number;
  input: unknown;
  latencyMs?: null | number;
  metadata?: unknown;
  model: string;
  output?: unknown;
  promptName: string;
  promptVersion: string;
  provider: AiProviderName;
  status: AiRunStatus;
  usage?: null | Partial<AiUsage>;
};

export type AiPersistenceResult = {
  jobId?: null | string;
  ok: boolean;
  persisted: boolean;
  reason?: string;
};

export type PromptRunResult = AiPersistenceResult & {
  inputHash: string;
  promptRunId?: null | string;
  redacted: {
    input: Json;
    output: Json;
  };
};

const maxPromptLogArrayItems = 30;
const maxPromptLogDepth = 5;
const maxPromptLogObjectEntries = 60;
const maxPromptLogStringLength = 2_000;

function limitPromptMetadata(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return value.length > maxPromptLogStringLength ? `${value.slice(0, maxPromptLogStringLength)}[truncated]` : value;
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (seen.has(value)) {
    return "[circular]";
  }

  if (depth >= maxPromptLogDepth) {
    return "[truncated]";
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const limited = value.slice(0, maxPromptLogArrayItems).map((item) => limitPromptMetadata(item, depth + 1, seen));
    if (value.length > maxPromptLogArrayItems) {
      limited.push(`[${value.length - maxPromptLogArrayItems} more items truncated]`);
    }
    return limited;
  }

  const entries = Object.entries(value).slice(0, maxPromptLogObjectEntries);
  const limited: Record<string, unknown> = {};

  for (const [key, nested] of entries) {
    limited[key] = limitPromptMetadata(nested, depth + 1, seen);
  }

  if (Object.keys(value).length > maxPromptLogObjectEntries) {
    limited.__truncated_keys = Object.keys(value).length - maxPromptLogObjectEntries;
  }

  return limited;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
    .join(",")}}`;
}

export function hashPromptInput(input: unknown) {
  return createHash("sha256").update(stableStringify(limitPromptMetadata(input))).digest("hex");
}

function noAdminResult(reason = "admin_context_unavailable") {
  return { jobId: null, ok: true, persisted: false, reason } satisfies AiPersistenceResult;
}

export async function createAiJob(admin: null | RunLoggerContext | undefined, input: AiJobInput): Promise<AiPersistenceResult> {
  if (!admin) {
    return noAdminResult();
  }

  try {
    const { data, error } = await admin.supabase
      .from("ai_jobs")
      .insert({
        error: null,
        input_entity_id: input.inputEntityId ?? null,
        input_entity_type: input.inputEntityType ?? null,
        job_type: input.jobType,
        metadata: redactAuditMetadata(input.metadata ?? {}) as Json,
        model: input.model ?? null,
        prompt_version: input.promptVersion ?? null,
        provider: input.provider ?? null,
        started_at: new Date().toISOString(),
        status: input.status ?? "running",
        user_id: admin.userId,
      })
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    return { jobId: data.id, ok: true, persisted: true };
  } catch (error) {
    console.error("Failed to persist AI job", {
      jobType: input.jobType,
      reason: error instanceof Error ? error.message : "unknown",
    });

    return { jobId: null, ok: false, persisted: false, reason: "database_error" };
  }
}

export async function completeAiJob(
  admin: null | RunLoggerContext | undefined,
  input: { error?: null | string; jobId?: null | string; status: Exclude<AiRunStatus, "queued" | "running"> },
): Promise<AiPersistenceResult> {
  if (!admin || !input.jobId) {
    return noAdminResult();
  }

  try {
    const { error } = await admin.supabase
      .from("ai_jobs")
      .update({
        completed_at: new Date().toISOString(),
        error: input.error ?? null,
        status: input.status,
      })
      .eq("id", input.jobId)
      .eq("user_id", admin.userId);

    if (error) {
      throw error;
    }

    return { jobId: input.jobId, ok: true, persisted: true };
  } catch (error) {
    console.error("Failed to complete AI job", {
      jobId: input.jobId,
      reason: error instanceof Error ? error.message : "unknown",
    });

    return { jobId: input.jobId, ok: false, persisted: false, reason: "database_error" };
  }
}

export async function recordPromptRun(
  admin: null | RunLoggerContext | undefined,
  input: PromptRunInput,
): Promise<PromptRunResult> {
  const limitedInput = limitPromptMetadata(input.input);
  const limitedOutput = limitPromptMetadata(input.output ?? {});
  const inputHash = hashPromptInput(limitedInput);
  const redacted = {
    input: redactAuditMetadata(limitedInput),
    output: redactAuditMetadata(limitedOutput),
  };

  if (!admin) {
    return {
      inputHash,
      jobId: input.aiJobId ?? null,
      ok: true,
      persisted: false,
      promptRunId: null,
      reason: "admin_context_unavailable",
      redacted,
    };
  }

  try {
    const inputTokens = input.usage?.input_tokens ?? null;
    const outputTokens = input.usage?.output_tokens ?? null;
    const totalTokens = input.usage?.total_tokens ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);
    const { data, error } = await admin.supabase
      .from("prompt_runs")
      .insert({
        ai_job_id: input.aiJobId ?? null,
        error: input.error ?? null,
        estimated_cost_usd: input.estimatedCostUsd ?? null,
        input_hash: inputHash,
        input_redacted: redacted.input,
        input_tokens: inputTokens,
        latency_ms: input.latencyMs ?? null,
        metadata: redactAuditMetadata(input.metadata ?? {}) as Json,
        model: input.model,
        output_redacted: redacted.output,
        output_tokens: outputTokens,
        prompt_name: input.promptName,
        prompt_version: input.promptVersion,
        provider: input.provider,
        status: input.status,
        total_tokens: totalTokens,
        user_id: admin.userId,
      })
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    return {
      inputHash,
      jobId: input.aiJobId ?? null,
      ok: true,
      persisted: true,
      promptRunId: data.id,
      redacted,
    };
  } catch (error) {
    console.error("Failed to persist prompt run", {
      promptName: input.promptName,
      promptVersion: input.promptVersion,
      reason: error instanceof Error ? error.message : "unknown",
    });

    return {
      inputHash,
      jobId: input.aiJobId ?? null,
      ok: false,
      persisted: false,
      promptRunId: null,
      reason: "database_error",
      redacted,
    };
  }
}
