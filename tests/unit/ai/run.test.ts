import { afterEach, describe, expect, it, vi } from "vitest";

const auditMock = vi.hoisted(() => ({
  logAuditEvent: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => auditMock);

import type { AdminContext } from "@/lib/auth/admin";
import { runStructuredPrompt } from "@/lib/ai/run";

function createSupabaseMock() {
  const inserts: Record<string, unknown[]> = {};
  const updates: Record<string, unknown[]> = {};
  let idSequence = 0;

  return {
    inserts,
    supabase: {
      from(table: string) {
        return {
          insert(payload: unknown) {
            inserts[table] = [...(inserts[table] ?? []), payload];

            return {
              select() {
                return {
                  async single() {
                    idSequence += 1;
                    return { data: { id: `${table}-${idSequence}` }, error: null };
                  },
                };
              },
            };
          },
          update(payload: unknown) {
            updates[table] = [...(updates[table] ?? []), payload];
            const chain = {
              eq: vi.fn(() => chain),
              then<TResult1 = { error: null }, TResult2 = never>(
                onfulfilled?: ((value: { error: null }) => TResult1 | PromiseLike<TResult1>) | null,
                onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
              ) {
                return Promise.resolve({ error: null }).then(onfulfilled, onrejected);
              },
            };

            return chain;
          },
        };
      },
    },
    updates,
  };
}

function createAdminContext(supabase: unknown): AdminContext {
  return {
    email: "owner@example.com",
    supabase,
    user: { id: "user-1" },
    userId: "user-1",
  } as AdminContext;
}

afterEach(() => {
  vi.unstubAllEnvs();
  auditMock.logAuditEvent.mockClear();
});

describe("runStructuredPrompt", () => {
  it("uses registered schema-valid mock output when mock mode is selected", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    vi.stubEnv("AI_MODEL", "mock-model");

    const response = await runStructuredPrompt({
      admin: null,
      input: { task: "score this draft" },
      jobType: "algo_analysis",
      promptId: "algo-analysis.v1",
    });

    expect(response.provider).toBe("mock");
    expect(response.structured).toMatchObject({
      heuristic_disclaimer: "This is a heuristic evaluation, not the official X algorithm.",
      publish_readiness: "revise",
    });
  });

  it("persists prompt runs and audits AI job lifecycle for admin runs", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    vi.stubEnv("AI_MODEL", "mock-model");
    const { inserts, supabase, updates } = createSupabaseMock();
    const admin = createAdminContext(supabase);

    const response = await runStructuredPrompt({
      admin,
      input: { objective: "draft options", task: "write post" },
      jobType: "post_writer",
      promptId: "post-writer.v1",
    });

    expect(response.structured).toMatchObject({ drafts: [expect.objectContaining({ text: expect.any(String) })] });
    expect(inserts.ai_jobs).toHaveLength(1);
    expect(inserts.prompt_runs).toHaveLength(1);
    expect(updates.ai_jobs).toEqual([expect.objectContaining({ status: "succeeded" })]);
    expect(auditMock.logAuditEvent).toHaveBeenCalledTimes(2);
    expect(auditMock.logAuditEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({ eventType: "ai_job_started" }));
    expect(auditMock.logAuditEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({ eventType: "ai_job_succeeded" }));
  });
});
