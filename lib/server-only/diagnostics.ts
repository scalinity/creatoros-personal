import "server-only";

import { getServerEnvDiagnostics, type EnvDiagnostics } from "@/lib/env/schema";

type EnvSource = Record<string, string | undefined>;

export type ConfigPresenceState = "invalid" | "missing" | "present";
export type DiagnosticStatus = "degraded" | "missing" | "ready" | "scaffolded";
export type DiagnosticGroupId = "ai" | "auth" | "cron" | "database" | "design-system" | "security" | "x";

export type ConfigDiagnosticItem = {
  key: string;
  label: string;
  required?: boolean;
  secret: boolean;
  state: ConfigPresenceState;
};

export type DiagnosticGroup = {
  id: DiagnosticGroupId;
  items: ConfigDiagnosticItem[];
  label: string;
  status: DiagnosticStatus;
  summary: string;
};

export type OperationalDiagnostics = {
  checkedAt: string;
  env: EnvDiagnostics;
  groups: DiagnosticGroup[];
  overall: Exclude<DiagnosticStatus, "scaffolded">;
  phase:
    | "08-settings-diagnostics-env-security"
    | "11-ai-foundation-prompt-registry-structured-outputs"
    | "13-voice-modeling-and-embeddings-foundation"
    | "14-blog-system"
    | "15-publishing-state-machine-dry-run-calendar"
    | "16-x-oauth-and-read-sync"
    | "17-x-write-publishing-adapter";
  service: "creatoros-personal";
};

