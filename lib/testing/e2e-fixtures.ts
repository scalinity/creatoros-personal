import "server-only";

import { randomUUID } from "node:crypto";

import type { User } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";

import type { AdminContext } from "@/lib/auth/admin";
import { nowIso } from "@/lib/db/json";

export const E2E_AUTH_COOKIE = "creatoros_e2e_admin";
export const E2E_AUTH_HEADER = "x-creatoros-e2e-auth";

const E2E_EMAIL = "owner@example.com";
const E2E_USER_ID = "00000000-0000-4000-8000-000000000024";

type TableRow = Record<string, unknown>;
type FilterOp = "eq" | "gte" | "is" | "lte";
type SelectFilter = { key: string; op: FilterOp; value: unknown };
type OrderRule = { ascending: boolean; key: string };
type QueryResult<T> = { data: T; error: null | { message: string } };
type SelectOptions = { count?: "exact"; head?: boolean };
type E2eStore = {
  rows: Record<string, TableRow[]>;
};

type E2eGlobal = typeof globalThis & {
  __creatorosE2eStore?: E2eStore;
};

function isE2eModeEnabled() {
  return (
    process.env.CREATOROS_E2E_AUTH_BYPASS === "1" &&
    process.env.NODE_ENV !== "production" &&
    !process.env.VERCEL_ENV &&
    isLoopbackAppUrl()
  );
}

function e2eAuthSecret() {
  const secret = process.env.CREATOROS_E2E_AUTH_SECRET;
  return secret && secret.length >= 24 ? secret : null;
}

function isLoopbackHost(host: string | null) {
  const hostname = host?.split(":")[0]?.toLowerCase();
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1" || hostname === "[::1]";
}

function isLoopbackAppUrl() {
  try {
    return isLoopbackHost(new URL(process.env.NEXT_PUBLIC_APP_URL ?? "").host);
  } catch {
    return false;
  }
}

function getStore() {
  const globalStore = globalThis as E2eGlobal;
  if (!globalStore.__creatorosE2eStore) {
    globalStore.__creatorosE2eStore = { rows: {} };
  }

  return globalStore.__creatorosE2eStore;
}

function tableRows(table: string) {
  const store = getStore();
  store.rows[table] = store.rows[table] ?? [];
  return store.rows[table]!;
}

function setTableRows(table: string, rows: TableRow[]) {
  getStore().rows[table] = rows;
}

function withBaseDefaults(table: string, payload: TableRow) {
  const timestamp = nowIso();
  return {
    created_at: timestamp,
    deleted_at: null,
    id: typeof payload.id === "string" ? payload.id : randomUUID(),
    metadata: {},
    updated_at: timestamp,
    ...tableDefaults(table),
    ...payload,
  } satisfies TableRow;
}

