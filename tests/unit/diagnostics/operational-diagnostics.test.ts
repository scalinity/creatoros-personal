import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getOperationalDiagnostics } from "@/lib/server-only/diagnostics";

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
    expect(diagnostics.phase).toBe("15-publishing-state-machine-dry-run-calendar");
    expect(diagnostics.groups.map((group) => group.id)).toEqual([
      "auth",
      "database",
      "ai",
      "x",
      "cron",
      "security",
      "design-system",
    ]);
    expect(diagnostics.groups.find((group) => group.id === "design-system")?.status).toBe("ready");
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
});
