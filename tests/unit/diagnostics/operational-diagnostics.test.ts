import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getOperationalDiagnostics, getWorkspaceDiagnosticsSnapshot } from "@/lib/server-only/diagnostics";

const validEnv = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:54322/postgres",
  SUPABASE_URL: "https://creatoros.supabase.co",
  SUPABASE_ANON_KEY: "anon-key-placeholder",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-placeholder",
  ADMIN_EMAILS: "Owner@Example.com",
  OPENAI_API_KEY: "openai-placeholder",
  ANTHROPIC_API_KEY: "anthropic-placeholder",
  AI_PROVIDER: "anthropic",
  AI_MODEL: "claude-opus-4-7",
  AI_THINKING_TYPE: "adaptive",
  AI_EFFORT: "max",
  AI_MAX_TOKENS: "64000",
  AI_EMBEDDING_MODEL: "text-embedding-3-large",
  X_CLIENT_ID: "x-client-id-placeholder",
  X_CLIENT_SECRET: "x-client-secret-placeholder",
  X_REDIRECT_URI: "http://localhost:3000/api/x/oauth/callback",
  X_DEFAULT_SCOPES: "tweet.read users.read offline.access",
  X_PUBLISHING_SCOPES: "tweet.write media.write",
  ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
  CRON_SECRET: "cron-secret-placeholder",
  PERSONAL_SAVE_TOKEN_PEPPER: "save-token-pepper-placeholder",
};

