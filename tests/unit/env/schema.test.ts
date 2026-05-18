import { describe, expect, it } from "vitest";

import { getServerEnvDiagnostics, parseServerEnv } from "@/lib/env/schema";

const validEnv = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:54322/postgres",
  SUPABASE_URL: "https://creatoros.supabase.co",
  SUPABASE_ANON_KEY: "anon-key-placeholder",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-placeholder",
  ADMIN_EMAILS: "Owner@Example.com, second@example.com",
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
  X_DEFAULT_SCOPES: "tweet.read users.read offline.access like.read bookmark.read follows.read list.read",
  X_PUBLISHING_SCOPES: "tweet.write media.write",
  ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
  CRON_SECRET: "cron-secret-placeholder-1234",
  PERSONAL_SAVE_TOKEN_PEPPER: "save-token-pepper-placeholder",
};

describe("server environment validation", () => {
  it("normalizes list-like values and coerces numeric settings", () => {
    const parsed = parseServerEnv(validEnv);

    expect(parsed.ADMIN_EMAILS).toEqual(["owner@example.com", "second@example.com"]);
    expect(parsed.AI_MAX_TOKENS).toBe(64_000);
    expect(parsed.X_DEFAULT_SCOPES).toContain("tweet.read");
    expect(parsed.X_PUBLISHING_SCOPES).toEqual(["tweet.write", "media.write"]);
  });

  it("allows the optional OpenAI key to be absent when Anthropic is selected", () => {
    const withoutOpenAi = { ...validEnv, OPENAI_API_KEY: undefined };

    const parsed = parseServerEnv(withoutOpenAi);
    const diagnostics = getServerEnvDiagnostics(withoutOpenAi);

    expect(parsed.AI_PROVIDER).toBe("anthropic");
    expect(parsed.OPENAI_API_KEY).toBeUndefined();
    expect(diagnostics.valid).toBe(true);
  });

  it("reports missing or invalid keys without returning secret values", () => {
    const diagnostics = getServerEnvDiagnostics({
      ...validEnv,
      ANTHROPIC_API_KEY: "",
      CRON_SECRET: "",
    });

    expect(diagnostics.valid).toBe(false);
    expect(diagnostics.invalid).toEqual(expect.arrayContaining(["ANTHROPIC_API_KEY", "CRON_SECRET"]));
    expect(JSON.stringify(diagnostics)).not.toContain("openai-placeholder");
    expect(JSON.stringify(diagnostics)).not.toContain("service-role-placeholder");
  });
});
