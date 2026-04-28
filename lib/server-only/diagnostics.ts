import "server-only";

import type { AdminContext } from "@/lib/auth/admin";
import { getServerEnvDiagnostics, type EnvDiagnostics } from "@/lib/env/schema";
import { redactAuditMetadata } from "@/lib/audit";

type EnvSource = Record<string, string | undefined>;

export type ConfigPresenceState = "invalid" | "missing" | "present";
export type DiagnosticStatus = "degraded" | "missing" | "ready" | "scaffolded";
export type DiagnosticGroupId = "ai" | "auth" | "cron" | "database" | "design-system" | "jobs" | "publishing" | "recent-failures" | "security" | "tokens" | "x";

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

export type WorkspaceFailureDiagnostic = {
  at: string;
  id: string;
  message: string;
  source: "ai_jobs" | "prompt_runs" | "publishing_failures" | "sync_jobs";
  type: string;
};

export type WorkspaceDiagnosticsSnapshot = {
  aiJobs: {
    failed: number;
    recent: number;
    running: number;
  };
  publishing: {
    failedJobs: number;
    queuedJobs: number;
    retryableFailures: number;
    scheduledDue: number;
  };
  recentFailures: WorkspaceFailureDiagnostic[];
  syncJobs: {
    failed: number;
    recent: number;
    running: number;
  };
  tokens: {
    active: number;
    expired: number;
    revoked: number;
  };
};

