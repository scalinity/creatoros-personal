-- Phase 26 review hardening migration.
--
-- Addresses production-review findings:
--
--   * C-1  -- Partial unique index on published_posts(publishing_draft_id) to fail
--             closed on duplicate-publish races, complementing the deterministic
--             retry idempotency key in lib/publishing/index.ts.
--   * H-5  -- New x_oauth_states table for server-side OAuth state + PKCE verifier
--             storage bound to the initiating user, replacing the cookie-only
--             approach. Single-use via consumed_at.
--   * H-6  -- New rate_limit_buckets table backing PostgresRateLimitStore so
--             documented per-user/IP/token caps survive multi-instance and cold
--             starts.
--   * M-16 -- HNSW index on embeddings via halfvec cast (requires pgvector >= 0.7).
--             Wrapped in a DO block so older pgvector skips with a notice instead
--             of failing the migration.
--   * M-17 -- Tighten audit_logs INSERT: only service_role may insert. Owner
--             retains SELECT. lib/audit/logger.ts already uses the service-role
--             client, so no code path breaks.
--   * L-13 -- Drop redundant per-user idempotency unique index on publishing_jobs
--             (the global unique already covers it).
--   * L-14 -- Drop redundant unique index on blog_versions(blog_post_id,
--             version_number) added in core schema (the constraint added in
--             phase14 atomic versioning is sufficient).

set search_path = public, extensions;

-- C-1: prevent two retries from inserting two rows that publish the same draft.
create unique index if not exists published_posts_publishing_draft_uidx
  on public.published_posts (publishing_draft_id)
  where published_via = 'api' and deleted_at is null and publishing_draft_id is not null;

comment on index public.published_posts_publishing_draft_uidx is
  'Phase 26 hardening: fails closed on duplicate API-published rows for the same draft. Combined with deterministic retry idempotency keys, this prevents two concurrent retries from each writing to X.';

-- H-5/M-4/M-5: server-side OAuth state store bound to the initiating user.
create table if not exists public.x_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_verifier text not null,
  scopes text[] not null default array[]::text[],
  mode text not null,
  return_to text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint x_oauth_states_state_not_blank check (length(btrim(state)) >= 16),
  constraint x_oauth_states_mode_check check (mode in ('read', 'publishing'))
);

create index if not exists x_oauth_states_user_id_idx
  on public.x_oauth_states (user_id);
create index if not exists x_oauth_states_expires_at_idx
  on public.x_oauth_states (expires_at);

comment on table public.x_oauth_states is
  'Phase 26 hardening: server-side store for X OAuth state, PKCE verifier, scopes, mode, and return path. Bound to the initiating user_id and consumed once. Read/written via service_role only.';

alter table public.x_oauth_states enable row level security;
-- No policies: deny-all to authenticated/anon. Server-side service-role access only.

revoke all on table public.x_oauth_states from anon, authenticated;

-- H-6: durable rate-limit bucket store.
create table if not exists public.rate_limit_buckets (
  id text primary key,
  bucket_id text not null,
  window_start_ms bigint not null,
  count integer not null default 0,
  reset_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint rate_limit_buckets_id_not_blank check (length(btrim(id)) > 0),
  constraint rate_limit_buckets_bucket_id_not_blank check (length(btrim(bucket_id)) > 0),
  constraint rate_limit_buckets_count_nonneg check (count >= 0)
);

create index if not exists rate_limit_buckets_reset_at_idx
  on public.rate_limit_buckets (reset_at);

comment on table public.rate_limit_buckets is
  'Phase 26 hardening: fixed-window rate-limit store. id = bucket_id + ":" + window_start_ms. Read/written via service_role only.';

alter table public.rate_limit_buckets enable row level security;

revoke all on table public.rate_limit_buckets from anon, authenticated;