function tableDefaults(table: string): TableRow {
  if (table === "content_ideas") {
    return {
      archived_at: null,
      favorite: false,
      linked_post_id: null,
      raw_text: "",
      source: "manual",
      source_entity_id: null,
      source_entity_type: null,
      status: "inbox",
      tags: [],
      title: null,
      user_id: E2E_USER_ID,
    };
  }

  if (table === "generated_outputs") {
    return {
      archived_at: null,
      copied_at: null,
      favorite: false,
      input_id: null,
      input_type: null,
      model: null,
      prompt_version: null,
      provider: null,
      saved: true,
      text: "",
      type: "x_post",
      user_id: E2E_USER_ID,
      variants: [],
    };
  }

  if (table === "posts") {
    return {
      author_display_name: null,
      author_username: null,
      bookmark_count: 0,
      content_pillar: null,
      created_at_platform: null,
      engagement_rate: null,
      format: null,
      has_link: false,
      has_media: false,
      heuristic_score: null,
      hook_type: null,
      imported_at: nowIso(),
      impression_count: 0,
      is_owner_post: true,
      like_count: 0,
      media_metadata: {},
      media_view_count: 0,
      platform: "x",
      platform_post_id: null,
      profile_click_count: 0,
      quality_score: null,
      quote_count: 0,
      raw_api_payload: {},
      reply_count: 0,
      repost_count: 0,
      source: "manual",
      text: "",
      tone: null,
      topic: null,
      url: null,
      url_link_click_count: 0,
      user_id: E2E_USER_ID,
      video_view_count: 0,
      virality_score: null,
    };
  }

  if (table === "post_metric_snapshots") {
    return {
      bookmark_count: 0,
      engagement_rate: null,
      heuristic_score: null,
      impression_count: 0,
      like_count: 0,
      media_view_count: 0,
      post_id: null,
      profile_click_count: 0,
      quality_score: null,
      quote_count: 0,
      raw_api_payload: {},
      reply_count: 0,
      repost_count: 0,
      score_metadata: {},
      snapshot_at: nowIso(),
      source: "manual",
      url_link_click_count: 0,
      user_id: E2E_USER_ID,
      video_view_count: 0,
      virality_score: null,
    };
  }

  if (table === "sync_jobs") {
    return {
      completed_at: null,
      error: null,
      job_type: "manual_post_import",
      records_created: 0,
      records_failed: 0,
      records_seen: 0,
      records_updated: 0,
      started_at: nowIso(),
      status: "running",
      user_id: E2E_USER_ID,
    };
  }

  if (table === "algo_analysis_reports") {
    return {
      confidence_label: "inference",
      content_type: "post",
      diagnosis: {},
      draft_text: "",
      metric_scores: {},
      model: "mock-model",
      overall_score: 0,
      prompt_version: "algo-analysis.v1",
      provider: "mock",
      publish_readiness: { notes: [], status: "revise" },
      rewrites: [],
      risk_warnings: [],
      thread_expansion: [],
      user_id: E2E_USER_ID,
      voice_profile_id: null,
    };
  }

  if (table === "ai_jobs") {
    return {
      completed_at: null,
      error: null,
      input_entity_id: null,
      input_entity_type: null,
      job_type: "mock_job",
      model: "mock-model",
      prompt_version: null,
      provider: "mock",
      started_at: nowIso(),
      status: "running",
      user_id: E2E_USER_ID,
    };
  }

  if (table === "prompt_runs") {
    return {
      ai_job_id: null,
      error: null,
      estimated_cost_usd: null,
      input_hash: "",
      input_redacted: {},
      input_tokens: null,
      latency_ms: null,
      model: "mock-model",
      output_redacted: {},
      output_tokens: null,
      prompt_name: "mock",
      prompt_version: "mock.v1",
      provider: "mock",
      status: "succeeded",
      total_tokens: null,
      user_id: E2E_USER_ID,
    };
  }

  if (table === "blog_posts") {
    return {
      campaign_id: null,
      canonical_summary: null,
      categories: [],
      excerpt: null,
      experiment_id: null,
      html: null,
      json_doc: {},
      markdown: "",
      meta_description: null,
      reading_time_minutes: 0,
      seo_title: null,
      slug: null,
      source_content_idea_id: null,
      source_generated_output_id: null,
      source_id: null,
      source_post_id: null,
      source_type: "manual",
      status: "idea",
      tags: [],
      title: "Untitled",
      user_id: E2E_USER_ID,
      word_count: 0,
    };
  }

  if (table === "blog_versions") {
    return {
      blog_post_id: null,
      change_reason: null,
      created_by: "owner",
      html: null,
      json_doc: {},
      markdown: "",
      model: null,
      prompt_version: null,
      provider: null,
      title: "Untitled",
      user_id: E2E_USER_ID,
      version_number: 1,
    };
  }

  if (table === "blog_exports") {
    return {
      blog_post_id: null,
      checksum: null,
      export_payload: null,
      exported_at: nowIso(),
      format: "markdown",
      storage_path: null,
      user_id: E2E_USER_ID,
    };
  }

  if (table === "publishing_drafts") {
    return {
      approval_payload_hash: null,
      approval_status: "pending",
      approved_at: null,
      approved_by: null,
      campaign_id: null,
      content_type: "single_post",
      duplicate_check: {},
      experiment_id: null,
      media_asset_ids: [],
      quote_post_id: null,
      reply_to_post_id: null,
      risk_check: {},
      scheduled_at: null,
      similarity_check: {},
      source_content_idea_id: null,
      source_generated_output_id: null,
      source_id: null,
      source_post_id: null,
      source_type: "manual",
      status: "draft",
      text: "",
      thread_items: [],
      timezone: "UTC",
      user_id: E2E_USER_ID,
    };
  }

  if (table === "publishing_jobs") {
    return {
      attempt_count: 1,
      completed_at: null,
      error: null,
      error_code: null,
      idempotency_key: randomUUID(),
      job_type: "dry_run",
      publishing_draft_id: null,
      rate_limit_reset_at: null,
      scheduled_for: null,
      started_at: null,
      status: "queued",
      user_id: E2E_USER_ID,
      x_request_payload: {},
      x_response_payload: {},
    };
  }

  if (table === "publishing_failures") {
    return {
      failure_type: "dry_run_simulated_failure",
      provider_error_code: null,
      publishing_draft_id: null,
      publishing_job_id: null,
      raw_error_redacted: {},
      retry_after: null,
      retryable: false,
      sanitized_message: null,
      user_id: E2E_USER_ID,
    };
  }

  if (table === "scheduled_posts") {
    return {
      calendar_item_id: null,
      canceled_audit_log_id: null,
      locked_at: null,
      lock_token: null,
      publishing_draft_id: null,
      scheduled_for: nowIso(),
      status: "scheduled",
      timezone: "UTC",
      user_id: E2E_USER_ID,
    };
  }

  if (table === "content_calendar_items") {
    return {
      entity_id: null,
      entity_type: "publishing_draft",
      item_type: "publishing",
      starts_at: nowIso(),
      status: "scheduled",
      timezone: "UTC",
      title: "Publishing draft",
      user_id: E2E_USER_ID,
    };
  }

  if (table === "x_connections") {
    return {
      avatar_url: null,
      capabilities: {},
      display_name: null,
      encrypted_access_token: null,
      encrypted_refresh_token: null,
      last_error: null,
      last_refreshed_at: null,
      last_synced_at: null,
      scopes: [],
      status: "disconnected",
      token_expires_at: null,
      user_id: E2E_USER_ID,
      username: null,
      x_user_id: null,
    };
  }

  if (table === "personal_save_tokens") {
    return {
      expires_at: null,
      last_used_at: null,
      name: "E2E token",
      rate_limit_per_hour: 30,
      revoked_at: null,
      scopes: ["inspiration:create"],
      status: "active",
      token_hash: "",
      token_prefix: "",
      user_id: E2E_USER_ID,
    };
  }

  if (table === "saved_inspiration_posts") {
    return {
      author_display_name: null,
      author_username: null,
      captured_at: nowIso(),
      notes: null,
      plagiarism_risk_notes: null,
      platform: "x",
      platform_post_id: null,
      similarity_risk: null,
      tags: [],
      text: "",
      transformed_outputs: [],
      url: null,
      user_id: E2E_USER_ID,
    };
  }

  if (table === "audit_logs") {
    return {
      actor_email: null,
      error: null,
      event_type: "e2e_event",
      ip_hash: null,
      success: true,
      target_id: null,
      target_type: null,
      user_agent: null,
      user_id: null,
    };
  }

  return { user_id: E2E_USER_ID };
}