export type OperationalDiagnostics = {
  checkedAt: string;
  env: EnvDiagnostics;
  groups: DiagnosticGroup[];
  overall: Exclude<DiagnosticStatus, "scaffolded">;
  phase: "23-hardening-export-delete-observability";
  runtime: null | WorkspaceDiagnosticsSnapshot;
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

function scaffoldedOperationalGroup(id: DiagnosticGroupId, label: string, summary: string): DiagnosticGroup {
  return {
    id,
    items: [{ key: `${id.toUpperCase().replace(/-/g, "_")}_SNAPSHOT`, label: "Runtime database snapshot", required: false, secret: false, state: "missing" }],
    label,
    status: "scaffolded",
    summary,
  };
}

function buildWorkspaceOperationalGroups(snapshot?: null | WorkspaceDiagnosticsSnapshot): DiagnosticGroup[] {
  if (!snapshot) {
    return [
      scaffoldedOperationalGroup("publishing", "Publishing Safety", "Runtime publishing job, queue, and failure counts load on authenticated diagnostics surfaces."),
      scaffoldedOperationalGroup("jobs", "Job Queues", "AI and sync job runtime counts load on authenticated diagnostics surfaces."),
      scaffoldedOperationalGroup("tokens", "Personal Save Tokens", "Token lifecycle counts load on authenticated diagnostics surfaces."),
      scaffoldedOperationalGroup("recent-failures", "Recent Failures", "Recent sanitized failure summaries load on authenticated diagnostics surfaces."),
    ];
  }

  return [
    {
      id: "publishing",
      items: [
        { key: "PUBLISHING_FAILED_JOBS", label: `Failed publishing jobs: ${snapshot.publishing.failedJobs}`, required: true, secret: false, state: "invalid" as const },
        { key: "PUBLISHING_RETRYABLE_FAILURES", label: `Retryable publishing failures: ${snapshot.publishing.retryableFailures}`, required: true, secret: false, state: "invalid" as const },
        { key: "PUBLISHING_QUEUED_JOBS", label: `Queued/running publishing jobs: ${snapshot.publishing.queuedJobs}`, required: false, secret: false, state: "present" },
        { key: "PUBLISHING_SCHEDULED_DUE", label: `Due scheduled posts: ${snapshot.publishing.scheduledDue}`, required: false, secret: false, state: "present" },
      ],
      label: "Publishing Safety",
      status: snapshot.publishing.failedJobs > 0 || snapshot.publishing.retryableFailures > 0 ? "degraded" : "ready",
      summary: "Publishing queue, failure, retry, approval, and scheduler signals are visible without X token material.",
    },
    {
      id: "jobs",
      items: [
        { key: "AI_JOBS_FAILED", label: `AI jobs failed: ${snapshot.aiJobs.failed}`, required: true, secret: false, state: "invalid" as const },
        { key: "AI_JOBS_RUNNING", label: `AI jobs running: ${snapshot.aiJobs.running}`, required: false, secret: false, state: "present" },
        { key: "SYNC_JOBS_FAILED", label: `Sync jobs failed: ${snapshot.syncJobs.failed}`, required: true, secret: false, state: "invalid" as const },
        { key: "SYNC_JOBS_RUNNING", label: `Sync jobs running: ${snapshot.syncJobs.running}`, required: false, secret: false, state: "present" },
      ],
      label: "Job Queues",
      status: snapshot.aiJobs.failed > 0 || snapshot.syncJobs.failed > 0 ? "degraded" : "ready",
      summary: `Stored jobs observed: AI ${snapshot.aiJobs.recent}, sync ${snapshot.syncJobs.recent}. Failed states are surfaced for operator review.`,
    },
    {
      id: "tokens",
      items: [
        { key: "TOKENS_ACTIVE", label: `Active personal save tokens: ${snapshot.tokens.active}`, required: false, secret: true, state: "present" },
        { key: "TOKENS_REVOKED", label: `Revoked personal save tokens: ${snapshot.tokens.revoked}`, required: false, secret: true, state: "present" },
        { key: "TOKENS_EXPIRED", label: `Expired personal save tokens: ${snapshot.tokens.expired}`, required: false, secret: true, state: "present" },
      ],
      label: "Personal Save Tokens",
      status: "ready",
      summary: "Personal save-token lifecycle counts are visible, while raw tokens, hashes, prefixes, and pepper material remain hidden.",
    },
    {
      id: "recent-failures",
      items: snapshot.recentFailures.length > 0
        ? snapshot.recentFailures.map((failure, index) => ({
            key: `RECENT_FAILURE_${index + 1}`,
            label: `${failure.source} ${failure.type}: ${failure.message}`,
            required: false,
            secret: false,
            state: "invalid" as const,
          }))
        : [{ key: "RECENT_FAILURES_CLEAR", label: "No recent stored failures", required: false, secret: false, state: "present" }],
      label: "Recent Failures",
      status: snapshot.recentFailures.length > 0 ? "degraded" : "ready",
      summary: "Recent stored AI, sync, and publishing failures are summarized with secret redaction.",
    },
  ];
}

function sanitizeWorkspaceSnapshot(snapshot: WorkspaceDiagnosticsSnapshot): WorkspaceDiagnosticsSnapshot {
  return {
    ...snapshot,
    recentFailures: snapshot.recentFailures.map((failure) => ({
      ...failure,
      message: sanitizedFailureMessage(failure.message),
    })),
  };
}

export function getOperationalDiagnostics(source: NodeJS.ProcessEnv | EnvSource = process.env, runtime: null | WorkspaceDiagnosticsSnapshot = null): OperationalDiagnostics {
  const env = getServerEnvDiagnostics(source);
  const safeRuntime = runtime ? sanitizeWorkspaceSnapshot(runtime) : null;
  const envGroups = groupDefinitions.map((definition) => buildEnvGroup(definition, source, env));
  const groups = [...envGroups, ...buildWorkspaceOperationalGroups(safeRuntime), buildDesignSystemGroup()];
  const overall = groups.some((group) => group.status === "missing" || group.status === "degraded") ? "degraded" : "ready";

  return {
    checkedAt: new Date().toISOString(),
    env,
    groups,
    overall,
    phase: "23-hardening-export-delete-observability",
    runtime: safeRuntime,
    service: "creatoros-personal",
  };
}

type RuntimeRow = Record<string, unknown>;
type RuntimeQueryError = { message: string };
type RuntimeSelectResult = { data: null | RuntimeRow[]; error: null | RuntimeQueryError };
type RuntimeCountResult = { count: null | number; error: null | RuntimeQueryError };
type RuntimeSelectChain = {
  eq(key: string, value: unknown): RuntimeSelectChain;
  limit(count: number): Promise<RuntimeSelectResult>;
  order(key: string, options?: { ascending?: boolean }): RuntimeSelectChain;
};
type RuntimeCountChain = PromiseLike<RuntimeCountResult> & {
  eq(key: string, value: unknown): RuntimeCountChain;
  is(key: string, value: unknown): RuntimeCountChain;
  lte(key: string, value: unknown): RuntimeCountChain;
  or(expression: string): RuntimeCountChain;
};
type RuntimeQueryClient = {
  from(table: string): {
    select(columns: string): RuntimeSelectChain;
    select(columns: string, options: { count: "exact"; head: true }): RuntimeCountChain;
  };
};

function runtimeClient(admin: Pick<AdminContext, "supabase">): RuntimeQueryClient {
  return admin.supabase as unknown as RuntimeQueryClient;
}

async function runtimeRows(admin: Pick<AdminContext, "supabase" | "userId">, table: string, columns: string, limit = 25) {
  const { data, error } = await runtimeClient(admin)
    .from(table)
    .select(columns)
    .eq("user_id", admin.userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load diagnostics for ${table}: ${error.message}`);
  }

  return data ?? [];
}

async function runtimeCount(
  admin: Pick<AdminContext, "supabase" | "userId">,
  table: string,
  build?: (query: RuntimeCountChain) => RuntimeCountChain,
) {
  let query = runtimeClient(admin)
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", admin.userId);

  if (build) {
    query = build(query);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(`Failed to count diagnostics for ${table}: ${error.message}`);
  }

  return count ?? 0;
}

function sanitizedFailureMessage(value: unknown) {
  const message = typeof value === "string" && value.trim().length > 0 ? value : "stored failure";
  const sanitized = redactAuditMetadata({ message });
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized) && typeof sanitized.message === "string"
    ? sanitized.message.slice(0, 180)
    : "stored failure";
}

function failureAt(row: RuntimeRow) {
  return typeof row.created_at === "string" ? row.created_at : typeof row.updated_at === "string" ? row.updated_at : new Date(0).toISOString();
}

function recentFailure(source: WorkspaceFailureDiagnostic["source"], row: RuntimeRow): WorkspaceFailureDiagnostic {
  return {
    at: failureAt(row),
    id: typeof row.id === "string" ? row.id : "unknown",
    message: sanitizedFailureMessage(row.error ?? row.sanitized_message),
    source,
    type: typeof row.job_type === "string" ? row.job_type : typeof row.failure_type === "string" ? row.failure_type : typeof row.prompt_name === "string" ? row.prompt_name : "unknown",
  };
}

export async function getWorkspaceDiagnosticsSnapshot(admin: Pick<AdminContext, "supabase" | "userId">): Promise<WorkspaceDiagnosticsSnapshot> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const [
    aiJobs,
    syncJobs,
    publishingFailures,
    promptRuns,
    aiFailed,
    aiRunning,
    aiTotal,
    syncFailed,
    syncRunning,
    syncTotal,
    publishingFailedJobs,
    publishingQueuedJobs,
    retryableFailures,
    scheduledDue,
    activeTokens,
    expiredTokens,
    revokedTokens,
  ] = await Promise.all([
    runtimeRows(admin, "ai_jobs", "id,job_type,status,error,created_at,updated_at"),
    runtimeRows(admin, "sync_jobs", "id,job_type,status,error,created_at,updated_at"),
    runtimeRows(admin, "publishing_failures", "id,failure_type,sanitized_message,retryable,created_at"),
    runtimeRows(admin, "prompt_runs", "id,prompt_name,status,error,created_at"),
    runtimeCount(admin, "ai_jobs", (query) => query.eq("status", "failed")),
    runtimeCount(admin, "ai_jobs", (query) => query.eq("status", "running")),
    runtimeCount(admin, "ai_jobs"),
    runtimeCount(admin, "sync_jobs", (query) => query.eq("status", "failed")),
    runtimeCount(admin, "sync_jobs", (query) => query.eq("status", "running")),
    runtimeCount(admin, "sync_jobs"),
    runtimeCount(admin, "publishing_jobs", (query) => query.eq("status", "failed")),
    runtimeCount(admin, "publishing_jobs", (query) => query.or("status.eq.queued,status.eq.running")),
    runtimeCount(admin, "publishing_failures", (query) => query.eq("retryable", true)),
    runtimeCount(admin, "scheduled_posts", (query) => query.eq("status", "scheduled").lte("scheduled_for", nowIso)),
    runtimeCount(admin, "personal_save_tokens", (query) => query.eq("status", "active").is("revoked_at", null)),
    runtimeCount(admin, "personal_save_tokens", (query) => query.lte("expires_at", nowIso)),
    runtimeCount(admin, "personal_save_tokens", (query) => query.or("status.eq.revoked,revoked_at.not.is.null")),
  ]);
  const recentFailures = [
    ...aiJobs.filter((row) => row.status === "failed").map((row) => recentFailure("ai_jobs", row)),
    ...syncJobs.filter((row) => row.status === "failed").map((row) => recentFailure("sync_jobs", row)),
    ...promptRuns.filter((row) => row.status === "failed").map((row) => recentFailure("prompt_runs", row)),
    ...publishingFailures.map((row) => recentFailure("publishing_failures", row)),
  ]
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
    .slice(0, 5);

  return {
    aiJobs: {
      failed: aiFailed,
      recent: aiTotal,
      running: aiRunning,
    },
    publishing: {
      failedJobs: publishingFailedJobs,
      queuedJobs: publishingQueuedJobs,
      retryableFailures,
      scheduledDue,
    },
    recentFailures,
    syncJobs: {
      failed: syncFailed,
      recent: syncTotal,
      running: syncRunning,
    },
    tokens: {
      active: activeTokens,
      expired: expiredTokens,
      revoked: revokedTokens,
    },
  };
}

export async function getOperationalDiagnosticsForAdmin(admin: Pick<AdminContext, "supabase" | "userId">, source: NodeJS.ProcessEnv | EnvSource = process.env): Promise<OperationalDiagnostics> {
  try {
    return getOperationalDiagnostics(source, await getWorkspaceDiagnosticsSnapshot(admin));
  } catch (error) {
    const fallback = getOperationalDiagnostics(source);
    return {
      ...fallback,
      groups: fallback.groups.map((group): DiagnosticGroup =>
        group.id === "recent-failures"
          ? {
              ...group,
              items: [{ key: "RUNTIME_DIAGNOSTICS_ERROR", label: sanitizedFailureMessage(error instanceof Error ? error.message : "runtime diagnostics failed"), required: false, secret: false, state: "invalid" as const }],
              status: "degraded" as const,
              summary: "Runtime diagnostics could not load; configuration diagnostics remain available.",
            }
          : group,
      ),
      overall: "degraded" as const,
    };
  }
}

export function getFoundationDiagnostics(source: NodeJS.ProcessEnv = process.env) {
  const env = getServerEnvDiagnostics(source);

  return {
    service: "creatoros-personal",
    phase: "foundation",
    env,
  };
}
