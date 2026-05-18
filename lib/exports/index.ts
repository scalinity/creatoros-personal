import "server-only";

import { createHash } from "node:crypto";

import { logAuditEvent, redactAuditMetadata } from "@/lib/audit";
import type { AdminContext } from "@/lib/auth/admin";
import { createSupabaseServiceRoleClient } from "@/lib/db/service-role";
import { FULL_PROJECT_SCHEMA_TABLES, type FullProjectSchemaTable } from "@/lib/db/schema";
import type { Json } from "@/types/database";

const PHASE = "23-hardening-export-delete-observability";
const redacted = "[redacted]";

export type DataExportFormat = "csv" | "json";
export type DataExportInput = {
  format: DataExportFormat;
  includeLogs: boolean;
};
export type ExportTableName = FullProjectSchemaTable | "profiles";
export type ExportRecord = Record<string, Json>;
export type DataExportArchive = {
  exported_at: string;
  include_logs: boolean;
  owner_user_id: string;
  phase: typeof PHASE;
  redaction: string;
  tables: Partial<Record<ExportTableName, ExportRecord[]>>;
};

export type DataDeleteInput = {
  confirmation: "DELETE_CREATOROS_PERSONAL_DATA";
  deleteAuthUser: boolean;
};
export type DataDeleteResult = {
  auth_user_deleted: boolean;
  deleted_rows_by_table: Partial<Record<ExportTableName, number>>;
  deleted_tables: ExportTableName[];
  profile_deleted: boolean;
  token_material_deleted: boolean;
};

type AuditRequest = {
  headers: Headers;
  url?: string;
};

type QueryError = { message: string };
type SelectResult = { data: null | Record<string, unknown>[]; error: null | QueryError };
type RpcResult = { data: null | unknown; error: null | QueryError };

type SelectChain = {
  eq(key: string, value: unknown): SelectChain;
  is(key: string, value: unknown): SelectChain;
  limit(count: number): Promise<SelectResult>;
  order(key: string, options?: { ascending?: boolean }): SelectChain;
  range(from: number, to: number): Promise<SelectResult>;
};
type ExportQueryClient = {
  auth?: {
    admin?: {
      deleteUser(userId: string): Promise<{ error: null | QueryError }>;
    };
  };
  from(table: string): {
    select(columns?: string): SelectChain;
  };
  rpc(functionName: string, args: Record<string, unknown>): Promise<RpcResult>;
};

const logExcludedTables = new Set<FullProjectSchemaTable>(["audit_logs", "prompt_runs"]);
// SCA-480 (W-1): include ai_jobs.error and prompt_runs.error so any export
// path inherits the same scrub. The values are already redacted at write
// time, but adding the columns here is belt-and-suspenders for any future
// branch that may bypass redactAuditMetadata.
const knownSensitiveColumns = new Set([
  "actor_email",
  "encrypted_access_token",
  "encrypted_refresh_token",
  "error",
  "input_redacted",
  "output_redacted",
  "token_hash",
  "token_prefix",
]);

export const DATA_DELETE_TABLE_ORDER = [
  "personal_save_tokens",
  "x_connections",
  "publishing_failures",
  "campaign_items",
  "published_posts",
  "publishing_jobs",
  "scheduled_posts",
  "content_calendar_items",
  "media_assets",
  "publishing_drafts",
  "blog_exports",
  "blog_versions",
  "blog_repurposing_jobs",
  "blog_posts",
  "experiment_results",
  "weekly_reviews",
  "monthly_reviews",
  "profile_audits",
  "campaigns",
  "experiments",
  "growth_goals",
  "content_pillars",
  "post_metric_snapshots",
  "reply_drafts",
  "target_account_posts",
  "account_research_reports",
  "target_accounts",
  "content_coach_reports",
  "algo_analysis_reports",
  "voice_profiles",
  "embeddings",
  "prompt_runs",
  "ai_jobs",
  "sync_jobs",
  "generated_outputs",
  "brain_dumps",
  "saved_inspiration_posts",
  "content_ideas",
  "posts",
  "app_settings",
  "audit_logs",
] as const satisfies readonly FullProjectSchemaTable[];

type DataDeleteTableName = (typeof DATA_DELETE_TABLE_ORDER)[number];

function isDataDeleteTableName(value: string): value is DataDeleteTableName {
  return (DATA_DELETE_TABLE_ORDER as readonly string[]).includes(value);
}

function serviceQueryClient(client = createSupabaseServiceRoleClient()): ExportQueryClient {
  return client as unknown as ExportQueryClient;
}

function sanitizeRecord(value: unknown): ExportRecord {
  const redactedValue = redactAuditMetadata(value);
  return redactedValue && typeof redactedValue === "object" && !Array.isArray(redactedValue)
    ? (redactedValue as ExportRecord)
    : { value: redactedValue };
}

export function redactExportRow(_table: string, row: Record<string, unknown>): ExportRecord {
  const sanitized = sanitizeRecord(row);

  for (const key of Object.keys(sanitized)) {
    if (knownSensitiveColumns.has(key)) {
      sanitized[key] = redacted;
    }
  }

  return sanitized;
}

function exportTables(includeLogs: boolean): ExportTableName[] {
  const tables = FULL_PROJECT_SCHEMA_TABLES.filter((table) => table !== "profiles" && (includeLogs || !logExcludedTables.has(table)));
  return ["profiles", ...tables];
}