function matchesFilter(row: TableRow, filter: SelectFilter) {
  const value = row[filter.key];

  if (filter.op === "eq") return value === filter.value;
  if (filter.op === "is") return value === filter.value || (filter.value === null && value === undefined);

  const left = typeof value === "number" ? value : String(value ?? "");
  const right = typeof filter.value === "number" ? filter.value : String(filter.value ?? "");

  if (filter.op === "gte") return left >= right;
  return left <= right;
}

function filteredRows(table: string, filters: SelectFilter[], orders: OrderRule[], orExpressions: string[] = []) {
  const rows = tableRows(table).filter(
    (row) => filters.every((filter) => matchesFilter(row, filter)) && orExpressions.every((expression) => matchesOrExpression(row, expression)),
  );
  const ordered = [...rows];

  for (const order of [...orders].reverse()) {
    ordered.sort((left, right) => {
      const a = left[order.key];
      const b = right[order.key];
      if (a === b) return 0;
      return (a ?? "") > (b ?? "") ? (order.ascending ? 1 : -1) : order.ascending ? -1 : 1;
    });
  }

  return ordered;
}

function matchesOrExpression(row: TableRow, expression: string) {
  const clauses = expression.split(",").map((clause) => clause.trim()).filter(Boolean);
  if (clauses.length === 0) return true;

  return clauses.some((clause) => {
    const [key, operator, ...rest] = clause.split(".");
    const value = rest.join(".");

    if (!key || !operator) return false;
    if (operator === "eq") return String(row[key] ?? "") === value;
    if (operator === "not" && value === "is.null") return row[key] !== null && row[key] !== undefined;
    if (operator === "is" && value === "null") return row[key] === null || row[key] === undefined;

    return false;
  });
}