describe("operational diagnostics", () => {
  it("groups config presence by operational area without returning secret values", () => {
    const diagnostics = getOperationalDiagnostics(validEnv);

    expect(diagnostics.overall).toBe("ready");
    expect(diagnostics.phase).toBe("23-hardening-export-delete-observability");
    expect(diagnostics.groups.map((group) => group.id)).toEqual([
      "auth",
      "database",
      "ai",
      "x",
      "cron",
      "security",
      "publishing",
      "jobs",
      "tokens",
      "recent-failures",
      "design-system",
    ]);
    expect(diagnostics.groups.find((group) => group.id === "design-system")?.status).toBe("ready");
    expect(diagnostics.groups.find((group) => group.id === "publishing")?.status).toBe("scaffolded");
    expect(JSON.stringify(diagnostics)).not.toContain("service-role-placeholder");
    expect(JSON.stringify(diagnostics)).not.toContain("anthropic-placeholder");
    expect(JSON.stringify(diagnostics)).not.toContain("0123456789abcdef");
  });

  it("marks missing and invalid config as degraded without leaking supplied values", () => {
    const diagnostics = getOperationalDiagnostics({
      ...validEnv,
      ANTHROPIC_API_KEY: "",
      X_REDIRECT_URI: "not-a-url",
      CRON_SECRET: undefined,
    });

    expect(diagnostics.overall).toBe("degraded");
    expect(diagnostics.groups.find((group) => group.id === "ai")?.status).toBe("degraded");
    expect(diagnostics.groups.find((group) => group.id === "x")?.status).toBe("degraded");
    expect(diagnostics.groups.find((group) => group.id === "cron")?.status).toBe("missing");
    expect(JSON.stringify(diagnostics)).not.toContain("not-a-url");
  });

  it("keeps Anthropic mode ready when the optional OpenAI key is absent", () => {
    const withoutOpenAi = { ...validEnv, OPENAI_API_KEY: undefined };
    const diagnostics = getOperationalDiagnostics(withoutOpenAi);
    const aiGroup = diagnostics.groups.find((group) => group.id === "ai");

    expect(aiGroup?.status).toBe("ready");
    expect(aiGroup?.items.find((item) => item.key === "OPENAI_API_KEY")?.required).toBe(false);
    expect(diagnostics.env.valid).toBe(true);
  });

  it("summarizes runtime job, publishing, token, and recent failure signals when supplied", () => {
    const diagnostics = getOperationalDiagnostics(validEnv, {
      aiJobs: { failed: 1, recent: 4, running: 1 },
      publishing: { failedJobs: 1, queuedJobs: 2, retryableFailures: 1, scheduledDue: 0 },
      recentFailures: [
        {
          at: "2026-04-28T12:00:00.000Z",
          id: "failure-1",
          message: "provider secret sk-test-should-redact failed",
          source: "ai_jobs",
          type: "coach",
        },
      ],
      syncJobs: { failed: 0, recent: 2, running: 0 },
      tokens: { active: 1, expired: 0, revoked: 2 },
    });

    expect(diagnostics.groups.find((group) => group.id === "jobs")?.status).toBe("degraded");
    expect(diagnostics.groups.find((group) => group.id === "publishing")?.status).toBe("degraded");
    expect(diagnostics.groups.find((group) => group.id === "tokens")?.status).toBe("ready");
    expect(diagnostics.groups.find((group) => group.id === "recent-failures")?.status).toBe("degraded");
    expect(JSON.stringify(diagnostics)).not.toContain("sk-test-should-redact");
  });

  it("uses exact runtime count queries instead of recent-row samples for status totals", async () => {
    const countValues = new Map([
      ["ai_jobs|status=failed", 41],
      ["ai_jobs|status=running", 2],
      ["ai_jobs|total", 80],
      ["sync_jobs|status=failed", 3],
      ["sync_jobs|status=running", 1],
      ["sync_jobs|total", 15],
      ["publishing_jobs|status=failed", 7],
      ["publishing_jobs|or:status.eq.queued,status.eq.running", 4],
      ["publishing_failures|retryable=true", 5],
      ["scheduled_posts|status=scheduled|scheduled_for<=2026-", 6],
      ["personal_save_tokens|status=active|revoked_at=null", 2],
      ["personal_save_tokens|expires_at<=2026-", 1],
      ["personal_save_tokens|or:status.eq.revoked,revoked_at.not.is.null", 9],
    ]);
    const rowsByTable = new Map([
      ["ai_jobs", []],
      ["sync_jobs", []],
      ["publishing_failures", []],
      ["prompt_runs", []],
    ]);
    const supabase = {
      from(table: string) {
        return {
          select(_columns: string, options?: { count?: "exact"; head?: boolean }) {
            if (options?.head) {
              const filters: string[] = [];
              const chain = {
                eq(key: string, value: unknown) {
                  if (key !== "user_id") filters.push(`${key}=${String(value)}`);
                  return chain;
                },
                is(key: string, value: unknown) {
                  filters.push(`${key}=${String(value)}`);
                  return chain;
                },
                lte(key: string, value: unknown) {
                  filters.push(`${key}<=${String(value).slice(0, 5)}`);
                  return chain;
                },
                or(expression: string) {
                  filters.push(`or:${expression}`);
                  return chain;
                },
                then<TResult1 = { count: number; error: null }, TResult2 = never>(
                  onfulfilled?: ((value: { count: number; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
                  onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
                ) {
                  const key = `${table}|${filters.length > 0 ? filters.join("|") : "total"}`;
                  return Promise.resolve({ count: countValues.get(key) ?? 0, error: null }).then(onfulfilled, onrejected);
                },
              };
              return chain;
            }

            const chain = {
              eq() {
                return chain;
              },
              order() {
                return chain;
              },
              limit() {
                return Promise.resolve({ data: rowsByTable.get(table) ?? [], error: null });
              },
            };
            return chain;
          },
        };
      },
    };

    const snapshot = await getWorkspaceDiagnosticsSnapshot({ supabase, userId: "owner-1" } as unknown as Parameters<typeof getWorkspaceDiagnosticsSnapshot>[0]);

    expect(snapshot.aiJobs.failed).toBe(41);
    expect(snapshot.aiJobs.recent).toBe(80);
    expect(snapshot.publishing.failedJobs).toBe(7);
    expect(snapshot.publishing.retryableFailures).toBe(5);
    expect(snapshot.tokens.revoked).toBe(9);
  });
});