-- Helper function to atomically increment a bucket counter and return the new entry.
-- security definer is fine because the function does no auth.uid() check; access is
-- gated by execute grant which is restricted to service_role.
create or replace function public.creatoros_rate_limit_increment(
  p_id text,
  p_bucket_id text,
  p_window_start_ms bigint,
  p_window_ms bigint
)
returns table (count integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reset_at timestamptz := to_timestamp((p_window_start_ms + p_window_ms) / 1000.0);
  v_row public.rate_limit_buckets%rowtype;
begin
  insert into public.rate_limit_buckets (id, bucket_id, window_start_ms, count, reset_at)
  values (p_id, p_bucket_id, p_window_start_ms, 1, v_reset_at)
  on conflict (id) do update
    set count = public.rate_limit_buckets.count + 1
  returning * into v_row;

  return query select v_row.count, v_row.reset_at;
end;
$$;

revoke all on function public.creatoros_rate_limit_increment(text, text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.creatoros_rate_limit_increment(text, text, bigint, bigint) to service_role;

-- Cleanup helper: caller schedules this from a cron route or operator can invoke manually.
create or replace function public.creatoros_rate_limit_cleanup(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  with deleted as (
    delete from public.rate_limit_buckets
    where reset_at < p_now - interval '1 hour'
    returning 1
  )
  select count(*) into v_deleted from deleted;

  return v_deleted;
end;
$$;

revoke all on function public.creatoros_rate_limit_cleanup(timestamptz) from public, anon, authenticated;
grant execute on function public.creatoros_rate_limit_cleanup(timestamptz) to service_role;

-- Cleanup helper for x_oauth_states. Called from cron or on an exchange.
create or replace function public.creatoros_x_oauth_states_cleanup(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  with deleted as (
    delete from public.x_oauth_states
    where expires_at < p_now or (consumed_at is not null and consumed_at < p_now - interval '1 hour')
    returning 1
  )
  select count(*) into v_deleted from deleted;

  return v_deleted;
end;
$$;

revoke all on function public.creatoros_x_oauth_states_cleanup(timestamptz) from public, anon, authenticated;
grant execute on function public.creatoros_x_oauth_states_cleanup(timestamptz) to service_role;

-- M-16: approximate HNSW index on embeddings.
-- pgvector HNSW supports up to 2000 dims on `vector` and 4000 dims on `halfvec`.
-- Our embeddings are 3072-dim (text-embedding-3-large), so we cast to halfvec.
-- Requires pgvector >= 0.7. Wrapped in DO so older databases skip with a notice.
do $$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'embeddings_embedding_hnsw') then
    begin
      execute 'create index embeddings_embedding_hnsw on public.embeddings using hnsw ((embedding::extensions.halfvec(3072)) extensions.halfvec_cosine_ops)';
    exception when others then
      raise notice 'Skipping HNSW index on embeddings (likely pgvector < 0.7 or other limitation): %', sqlerrm;
    end;
  end if;
end$$;

-- M-17: tighten audit_logs. Only service_role can insert; owner retains SELECT.
drop policy if exists audit_logs_owner_insert on public.audit_logs;

revoke insert on table public.audit_logs from authenticated;

comment on table public.audit_logs is
  'Phase 26 hardening: insert restricted to service_role. lib/audit/logger.ts uses the service-role client. Owner retains SELECT for in-app audit views.';

-- L-13: drop redundant per-user idempotency unique on publishing_jobs.
-- The global unique (publishing_jobs_idempotency_key_uidx) is stricter and sufficient.
drop index if exists public.publishing_jobs_user_id_idempotency_key_key;

-- L-14: drop redundant unique index on (blog_post_id, version_number).
-- The phase14 constraint blog_versions_blog_post_id_version_number_key is sufficient.
drop index if exists public.blog_versions_post_version_uidx;

-- L-19: rate-limit accidental duplicate metric snapshots. Multiple X syncs
-- within the same hour for the same (post, user) collapse to the latest row
-- via this partial unique index. Manual snapshots (source != 'x_api_sync')
-- remain unrestricted because operators may legitimately record multiple
-- manual readings.
create unique index if not exists post_metric_snapshots_post_hour_uidx
  on public.post_metric_snapshots (user_id, post_id, date_trunc('hour', snapshot_at))
  where source = 'x_api_sync' and post_id is not null;