async function loadExportRows(client: ExportQueryClient, userId: string, table: ExportTableName) {
  const pageSize = 1_000;
  let from = 0;
  const rows: ExportRecord[] = [];

  while (true) {
    const selector = client.from(table).select("*");
    const filtered = table === "profiles" ? selector.eq("id", userId) : selector.eq("user_id", userId);
    const { data, error } = await filtered.order("created_at", { ascending: true }).range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Failed to export ${table}: ${error.message}`);
    }

    const page = data ?? [];
    rows.push(...page.map((row) => redactExportRow(table, row)));

    if (page.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

export async function createDataExportArchive(admin: AdminContext, input: DataExportInput, options: { serviceClient?: ExportQueryClient } = {}): Promise<DataExportArchive> {
  const archive: DataExportArchive = {
    exported_at: new Date().toISOString(),
    include_logs: input.includeLogs,
    owner_user_id: admin.userId,
    phase: PHASE,
    redaction: "Secrets, OAuth tokens, personal save token material, service-role keys, provider keys, and raw auth headers are redacted or excluded.",
    tables: {},
  };
  const client = options.serviceClient ?? serviceQueryClient();

  for (const table of exportTables(input.includeLogs)) {
    archive.tables[table] = await loadExportRows(client, admin.userId, table);
  }

  return archive;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  // Defend against CSV formula injection (CWE-1236): a cell starting with =, +,
  // -, @, tab, or CR is treated as a formula by Excel/Sheets/LibreOffice. Prefix
  // with a single quote so the spreadsheet renders the value as text. The quote
  // itself remains visible in the cell, which is the accepted trade-off.
  const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safeText) ? `"${safeText.replace(/"/g, "\"\"")}"` : safeText;
}

export function buildDataExportCsv(archive: DataExportArchive) {
  const lines = ["table,row_index,record_json"];

  for (const [table, rows] of Object.entries(archive.tables)) {
    (rows ?? []).forEach((row, index) => {
      lines.push([csvCell(table), csvCell(index + 1), csvCell(JSON.stringify(row))].join(","));
    });
  }

  return `${lines.join("\n")}\n`;
}

function ownerHash(userId: string) {
  return createHash("sha256").update(userId).digest("hex").slice(0, 24);
}

function parseDeletedRows(value: unknown): Partial<Record<ExportTableName, number>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const rows: Partial<Record<ExportTableName, number>> = {};
  for (const [table, count] of Object.entries(value)) {
    if (table === "profiles" && typeof count === "number" && Number.isFinite(count)) {
      rows.profiles = Math.max(0, Math.trunc(count));
      continue;
    }

    if (isDataDeleteTableName(table) && typeof count === "number" && Number.isFinite(count)) {
      rows[table] = Math.max(0, Math.trunc(count));
    }
  }

  return rows;
}

async function runTransactionalOwnerDelete(client: ExportQueryClient, userId: string, deleteProfile: boolean) {
  const { data, error } = await client.rpc("creatoros_delete_owner_data", {
    p_delete_profile: deleteProfile,
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Transactional data delete failed: ${error.message}`);
  }

  return parseDeletedRows(data);
}

export async function deleteOwnerData(
  admin: AdminContext,
  input: DataDeleteInput,
  options: { request?: AuditRequest | null; serviceClient?: ExportQueryClient } = {},
): Promise<DataDeleteResult> {
  const client = options.serviceClient ?? serviceQueryClient();
  const deletedRows: Partial<Record<ExportTableName, number>> = {};

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "data_delete_started",
    metadata: {
      delete_auth_user: input.deleteAuthUser,
      phase: PHASE,
      user_hash: ownerHash(admin.userId),
    },
    request: options.request ?? null,
    success: true,
    targetType: "data_delete",
    userId: admin.userId,
  });

  try {
    Object.assign(deletedRows, await runTransactionalOwnerDelete(client, admin.userId, input.deleteAuthUser));
    let authUserDeleted = false;

    if (input.deleteAuthUser) {
      const authAdmin = client.auth?.admin;
      if (!authAdmin) {
        throw new Error("Supabase auth admin deleteUser is unavailable.");
      }

      const { error } = await authAdmin.deleteUser(admin.userId);
      if (error) {
        throw new Error(`Failed to delete auth user: ${error.message}`);
      }
      authUserDeleted = true;
    }

    await logAuditEvent({
      actorEmail: null,
      eventType: "data_deleted",
      metadata: {
        deleted_rows_by_table: deletedRows,
        delete_auth_user: input.deleteAuthUser,
        phase: PHASE,
        user_hash: ownerHash(admin.userId),
      },
      request: options.request ?? null,
      success: true,
      targetType: "data_delete",
      userId: null,
    });

    return {
      auth_user_deleted: authUserDeleted,
      deleted_rows_by_table: deletedRows,
      deleted_tables: [...DATA_DELETE_TABLE_ORDER, ...(input.deleteAuthUser ? ["profiles" as const] : [])],
      profile_deleted: Boolean(deletedRows.profiles),
      token_material_deleted: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "unknown data delete failure";
    await logAuditEvent({
      actorEmail: admin.email,
      error: message,
      eventType: "data_delete_failed",
      metadata: {
        delete_auth_user: input.deleteAuthUser,
        phase: PHASE,
        user_hash: ownerHash(admin.userId),
      },
      request: options.request ?? null,
      success: false,
      targetType: "data_delete",
      userId: admin.userId,
    });
    throw error;
  }
}
