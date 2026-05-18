import "server-only";

import { logAuditEvent } from "@/lib/audit";
import type { AdminContext } from "@/lib/auth/admin";

import { getAiRuntimeConfig, type AiRuntimeConfig } from "./config";
import { AiStructuredOutputError } from "./json";
import { getPromptDefinition, type BasePromptInput, type PromptId } from "./prompts";
import { createAiProvider, createMockAiProvider } from "./providers";
import { completeAiJob, createAiJob, recordPromptRun, type AiPersistenceResult, type PromptRunResult } from "./run-logging";
import type { AiProvider } from "./types";

export type RunStructuredPromptOptions = {
  admin?: AdminContext | null;
  input: BasePromptInput;
  jobType: string;
  promptId: PromptId;
  provider?: AiProvider;
};

class AiRunPersistenceError extends Error {
  constructor(label: string, result: AiPersistenceResult) {
    super(`AI ${label} persistence failed: ${result.reason ?? "unknown"}.`);
    this.name = "AiRunPersistenceError";
  }
}

function assertPersisted(admin: AdminContext | null | undefined, label: string, result: AiPersistenceResult) {
  if (admin && !result.ok) {
    throw new AiRunPersistenceError(label, result);
  }
}

function providerForPrompt(
  options: RunStructuredPromptOptions,
  config: AiRuntimeConfig,
  prompt: ReturnType<typeof getPromptDefinition>,
): AiProvider {
  if (options.provider) {
    return options.provider;
  }

  if (config.provider === "mock") {
    return createMockAiProvider({ responses: [{ content: JSON.stringify(prompt.mockOutput) }] });
  }

  return createAiProvider();
}

async function auditAiRun(
  admin: AdminContext | null | undefined,
  input: {
    error?: null | string;
    eventType: "ai_job_failed" | "ai_job_started" | "ai_job_succeeded";
    jobId?: null | string;
    metadata: Record<string, unknown>;
    success: boolean;
  },
) {
  if (!admin) {
    return;
  }

  await logAuditEvent({
    actorEmail: admin.email,
    error: input.error ?? null,
    eventType: input.eventType,
    metadata: input.metadata,
    success: input.success,
    targetId: input.jobId ?? null,
    targetType: "ai_job",
    userId: admin.userId,
  });
}

function promptMetadata(options: RunStructuredPromptOptions, config: AiRuntimeConfig, prompt: ReturnType<typeof getPromptDefinition>) {
  return {
    job_type: options.jobType,
    model: config.model,
    prompt_id: prompt.id,
    prompt_name: prompt.promptName,
    prompt_version: prompt.promptVersion,
    provider: options.provider?.provider ?? config.provider,
  };
}

export async function runStructuredPrompt(options: RunStructuredPromptOptions) {
  const admin = options.admin ?? null;
  const prompt = getPromptDefinition(options.promptId);
  const config = getAiRuntimeConfig();
  const metadata = promptMetadata(options, config, prompt);
  const job = await createAiJob(admin, {
    jobType: options.jobType,
    model: config.model,
    promptVersion: prompt.id,
    provider: options.provider?.provider ?? config.provider,
  });

  await auditAiRun(admin, {
    eventType: "ai_job_started",
    jobId: job.jobId ?? null,
    metadata,
    success: true,
  });
  assertPersisted(admin, "job start", job);

  let provider: AiProvider | null = null;

  try {
    provider = providerForPrompt(options, config, prompt);
    const rendered = prompt.render(options.input);
    const response = await provider.generateStructured({
      maxTokens: config.maxTokens,
      messages: [
        { content: rendered.system, role: "system" },
        { content: rendered.user, role: "user" },
      ],
      model: config.model,
      schema: prompt.outputSchema,
    });

    const promptRun = await recordPromptRun(admin, {
      aiJobId: job.jobId ?? null,
      input: options.input,
      latencyMs: response.latency_ms,
      metadata,
      model: response.model,
      output: response.structured,
      promptName: prompt.promptName,
      promptVersion: prompt.promptVersion,
      provider: response.provider,
      status: "succeeded",
      usage: response.usage,
    });
    assertPersisted(admin, "prompt run", promptRun);

    const completion = await completeAiJob(admin, { jobId: job.jobId ?? null, status: "succeeded" });
    assertPersisted(admin, "job completion", completion);

    await auditAiRun(admin, {
      eventType: "ai_job_succeeded",
      jobId: job.jobId ?? null,
      metadata: {
        ...metadata,
        latency_ms: response.latency_ms,
        prompt_run_id: (promptRun as PromptRunResult).promptRunId ?? null,
        usage: response.usage,
      },
      success: true,
    });

    return response;
  } catch (error) {
    if (error instanceof AiRunPersistenceError) {
      await auditAiRun(admin, {
        error: error.message,
        eventType: "ai_job_failed",
        jobId: job.jobId ?? null,
        metadata: { ...metadata, error: error.message },
        success: false,
      });
      throw error;
    }

    const message = error instanceof Error ? error.message : "AI prompt failed.";
    const failedProvider = provider?.provider ?? options.provider?.provider ?? config.provider;

    // H-8: when the provider returned text but it failed Zod / JSON parse, the
    // AiStructuredOutputError carries a truncated raw sample. Persist it on
    // the failed prompt_run so malformed-output failures are debuggable. The
    // sample is still passed through audit redaction at the audit layer.
    const failureOutput: Record<string, unknown> = {};
    if (error instanceof AiStructuredOutputError) {
      if (error.rawSample) failureOutput.raw_sample = error.rawSample;
      if (error.details) failureOutput.validation_issues = error.details;
    }

    const promptRun = await recordPromptRun(admin, {
      aiJobId: job.jobId ?? null,
      error: message,
      input: options.input,
      metadata,
      model: config.model,
      output: failureOutput,
      promptName: prompt.promptName,
      promptVersion: prompt.promptVersion,
      provider: failedProvider,
      status: "failed",
    });
    const completion = await completeAiJob(admin, { error: message, jobId: job.jobId ?? null, status: "failed" });

    await auditAiRun(admin, {
      error: message,
      eventType: "ai_job_failed",
      jobId: job.jobId ?? null,
      metadata: { ...metadata, error: message, provider: failedProvider },
      success: false,
    });

    if (admin && (!promptRun.ok || !completion.ok)) {
      throw new AggregateError(
        [error, !promptRun.ok ? new AiRunPersistenceError("failure prompt run", promptRun) : null, !completion.ok ? new AiRunPersistenceError("failure job completion", completion) : null].filter(Boolean),
        "AI prompt failed and failure logging did not fully persist.",
      );
    }

    throw error;
  }
}
