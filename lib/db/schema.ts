import type { Database } from "@/types/database";

type PublicTables = Database["public"]["Tables"];

export const CORE_SCHEMA_TABLES = [
  "profiles",
  "app_settings",
  "x_connections",
  "posts",
  "post_metric_snapshots",
  "content_ideas",
  "generated_outputs",
  "brain_dumps",
  "saved_inspiration_posts",
  "target_accounts",
  "target_account_posts",
  "reply_drafts",
  "account_research_reports",
  "content_coach_reports",
  "algo_analysis_reports",
  "voice_profiles",
  "embeddings",
  "ai_jobs",
  "prompt_runs",
  "sync_jobs",
  "audit_logs",
  "personal_save_tokens",
] as const satisfies readonly (keyof PublicTables)[];

export const PHASE_06_SCHEMA_TABLES = [
  "publishing_drafts",
  "publishing_jobs",
  "scheduled_posts",
  "published_posts",
  "publishing_failures",
  "media_assets",
  "content_calendar_items",
  "blog_posts",
  "blog_versions",
  "blog_exports",
  "blog_repurposing_jobs",
  "growth_goals",
  "content_pillars",
  "campaigns",
  "campaign_items",
  "experiments",
  "experiment_results",
  "weekly_reviews",
  "monthly_reviews",
  "profile_audits",
] as const satisfies readonly (keyof PublicTables)[];

export const FULL_PROJECT_SCHEMA_TABLES = [
  ...CORE_SCHEMA_TABLES,
  ...PHASE_06_SCHEMA_TABLES,
] as const satisfies readonly (keyof PublicTables)[];

export const USER_OWNED_CORE_TABLES = CORE_SCHEMA_TABLES.filter((table) => table !== "profiles");
export const USER_OWNED_PHASE_06_TABLES = PHASE_06_SCHEMA_TABLES;

export const SENSITIVE_CORE_TABLES = ["x_connections", "personal_save_tokens"] as const satisfies readonly CoreSchemaTable[];

export const APPEND_ONLY_CORE_TABLES = [
  "post_metric_snapshots",
  "prompt_runs",
  "audit_logs",
] as const satisfies readonly CoreSchemaTable[];

export type CoreSchemaTable = (typeof CORE_SCHEMA_TABLES)[number];
export type Phase06SchemaTable = (typeof PHASE_06_SCHEMA_TABLES)[number];
export type FullProjectSchemaTable = (typeof FULL_PROJECT_SCHEMA_TABLES)[number];
export type UserOwnedCoreTable = (typeof USER_OWNED_CORE_TABLES)[number];
export type UserOwnedPhase06Table = (typeof USER_OWNED_PHASE_06_TABLES)[number];
export type SensitiveCoreTable = (typeof SENSITIVE_CORE_TABLES)[number];
export type AppendOnlyCoreTable = (typeof APPEND_ONLY_CORE_TABLES)[number];