function selectChain(table: string, options: SelectOptions = {}) {
  const filters: SelectFilter[] = [];
  const orders: OrderRule[] = [];
  const orExpressions: string[] = [];

  function selectedRows() {
    return filteredRows(table, filters, orders, orExpressions);
  }

  function selectResult(rows = selectedRows()) {
    if (options.count === "exact" && options.head === true) {
      return { count: rows.length, error: null };
    }

    return { data: rows, error: null };
  }

  const chain = {
    eq(key: string, value: unknown) {
      filters.push({ key, op: "eq", value });
      return chain;
    },
    gte(key: string, value: unknown) {
      filters.push({ key, op: "gte", value });
      return chain;
    },
    is(key: string, value: unknown) {
      filters.push({ key, op: "is", value });
      return chain;
    },
    limit(count: number) {
      return Promise.resolve(selectResult(selectedRows().slice(0, count)));
    },
    lte(key: string, value: unknown) {
      filters.push({ key, op: "lte", value });
      return chain;
    },
    maybeSingle() {
      return Promise.resolve({ data: selectedRows()[0] ?? null, error: null });
    },
    or(expression: string) {
      orExpressions.push(expression);
      return chain;
    },
    order(key: string, options?: { ascending?: boolean }) {
      orders.push({ ascending: options?.ascending ?? true, key });
      return chain;
    },
    range(from: number, to: number) {
      return Promise.resolve(selectResult(selectedRows().slice(from, to + 1)));
    },
    single() {
      const data = selectedRows()[0] ?? null;
      return Promise.resolve({ data, error: data ? null : { message: "not found" } });
    },
    then<TResult1 = QueryResult<TableRow[]> | { count: number; error: null }, TResult2 = never>(
      onfulfilled?: ((value: QueryResult<TableRow[]> | { count: number; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(selectResult()).then(onfulfilled, onrejected);
    },
  };

  return chain;
}

function mutationResult(rows: TableRow[]) {
  const result = { data: rows, error: null } satisfies QueryResult<TableRow[]>;
  const selected = {
    maybeSingle() {
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    },
    single() {
      const data = rows[0] ?? null;
      return Promise.resolve({ data, error: data ? null : { message: "not found" } });
    },
    then<TResult1 = QueryResult<TableRow[]>, TResult2 = never>(
      onfulfilled?: ((value: QueryResult<TableRow[]>) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(result).then(onfulfilled, onrejected);
    },
  };

  return {
    select() {
      return selected;
    },
    then<TResult1 = QueryResult<TableRow[]>, TResult2 = never>(
      onfulfilled?: ((value: QueryResult<TableRow[]>) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(result).then(onfulfilled, onrejected);
    },
  };
}

function insertRows(table: string, payload: TableRow | TableRow[]) {
  const payloads = Array.isArray(payload) ? payload : [payload];
  const rows = payloads.map((item) => withBaseDefaults(table, item));
  setTableRows(table, [...tableRows(table), ...rows]);
  return mutationResult(rows);
}

function upsertRows(table: string, payload: TableRow | TableRow[], options?: { onConflict?: string }) {
  const conflictKeys = options?.onConflict?.split(",").map((key) => key.trim()).filter(Boolean) ?? ["id"];
  const payloads = Array.isArray(payload) ? payload : [payload];
  const currentRows = tableRows(table);
  const upserted: TableRow[] = [];
  const nextRows = [...currentRows];

  for (const item of payloads) {
    const existingIndex = nextRows.findIndex((row) => conflictKeys.every((key) => row[key] === item[key]));
    const row = existingIndex >= 0 ? { ...nextRows[existingIndex], ...item, updated_at: nowIso() } : withBaseDefaults(table, item);

    if (existingIndex >= 0) {
      nextRows[existingIndex] = row;
    } else {
      nextRows.push(row);
    }

    upserted.push(row);
  }

  setTableRows(table, nextRows);
  return mutationResult(upserted);
}

function updateChain(table: string, payload: TableRow) {
  const filters: SelectFilter[] = [];

  function applyUpdate() {
    const rows = tableRows(table);
    const updated: TableRow[] = [];
    setTableRows(
      table,
      rows.map((row) => {
        if (!filters.every((filter) => matchesFilter(row, filter))) return row;
        const next = { ...row, ...payload, updated_at: nowIso() };
        updated.push(next);
        return next;
      }),
    );
    return updated;
  }

  const chain = {
    eq(key: string, value: unknown) {
      filters.push({ key, op: "eq", value });
      return chain;
    },
    is(key: string, value: unknown) {
      filters.push({ key, op: "is", value });
      return chain;
    },
    select() {
      return {
        maybeSingle() {
          const rows = applyUpdate();
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        single() {
          const rows = applyUpdate();
          const data = rows[0] ?? null;
          return Promise.resolve({ data, error: data ? null : { message: "not found" } });
        },
      };
    },
    then<TResult1 = QueryResult<null>, TResult2 = never>(
      onfulfilled?: ((value: QueryResult<null>) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      applyUpdate();
      return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
    },
  };

  return chain;
}

function deleteChain(table: string) {
  const filters: SelectFilter[] = [];

  function applyDelete() {
    const rows = tableRows(table);
    setTableRows(table, rows.filter((row) => !filters.every((filter) => matchesFilter(row, filter))));
  }

  const chain = {
    eq(key: string, value: unknown) {
      filters.push({ key, op: "eq", value });
      return chain;
    },
    is(key: string, value: unknown) {
      filters.push({ key, op: "is", value });
      return chain;
    },
    then<TResult1 = QueryResult<null>, TResult2 = never>(
      onfulfilled?: ((value: QueryResult<null>) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      applyDelete();
      return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
    },
  };

  return chain;
}

function nextBlogVersionNumber(blogId: string) {
  return tableRows("blog_versions")
    .filter((row) => row.blog_post_id === blogId)
    .reduce((highest, row) => Math.max(highest, Number(row.version_number ?? 0)), 0) + 1;
}

function rpcResult(name: string, args: Record<string, unknown>) {
  if (name !== "creatoros_update_blog_with_version") {
    return Promise.resolve({ data: null, error: { message: `Unsupported E2E RPC: ${name}` } });
  }

  const blogId = String(args.p_blog_id ?? "");
  const userId = String(args.p_user_id ?? "");
  const payload = args.p_payload && typeof args.p_payload === "object" && !Array.isArray(args.p_payload) ? (args.p_payload as TableRow) : {};
  const existing = tableRows("blog_posts").find((row) => row.id === blogId && row.user_id === userId && row.deleted_at === null);

  if (!existing) {
    return Promise.resolve({ data: null, error: { message: "not found" } });
  }

  const updated: TableRow = { ...existing, ...payload, updated_at: nowIso() };
  setTableRows(
    "blog_posts",
    tableRows("blog_posts").map((row) => (row === existing ? updated : row)),
  );

  if (args.p_create_version === true) {
    insertRows("blog_versions", {
      blog_post_id: blogId,
      change_reason: args.p_change_reason ?? null,
      created_by: args.p_created_by ?? "owner",
      html: updated.html ?? null,
      json_doc: updated.json_doc ?? {},
      markdown: updated.markdown ?? "",
      metadata: args.p_metadata ?? {},
      model: args.p_model ?? null,
      prompt_version: args.p_prompt_version ?? null,
      provider: args.p_provider ?? null,
      title: updated.title ?? "Untitled",
      user_id: userId,
      version_number: nextBlogVersionNumber(blogId),
    });
  }

  return Promise.resolve({ data: [updated], error: null });
}

export function getE2eSupabaseClient() {
  const client = {
    auth: {
      async getUser() {
        return { data: { user: e2eUser() }, error: null };
      },
    },
    from(table: string) {
      return {
        delete() {
          return deleteChain(table);
        },
        insert(payload: TableRow | TableRow[]) {
          return insertRows(table, payload);
        },
        select() {
          return selectChain(table);
        },
        update(payload: TableRow) {
          return updateChain(table, payload);
        },
        upsert(payload: TableRow | TableRow[], options?: { onConflict?: string }) {
          return upsertRows(table, payload, options);
        },
      };
    },
    rpc(name: string, args: Record<string, unknown>) {
      return rpcResult(name, args);
    },
  };

  return client as unknown as AdminContext["supabase"];
}

function e2eUser() {
  return {
    app_metadata: {},
    aud: "authenticated",
    created_at: "2026-04-28T00:00:00.000Z",
    email: E2E_EMAIL,
    id: E2E_USER_ID,
    user_metadata: {},
  } as User;
}

// SCA-490 (W-11): Host header is attacker-controllable, so it cannot prove
// the request is loopback. Reject as soon as any proxy header is present,
// since loopback connections cannot traverse a proxy. The remaining env
// gates (NODE_ENV !== 'production', !VERCEL_ENV, NEXT_PUBLIC_APP_URL loopback,
// and the long random secret) make this hard to reach in practice, but
// closing the Host-spoof path removes the last single-header exploit vector.
const PROXY_HEADERS = ["x-forwarded-for", "x-forwarded-host", "x-real-ip", "cf-connecting-ip", "true-client-ip"] as const;

function requestCrossedProxy(getHeader: (name: string) => null | string) {
  return PROXY_HEADERS.some((name) => {
    const value = getHeader(name);
    return Boolean(value && value.trim());
  });
}

function requestHasE2eAuth(request: NextRequest) {
  const secret = e2eAuthSecret();
  if (!secret) return false;
  if (!isLoopbackHost(request.nextUrl.host)) return false;
  // Any proxy header → not actually loopback; refuse the bypass.
  if (requestCrossedProxy((name) => request.headers.get(name))) return false;

  return request.headers.get(E2E_AUTH_HEADER) === secret || request.cookies.get(E2E_AUTH_COOKIE)?.value === secret;
}

async function cookiesHaveE2eAuth() {
  const secret = e2eAuthSecret();
  if (!secret) return false;

  try {
    const headerStore = await headers();
    if (!isLoopbackHost(headerStore.get("host"))) return false;
    if (requestCrossedProxy((name) => headerStore.get(name))) return false;

    const cookieStore = await cookies();
    return cookieStore.get(E2E_AUTH_COOKIE)?.value === secret;
  } catch {
    return false;
  }
}

export async function shouldUseE2eAuthBypass(request?: NextRequest) {
  if (!isE2eModeEnabled()) return false;
  if (request) return requestHasE2eAuth(request);
  return cookiesHaveE2eAuth();
}

export function shouldUseE2eServiceRoleClient() {
  return isE2eModeEnabled() && Boolean(e2eAuthSecret());
}

export function getE2eAdminContext(): AdminContext {
  return {
    email: E2E_EMAIL,
    supabase: getE2eSupabaseClient(),
    user: e2eUser(),
    userId: E2E_USER_ID,
  };
}