const groupDefinitions = [
  {
    id: "auth",
    label: "Auth",
    readySummary: "Supabase auth and ADMIN_EMAILS are configured.",
    degradedSummary: "Auth config is incomplete or invalid; private routes remain guarded but login may fail.",
    items: [
      { key: "SUPABASE_URL", label: "Supabase URL", secret: false },
      { key: "SUPABASE_ANON_KEY", label: "Supabase anon key", secret: true },
      { key: "ADMIN_EMAILS", label: "Admin allowlist", secret: true },
    ],
  },
  {
    id: "database",
    label: "Database",
    readySummary: "Database URL and service-role audit boundary are configured.",
    degradedSummary: "Database or service-role config is incomplete; audits and data utilities may be degraded.",
    items: [
      { key: "DATABASE_URL", label: "Database URL", secret: true },
      { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Supabase service role", secret: true },
    ],
  },
  {
    id: "ai",
    label: "AI Config",
    readySummary: "AI routing config, selected provider readiness, prompt registry, voice modeling, and retrieval foundations are available.",
    degradedSummary: "Selected AI provider config is incomplete; AI calls stay disabled while manual and keyword fallback workflows remain available.",
    items: [
      { key: "AI_PROVIDER", label: "Provider selection", secret: false },
      { key: "AI_MODEL", label: "Model", secret: false },
      { key: "AI_THINKING_TYPE", label: "Thinking mode", secret: false },
      { key: "AI_EFFORT", label: "Effort", secret: false },
      { key: "AI_MAX_TOKENS", label: "Max tokens", secret: false },
      { key: "AI_EMBEDDING_MODEL", label: "Embedding model", secret: false },
      { key: "OPENAI_API_KEY", label: "OpenAI key", optional: true, secret: true },
      { key: "ANTHROPIC_API_KEY", label: "Anthropic key", secret: true },
    ],
  },
  {
    id: "x",
    label: "X Config",
    readySummary: "X OAuth read/write config, encrypted token storage, read sync, publishing scope escalation, and write capability diagnostics are available.",
    degradedSummary: "X config is incomplete; live OAuth, sync, and publishing remain disabled while explicit dry-run paths can still verify the pipeline.",
    items: [
      { key: "X_CLIENT_ID", label: "Client ID", secret: false },
      { key: "X_CLIENT_SECRET", label: "Client secret", secret: true },
      { key: "X_REDIRECT_URI", label: "Redirect URI", secret: false },
      { key: "X_DEFAULT_SCOPES", label: "Default scopes", secret: false },
      { key: "X_PUBLISHING_SCOPES", label: "Publishing scopes", secret: false },
    ],
  },
  {
    id: "cron",
    label: "Cron Secret",
    readySummary: "Cron secret is present for future scheduled routes.",
    degradedSummary: "Cron secret is missing; scheduled routes must reject execution.",
    items: [{ key: "CRON_SECRET", label: "Cron bearer secret", secret: true }],
  },
  {
    id: "security",
    label: "Security Utilities",
    readySummary: "Encryption and personal save-token pepper config are present.",
    degradedSummary: "Security utility config is incomplete; token storage or extension ingestion must stay disabled.",
    items: [
      { key: "ENCRYPTION_KEY", label: "Token encryption key", secret: true },
      { key: "PERSONAL_SAVE_TOKEN_PEPPER", label: "Save-token pepper", secret: true },
    ],
  },
] as const;

function stateForKey(key: string, source: EnvSource, env: EnvDiagnostics): ConfigPresenceState {
  if (source[key] === undefined || env.missing.includes(key)) {
    return "missing";
  }

  if (env.invalid.includes(key)) {
    return "invalid";
  }

  return "present";
}

function isRequiredForCurrentConfig(item: { key: string; optional?: boolean }, source: EnvSource) {
  if (item.key === "OPENAI_API_KEY") {
    return source.AI_PROVIDER === "openai";
  }

  if (item.key === "ANTHROPIC_API_KEY") {
    return source.AI_PROVIDER !== "openai" && source.AI_PROVIDER !== "mock";
  }

  return !item.optional;
}

function statusForItems(items: ConfigDiagnosticItem[]): Exclude<DiagnosticStatus, "scaffolded"> {
  const requiredItems = items.filter((item) => item.required !== false);

  if (requiredItems.length > 0 && requiredItems.every((item) => item.state === "missing")) {
    return "missing";
  }

  if (requiredItems.some((item) => item.state !== "present")) {
    return "degraded";
  }

  return "ready";
}

function buildEnvGroup(definition: (typeof groupDefinitions)[number], source: EnvSource, env: EnvDiagnostics): DiagnosticGroup {
  const items = definition.items.map((item) => ({
    ...item,
    required: isRequiredForCurrentConfig(item, source),
    state: stateForKey(item.key, source, env),
  }));
  const status = statusForItems(items);

  return {
    id: definition.id,
    items,
    label: definition.label,
    status,
    summary: status === "ready" ? definition.readySummary : definition.degradedSummary,
  };
}

function buildDesignSystemGroup(): DiagnosticGroup {
  return {
    id: "design-system",
    label: "Design System",
    status: "ready",
    summary: "CreatorOS primitives, settings route composition, and token-backed status surfaces are available.",
    items: [
      { key: "CARD_PRIMITIVE", label: "Card primitive", required: true, secret: false, state: "present" },
      { key: "KEY_VALUE_ROWS", label: "KeyValueRows", required: true, secret: false, state: "present" },
      { key: "TABLE_PRIMITIVE", label: "Diagnostics tables", required: true, secret: false, state: "present" },
      { key: "BADGE_PRIMITIVE", label: "Status badges", required: true, secret: false, state: "present" },
    ],
  };
}

export function getOperationalDiagnostics(source: NodeJS.ProcessEnv | EnvSource = process.env): OperationalDiagnostics {
  const env = getServerEnvDiagnostics(source);
  const envGroups = groupDefinitions.map((definition) => buildEnvGroup(definition, source, env));
  const groups = [...envGroups, buildDesignSystemGroup()];
  const overall = groups.some((group) => group.status === "missing" || group.status === "degraded") ? "degraded" : "ready";

  return {
    checkedAt: new Date().toISOString(),
    env,
    groups,
    overall,
    phase: "17-x-write-publishing-adapter",
    service: "creatoros-personal",
  };
}

export function getFoundationDiagnostics(source: NodeJS.ProcessEnv = process.env) {
  const env = getServerEnvDiagnostics(source);

  return {
    service: "creatoros-personal",
    phase: "foundation",
    env,
  };
}
