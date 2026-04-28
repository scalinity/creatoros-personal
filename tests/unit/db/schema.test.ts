import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CORE_SCHEMA_TABLES,
  PHASE_06_SCHEMA_TABLES,
  SENSITIVE_CORE_TABLES,
} from "@/lib/db/schema";

const coreMigrationPath = join(process.cwd(), "supabase/migrations/20260428002018_core_schema_rls.sql");
const phase06MigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260428004011_publishing_blog_growth_schema_rls.sql",
);
const coreMigrationSql = () => readFileSync(coreMigrationPath, "utf8");
const phase06MigrationSql = () => readFileSync(phase06MigrationPath, "utf8");

describe("Phase 05 Supabase core schema migration", () => {
  it("keeps publishing, blog, and growth tables out of the core migration", () => {
    expect(existsSync(coreMigrationPath)).toBe(true);
    const sql = coreMigrationSql();

    for (const table of CORE_SCHEMA_TABLES) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }

    for (const table of PHASE_06_SCHEMA_TABLES) {
      expect(sql).not.toContain(`create table public.${table}`);
    }
  });

  it("enforces ownership, indexes, and sensitive-token browser boundaries", () => {
    const sql = coreMigrationSql();

    expect(sql).toContain("create extension if not exists vector with schema extensions");
    expect(sql).toContain("embedding extensions.vector(3072)");
    expect(sql).toContain("AI_EMBEDDING_MODEL=text-embedding-3-large");

    for (const table of CORE_SCHEMA_TABLES.filter((table) => table !== "profiles")) {
      expect(sql).toContain(`create index ${table}_user_id_idx on public.${table} (user_id)`);
      expect(sql).toContain(`create policy ${table}_owner_select`);
      expect(sql).toContain(`with check ((select auth.uid()) = user_id)`);
    }

    expect(sql).toContain("create policy profiles_owner_select");
    expect(sql).toContain("using ((select auth.uid()) = id)");

    for (const table of SENSITIVE_CORE_TABLES) {
      expect(sql).toContain(`revoke all on table public.${table} from anon, authenticated`);
    }

    expect(sql).not.toMatch(/grant select .*encrypted_access_token/i);
    expect(sql).not.toMatch(/grant select .*encrypted_refresh_token/i);
    expect(sql).not.toMatch(/grant select .*token_hash/i);
  });
});

describe("Phase 06 publishing, blog, and growth schema migration", () => {
  it("creates all Phase 06 tables with owner indexes and RLS", () => {
    expect(existsSync(phase06MigrationPath)).toBe(true);
    const sql = phase06MigrationSql();

    for (const table of PHASE_06_SCHEMA_TABLES) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`create index ${table}_user_id_idx on public.${table} (user_id)`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`create policy ${table}_owner_select`);
      expect(sql).toContain(`with check ((select auth.uid()) = user_id)`);
    }
  });

  it("enforces documented state machines and cross-schema links", () => {
    const sql = phase06MigrationSql();

    expect(sql).toContain("publishing_drafts_status_check");
    expect(sql).toContain("'ai_generated'");
    expect(sql).toContain("approval_payload_hash");
    expect(sql).toContain("approval_audit_log_id uuid references public.audit_logs(id)");
    expect(sql).toContain("publishing_jobs_status_check check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled'))");
    expect(sql).toContain("publishing_jobs_idempotency_key_uidx");
    expect(sql).toContain("scheduled_posts_due_idx");
    expect(sql).toContain("published_posts_platform_post_uidx");
    expect(sql).toContain("blog_posts_status_check check (status in ('idea', 'outlining', 'drafting', 'editing', 'ready', 'exported', 'published_externally', 'archived'))");
    expect(sql).toContain("experiments_decision_check check (decision is null or decision in ('continue', 'stop', 'iterate', 'scale'))");
    expect(sql).toContain("experiment_results_decision_check check (decision is null or decision in ('continue', 'stop', 'iterate', 'scale'))");
    expect(sql).toContain("alter table public.reply_drafts add constraint reply_drafts_publishing_draft_id_fkey");
    expect(sql).toContain("alter table public.reply_drafts add constraint reply_drafts_published_post_id_fkey");
  });
});
