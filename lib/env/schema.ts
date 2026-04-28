import { z } from "zod";

type EnvSource = Record<string, string | undefined>;

const nonEmptyString = z.string().trim().min(1);
const optionalNonEmptyString = z.string().trim().min(1).optional();
const urlString = z.string().trim().url();

const commaList = nonEmptyString.transform((value) =>
  value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean),
);

const scopeList = nonEmptyString.transform((value) =>
  value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean),
);

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: urlString,
});

export const serverEnvSchema = clientEnvSchema.extend({
  DATABASE_URL: nonEmptyString,
  SUPABASE_URL: urlString,
  SUPABASE_ANON_KEY: nonEmptyString,
  SUPABASE_SERVICE_ROLE_KEY: nonEmptyString,
  ADMIN_EMAILS: commaList.pipe(z.array(z.string().email()).min(1)),
  CHROME_EXTENSION_ORIGINS: z.string().trim().optional(),
  OPENAI_API_KEY: optionalNonEmptyString,
  ANTHROPIC_API_KEY: optionalNonEmptyString,
  AI_PROVIDER: z.enum(["anthropic", "openai", "mock"]),
  AI_MODEL: nonEmptyString,
  AI_THINKING_TYPE: z.literal("adaptive"),
  AI_EFFORT: z.enum(["max", "high", "medium", "low"]),
  AI_MAX_TOKENS: z.coerce.number().int().positive(),
  AI_EMBEDDING_MODEL: nonEmptyString,
  X_CLIENT_ID: nonEmptyString,
  X_CLIENT_SECRET: nonEmptyString,
  X_REDIRECT_URI: urlString,
  X_DEFAULT_SCOPES: scopeList.pipe(z.array(nonEmptyString).min(1)),
  X_PUBLISHING_SCOPES: scopeList.pipe(z.array(nonEmptyString).min(1)),
  ENCRYPTION_KEY: z.string().trim().min(32),
  CRON_SECRET: nonEmptyString,
  PERSONAL_SAVE_TOKEN_PEPPER: nonEmptyString,
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export type EnvDiagnostics = {
  valid: boolean;
  checked: string[];
  missing: string[];
  invalid: string[];
};

export function parseClientEnv(source: EnvSource): ClientEnv {
  return clientEnvSchema.parse(source);
}

export function parseServerEnv(source: EnvSource): ServerEnv {
  return serverEnvSchema.parse(source);
}

export function getServerEnvDiagnostics(source: EnvSource): EnvDiagnostics {
  const checked = Object.keys(serverEnvSchema.shape).sort();
  const parsed = serverEnvSchema.safeParse(source);

  if (parsed.success) {
    return {
      valid: true,
      checked,
      missing: [],
      invalid: [],
    };
  }

  const missing = new Set<string>();
  const invalid = new Set<string>();

  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0]);
    if (!key) {
      continue;
    }

    if (source[key] === undefined) {
      missing.add(key);
      continue;
    }

    invalid.add(key);
  }

  return {
    valid: false,
    checked,
    missing: [...missing].sort(),
    invalid: [...invalid].sort(),
  };
}
