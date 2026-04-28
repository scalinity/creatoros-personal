import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createAiJob, recordPromptRun } from "@/lib/ai/run-logging";

describe("AI run logging", () => {
  it("gracefully no-ops without an admin Supabase context", async () => {
    const job = await createAiJob(null, {
      jobType: "diagnostics",
      metadata: { phase: "11" },
      promptVersion: "diagnostics.v1",
    });

    const run = await recordPromptRun(null, {
      input: { prompt: "hello", secret_token: "must not persist" },
      latencyMs: 42,
      model: "mock-model",
      output: { answer: "world", nested: { api_key: "must not persist" } },
      promptName: "diagnostics",
      promptVersion: "v1",
      provider: "mock",
      status: "succeeded",
      usage: { input_tokens: 4, output_tokens: 5, total_tokens: 9 },
    });

    expect(job).toEqual({ jobId: null, ok: true, persisted: false, reason: "admin_context_unavailable" });
    expect(run.ok).toBe(true);
    expect(run.persisted).toBe(false);
    expect(run.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(run.redacted)).not.toContain("must not persist");
  });

  it("truncates oversized prompt metadata before hashing and redaction", async () => {
    const run = await recordPromptRun(null, {
      input: { pasted_text: "x".repeat(5_000) },
      model: "mock-model",
      output: { answer: "y".repeat(5_000) },
      promptName: "diagnostics",
      promptVersion: "v1",
      provider: "mock",
      status: "succeeded",
    });

    const redacted = JSON.stringify(run.redacted);
    expect(run.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(redacted).toContain("[truncated]");
    expect(redacted.length).toBeLessThan(5_000);
  });
});
