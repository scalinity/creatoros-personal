import { z } from "zod";

const urlSchema = z.string().trim().url();
const nonEmptyString = z.string().trim().min(1);

export class AuthConfigurationError extends Error {
  override name = "AuthConfigurationError";
}

type SupabaseAuthConfig = {
  anonKey: string;
  url: string;
};

type SupabaseServiceRoleConfig = {
  serviceRoleKey: string;
  url: string;
};

function parseConfig<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    throw new AuthConfigurationError(`${label} is missing or invalid.`);
  }

  return parsed.data;
}

export function getSupabaseAuthConfig(source: NodeJS.ProcessEnv = process.env): SupabaseAuthConfig {
  return {
    url: parseConfig(urlSchema, source.SUPABASE_URL, "SUPABASE_URL"),
    anonKey: parseConfig(nonEmptyString, source.SUPABASE_ANON_KEY, "SUPABASE_ANON_KEY"),
  };
}

export function getOptionalSupabaseAuthConfig(source: NodeJS.ProcessEnv = process.env): SupabaseAuthConfig | null {
  try {
    return getSupabaseAuthConfig(source);
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return null;
    }

    throw error;
  }
}

export function getSupabaseServiceRoleConfig(source: NodeJS.ProcessEnv = process.env): SupabaseServiceRoleConfig {
  return {
    url: parseConfig(urlSchema, source.SUPABASE_URL, "SUPABASE_URL"),
    serviceRoleKey: parseConfig(
      nonEmptyString,
      source.SUPABASE_SERVICE_ROLE_KEY,
      "SUPABASE_SERVICE_ROLE_KEY",
    ),
  };
}

