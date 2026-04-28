-- CreatorOS Personal Phase 05: core non-publishing schema and RLS.
-- Publishing, blog, and growth tables are intentionally deferred to later phases.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is 'Shared trigger helper for mutable CreatorOS rows. Not security definer.';
revoke execute on function public.set_updated_at() from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  avatar_url text,
  is_admin boolean not null default false,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_not_blank check (length(btrim(email)) > 0)
);

create table public.app_settings (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  theme text not null default 'dark',
  ai_provider text not null default 'anthropic',
  ai_model text not null default 'claude-opus-4-7',
  ai_thinking_type text not null default 'adaptive',
  ai_effort text not null default 'max',
  ai_max_tokens integer not null default 64000,
  x_sync_enabled boolean not null default false,
  publishing_enabled boolean not null default false,
  default_timezone text not null default 'UTC',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint app_settings_user_id_key unique (user_id),
  constraint app_settings_theme_check check (theme in ('dark', 'light', 'system')),
  constraint app_settings_ai_max_tokens_positive check (ai_max_tokens > 0)
);

create table public.x_connections (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  x_user_id text,
  username text,
  display_name text,
  avatar_url text,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}'::text[],
  status text not null default 'disconnected',
  capabilities jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint x_connections_user_id_key unique (user_id),
  constraint x_connections_status_check check (status in ('pending', 'connected', 'degraded', 'revoked', 'disconnected'))
);

create table public.posts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'x',
  platform_post_id text,
  url text,
  text text not null,
  author_username text,
  author_display_name text,
  is_owner_post boolean not null default false,
  created_at_platform timestamptz,
  imported_at timestamptz not null default now(),
  source text not null default 'manual',
  impression_count bigint not null default 0,
  like_count bigint not null default 0,
  reply_count bigint not null default 0,
  repost_count bigint not null default 0,
  quote_count bigint not null default 0,
  bookmark_count bigint not null default 0,
  profile_click_count bigint not null default 0,
  url_link_click_count bigint not null default 0,
  media_view_count bigint not null default 0,
  video_view_count bigint not null default 0,
  engagement_rate numeric,
  virality_score numeric,
  quality_score numeric,
  heuristic_score numeric,
  topic text,
  format text,
  hook_type text,
  tone text,
  content_pillar text,
  has_media boolean not null default false,
  has_link boolean not null default false,
  media_metadata jsonb not null default '{}'::jsonb,
  raw_api_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint posts_platform_not_blank check (length(btrim(platform)) > 0),
  constraint posts_text_not_blank check (length(btrim(text)) > 0),
  constraint posts_metric_counts_nonnegative check (
    impression_count >= 0 and like_count >= 0 and reply_count >= 0 and repost_count >= 0 and
    quote_count >= 0 and bookmark_count >= 0 and profile_click_count >= 0 and
    url_link_click_count >= 0 and media_view_count >= 0 and video_view_count >= 0
  )
);

create table public.post_metric_snapshots (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  snapshot_at timestamptz not null default now(),
  source text not null default 'manual',
  impression_count bigint not null default 0,
  like_count bigint not null default 0,
  reply_count bigint not null default 0,
  repost_count bigint not null default 0,
  quote_count bigint not null default 0,
  bookmark_count bigint not null default 0,
  profile_click_count bigint not null default 0,
  url_link_click_count bigint not null default 0,
  media_view_count bigint not null default 0,
  video_view_count bigint not null default 0,
  engagement_rate numeric,
  virality_score numeric,
  quality_score numeric,
  heuristic_score numeric,
  score_metadata jsonb not null default '{}'::jsonb,
  raw_api_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint post_metric_snapshots_metric_counts_nonnegative check (
    impression_count >= 0 and like_count >= 0 and reply_count >= 0 and repost_count >= 0 and
    quote_count >= 0 and bookmark_count >= 0 and profile_click_count >= 0 and
    url_link_click_count >= 0 and media_view_count >= 0 and video_view_count >= 0
  )
);

create table public.content_ideas (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  raw_text text not null,
  tags text[] not null default '{}'::text[],
  status text not null default 'inbox',
  source text not null default 'manual',
  linked_post_id uuid references public.posts(id) on delete set null,
  source_entity_type text,
  source_entity_id uuid,
  favorite boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint content_ideas_raw_text_not_blank check (length(btrim(raw_text)) > 0)
);

create table public.generated_outputs (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  input_id uuid,
  input_type text,
  text text not null,
  variants jsonb not null default '[]'::jsonb,
  model text,
  provider text,
  prompt_version text,
  saved boolean not null default false,
  favorite boolean not null default false,
  copied_at timestamptz,
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint generated_outputs_type_not_blank check (length(btrim(type)) > 0),
  constraint generated_outputs_text_not_blank check (length(btrim(text)) > 0)
);

create table public.brain_dumps (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  raw_text text not null,
  extracted_themes jsonb not null default '[]'::jsonb,
  extracted_claims jsonb not null default '[]'::jsonb,
  extracted_stories jsonb not null default '[]'::jsonb,
  extracted_examples jsonb not null default '[]'::jsonb,
  extracted_contradictions jsonb not null default '[]'::jsonb,
  strong_lines jsonb not null default '[]'::jsonb,
  generated_pack jsonb not null default '{}'::jsonb,
  model text,
  provider text,
  prompt_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint brain_dumps_raw_text_not_blank check (length(btrim(raw_text)) > 0)
);

create table public.saved_inspiration_posts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text,
  platform text not null default 'x',
  platform_post_id text,
  author_username text,
  author_display_name text,
  text text not null,
  tags text[] not null default '{}'::text[],
  notes text,
  captured_at timestamptz not null default now(),
  transformed_outputs jsonb not null default '[]'::jsonb,
  plagiarism_risk_notes text,
  similarity_risk text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint saved_inspiration_posts_text_not_blank check (length(btrim(text)) > 0)
);

create table public.target_accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  display_name text,
  notes text,
  niche text,
  priority integer not null default 0,
  list_name text,
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint target_accounts_username_not_blank check (length(btrim(username)) > 0),
  constraint target_accounts_priority_nonnegative check (priority >= 0)
);

create table public.target_account_posts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_account_id uuid not null references public.target_accounts(id) on delete cascade,
  platform text not null default 'x',
  platform_post_id text,
  url text,
  author_username text,
  text text not null,
  created_at_platform timestamptz,
  source text not null default 'manual',
  impression_count bigint not null default 0,
  like_count bigint not null default 0,
  reply_count bigint not null default 0,
  repost_count bigint not null default 0,
  quote_count bigint not null default 0,
  bookmark_count bigint not null default 0,
  raw_api_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint target_account_posts_text_not_blank check (length(btrim(text)) > 0),
  constraint target_account_posts_metric_counts_nonnegative check (
    impression_count >= 0 and like_count >= 0 and reply_count >= 0 and
    repost_count >= 0 and quote_count >= 0 and bookmark_count >= 0
  )
);

create table public.reply_drafts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_account_id uuid references public.target_accounts(id) on delete set null,
  target_post_id uuid references public.target_account_posts(id) on delete set null,
  publishing_draft_id uuid,
  original_post_text text not null,
  reply_text text not null,
  reply_type text,
  status text not null default 'draft',
  copied_at timestamptz,
  used_at timestamptz,
  published_post_id uuid,
  model text,
  provider text,
  prompt_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint reply_drafts_original_post_text_not_blank check (length(btrim(original_post_text)) > 0),
  constraint reply_drafts_reply_text_not_blank check (length(btrim(reply_text)) > 0)
);

comment on column public.reply_drafts.publishing_draft_id is 'Publishing FK deferred until Phase 06/10 publishing schema exists.';
comment on column public.reply_drafts.published_post_id is 'Published-post FK deferred until publishing schema exists.';

create table public.voice_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  summary text not null,
  tone text,
  sentence_patterns jsonb not null default '[]'::jsonb,
  common_phrases jsonb not null default '[]'::jsonb,
  hook_patterns jsonb not null default '[]'::jsonb,
  topic_clusters jsonb not null default '[]'::jsonb,
  cta_patterns jsonb not null default '[]'::jsonb,
  formatting_habits jsonb not null default '{}'::jsonb,
  examples jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  post_count_used integer not null default 0,
  blog_count_used integer not null default 0,
  source_post_ids uuid[] not null default '{}'::uuid[],
  source_blog_ids uuid[] not null default '{}'::uuid[],
  is_active boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint voice_profiles_summary_not_blank check (length(btrim(summary)) > 0),
  constraint voice_profiles_counts_nonnegative check (post_count_used >= 0 and blog_count_used >= 0)
);

create table public.account_research_reports (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_account_id uuid references public.target_accounts(id) on delete set null,
  username text,
  input_source text not null default 'manual',
  input_post_ids uuid[] not null default '{}'::uuid[],
  report jsonb not null default '{}'::jsonb,
  top_posts jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  model text,
  provider text,
  prompt_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.content_coach_reports (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  question text,
  answer text,
  diagnosis jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  draft_posts jsonb not null default '[]'::jsonb,
  confidence_labels jsonb not null default '[]'::jsonb,
  model text,
  provider text,
  prompt_version text,
  generated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint content_coach_reports_kind_not_blank check (length(btrim(kind)) > 0)
);

create table public.algo_analysis_reports (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_text text not null,
  content_type text not null,
  overall_score integer,
  metric_scores jsonb not null default '{}'::jsonb,
  diagnosis jsonb not null default '{}'::jsonb,
  rewrites jsonb not null default '[]'::jsonb,
  thread_expansion jsonb not null default '{}'::jsonb,
  publish_readiness jsonb not null default '{}'::jsonb,
  risk_warnings jsonb not null default '[]'::jsonb,
  model text,
  provider text,
  prompt_version text,
  voice_profile_id uuid references public.voice_profiles(id) on delete set null,
  confidence_label text not null default 'inference',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint algo_analysis_reports_draft_text_not_blank check (length(btrim(draft_text)) > 0),
  constraint algo_analysis_reports_content_type_not_blank check (length(btrim(content_type)) > 0),
  constraint algo_analysis_reports_score_range check (overall_score is null or overall_score between 0 and 100),
  constraint algo_analysis_reports_confidence_label_check check (confidence_label in ('fact', 'inference', 'speculation', 'mixed'))
);

create table public.embeddings (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  content text not null,
  content_hash text not null,
  embedding extensions.vector(3072) not null,
  embedding_model text not null default 'text-embedding-3-large',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint embeddings_entity_type_not_blank check (length(btrim(entity_type)) > 0),
  constraint embeddings_content_not_blank check (length(btrim(content)) > 0),
  constraint embeddings_content_hash_not_blank check (length(btrim(content_hash)) > 0)
);

comment on column public.embeddings.embedding is 'Uses extensions.vector(3072) for AI_EMBEDDING_MODEL=text-embedding-3-large. Approximate HNSW indexing is deferred until row volume justifies it; all retrieval must filter by user_id.';

create table public.ai_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_type text not null,
  status text not null default 'queued',
  input_entity_type text,
  input_entity_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  provider text,
  model text,
  prompt_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_jobs_job_type_not_blank check (length(btrim(job_type)) > 0),
  constraint ai_jobs_status_check check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled'))
);

create table public.prompt_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ai_job_id uuid references public.ai_jobs(id) on delete set null,
  prompt_name text not null,
  prompt_version text not null,
  provider text not null,
  model text not null,
  input_hash text not null,
  input_redacted jsonb not null default '{}'::jsonb,
  output_redacted jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  estimated_cost_usd numeric,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint prompt_runs_prompt_name_not_blank check (length(btrim(prompt_name)) > 0),
  constraint prompt_runs_status_check check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  constraint prompt_runs_latency_nonnegative check (latency_ms is null or latency_ms >= 0),
  constraint prompt_runs_token_counts_nonnegative check (
    (input_tokens is null or input_tokens >= 0) and
    (output_tokens is null or output_tokens >= 0) and
    (total_tokens is null or total_tokens >= 0)
  )
);

create table public.sync_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_type text not null,
  status text not null default 'queued',
  started_at timestamptz,
  completed_at timestamptz,
  records_seen integer not null default 0,
  records_created integer not null default 0,
  records_updated integer not null default 0,
  records_failed integer not null default 0,
  rate_limit_reset_at timestamptz,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sync_jobs_job_type_not_blank check (length(btrim(job_type)) > 0),
  constraint sync_jobs_status_check check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  constraint sync_jobs_record_counts_nonnegative check (
    records_seen >= 0 and records_created >= 0 and records_updated >= 0 and records_failed >= 0
  )
);

create table public.audit_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  actor_email text,
  ip_hash text,
  user_agent text,
  target_type text,
  target_id uuid,
  success boolean not null default true,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_event_type_not_blank check (length(btrim(event_type)) > 0)
);

create table public.personal_save_tokens (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  token_prefix text not null,
  scopes text[] not null default array['inspiration:create']::text[],
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  rate_limit_per_hour integer not null default 30,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  constraint personal_save_tokens_name_not_blank check (length(btrim(name)) > 0),
  constraint personal_save_tokens_token_prefix_not_blank check (length(btrim(token_prefix)) > 0),
  constraint personal_save_tokens_status_check check (status in ('active', 'revoked', 'expired')),
  constraint personal_save_tokens_rate_limit_positive check (rate_limit_per_hour > 0),
  constraint personal_save_tokens_inspiration_scope_only check (scopes <@ array['inspiration:create']::text[])
);

comment on column public.personal_save_tokens.token_hash is 'Hash only; raw personal save tokens are shown once and never persisted.';
comment on column public.x_connections.encrypted_access_token is 'Encrypted OAuth token material. Do not grant this column to browser roles.';
comment on column public.x_connections.encrypted_refresh_token is 'Encrypted OAuth token material. Do not grant this column to browser roles.';

create index app_settings_user_id_idx on public.app_settings (user_id);
create index x_connections_user_id_idx on public.x_connections (user_id);
create index posts_user_id_idx on public.posts (user_id);
create index post_metric_snapshots_user_id_idx on public.post_metric_snapshots (user_id);
create index content_ideas_user_id_idx on public.content_ideas (user_id);
create index generated_outputs_user_id_idx on public.generated_outputs (user_id);
create index brain_dumps_user_id_idx on public.brain_dumps (user_id);
create index saved_inspiration_posts_user_id_idx on public.saved_inspiration_posts (user_id);
create index target_accounts_user_id_idx on public.target_accounts (user_id);
create index target_account_posts_user_id_idx on public.target_account_posts (user_id);
create index reply_drafts_user_id_idx on public.reply_drafts (user_id);
create index account_research_reports_user_id_idx on public.account_research_reports (user_id);
create index content_coach_reports_user_id_idx on public.content_coach_reports (user_id);
create index algo_analysis_reports_user_id_idx on public.algo_analysis_reports (user_id);
create index voice_profiles_user_id_idx on public.voice_profiles (user_id);
create index embeddings_user_id_idx on public.embeddings (user_id);
create index ai_jobs_user_id_idx on public.ai_jobs (user_id);
create index prompt_runs_user_id_idx on public.prompt_runs (user_id);
create index sync_jobs_user_id_idx on public.sync_jobs (user_id);
create index audit_logs_user_id_idx on public.audit_logs (user_id);
create index personal_save_tokens_user_id_idx on public.personal_save_tokens (user_id);

create unique index x_connections_x_user_id_uidx on public.x_connections (user_id, x_user_id) where x_user_id is not null;
create unique index posts_platform_post_uidx on public.posts (user_id, platform, platform_post_id) where platform_post_id is not null;
create index posts_owner_created_at_idx on public.posts (user_id, created_at_platform desc nulls last, created_at desc);
create index posts_text_search_idx on public.posts using gin (to_tsvector('english', coalesce(text, '')));
create unique index post_metric_snapshots_post_snapshot_uidx on public.post_metric_snapshots (post_id, snapshot_at);
create index post_metric_snapshots_post_id_idx on public.post_metric_snapshots (post_id);
create index content_ideas_tags_idx on public.content_ideas using gin (tags);
create index content_ideas_linked_post_id_idx on public.content_ideas (linked_post_id);
create index generated_outputs_input_idx on public.generated_outputs (user_id, input_type, input_id);
create index brain_dumps_created_at_idx on public.brain_dumps (user_id, created_at desc);
create unique index saved_inspiration_posts_url_uidx on public.saved_inspiration_posts (user_id, url) where url is not null;
create index saved_inspiration_posts_tags_idx on public.saved_inspiration_posts using gin (tags);
create unique index target_accounts_username_uidx on public.target_accounts (user_id, lower(username));
create unique index target_account_posts_platform_post_uidx on public.target_account_posts (user_id, platform, platform_post_id) where platform_post_id is not null;
create index target_account_posts_target_account_id_idx on public.target_account_posts (target_account_id);
create index reply_drafts_target_post_id_idx on public.reply_drafts (target_post_id);
create index account_research_reports_target_account_id_idx on public.account_research_reports (target_account_id);
create index algo_analysis_reports_voice_profile_id_idx on public.algo_analysis_reports (voice_profile_id);
create unique index voice_profiles_active_uidx on public.voice_profiles (user_id) where is_active and deleted_at is null;
create unique index embeddings_entity_hash_uidx on public.embeddings (user_id, entity_type, entity_id, content_hash, embedding_model);
create index embeddings_entity_idx on public.embeddings (user_id, entity_type, entity_id);
create index ai_jobs_status_idx on public.ai_jobs (user_id, status, created_at desc);
create index prompt_runs_ai_job_id_idx on public.prompt_runs (ai_job_id);
create index prompt_runs_prompt_idx on public.prompt_runs (user_id, prompt_name, created_at desc);
create index sync_jobs_status_idx on public.sync_jobs (user_id, status, created_at desc);
create index audit_logs_event_idx on public.audit_logs (user_id, event_type, created_at desc);
create index personal_save_tokens_prefix_idx on public.personal_save_tokens (token_prefix);

create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_app_settings_updated_at before update on public.app_settings for each row execute function public.set_updated_at();
create trigger set_x_connections_updated_at before update on public.x_connections for each row execute function public.set_updated_at();
create trigger set_posts_updated_at before update on public.posts for each row execute function public.set_updated_at();
create trigger set_content_ideas_updated_at before update on public.content_ideas for each row execute function public.set_updated_at();
create trigger set_generated_outputs_updated_at before update on public.generated_outputs for each row execute function public.set_updated_at();
create trigger set_brain_dumps_updated_at before update on public.brain_dumps for each row execute function public.set_updated_at();
create trigger set_saved_inspiration_posts_updated_at before update on public.saved_inspiration_posts for each row execute function public.set_updated_at();
create trigger set_target_accounts_updated_at before update on public.target_accounts for each row execute function public.set_updated_at();
create trigger set_target_account_posts_updated_at before update on public.target_account_posts for each row execute function public.set_updated_at();
create trigger set_reply_drafts_updated_at before update on public.reply_drafts for each row execute function public.set_updated_at();
create trigger set_voice_profiles_updated_at before update on public.voice_profiles for each row execute function public.set_updated_at();
create trigger set_account_research_reports_updated_at before update on public.account_research_reports for each row execute function public.set_updated_at();
create trigger set_content_coach_reports_updated_at before update on public.content_coach_reports for each row execute function public.set_updated_at();
create trigger set_algo_analysis_reports_updated_at before update on public.algo_analysis_reports for each row execute function public.set_updated_at();
create trigger set_embeddings_updated_at before update on public.embeddings for each row execute function public.set_updated_at();
create trigger set_ai_jobs_updated_at before update on public.ai_jobs for each row execute function public.set_updated_at();
create trigger set_sync_jobs_updated_at before update on public.sync_jobs for each row execute function public.set_updated_at();
create trigger set_personal_save_tokens_updated_at before update on public.personal_save_tokens for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.x_connections enable row level security;
alter table public.posts enable row level security;
alter table public.post_metric_snapshots enable row level security;
alter table public.content_ideas enable row level security;
alter table public.generated_outputs enable row level security;
alter table public.brain_dumps enable row level security;
alter table public.saved_inspiration_posts enable row level security;
alter table public.target_accounts enable row level security;
alter table public.target_account_posts enable row level security;
alter table public.reply_drafts enable row level security;
alter table public.account_research_reports enable row level security;
alter table public.content_coach_reports enable row level security;
alter table public.algo_analysis_reports enable row level security;
alter table public.voice_profiles enable row level security;
alter table public.embeddings enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.prompt_runs enable row level security;
alter table public.sync_jobs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.personal_save_tokens enable row level security;

create policy profiles_owner_select on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_owner_insert on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_owner_update on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy app_settings_owner_select on public.app_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy app_settings_owner_insert on public.app_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy app_settings_owner_update on public.app_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy app_settings_owner_delete on public.app_settings for delete to authenticated using ((select auth.uid()) = user_id);

create policy x_connections_owner_select on public.x_connections for select to authenticated using ((select auth.uid()) = user_id);
create policy x_connections_owner_insert on public.x_connections for insert to authenticated with check ((select auth.uid()) = user_id);
create policy x_connections_owner_update on public.x_connections for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy x_connections_owner_delete on public.x_connections for delete to authenticated using ((select auth.uid()) = user_id);

create policy posts_owner_select on public.posts for select to authenticated using ((select auth.uid()) = user_id);
create policy posts_owner_insert on public.posts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy posts_owner_update on public.posts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy posts_owner_delete on public.posts for delete to authenticated using ((select auth.uid()) = user_id);

create policy post_metric_snapshots_owner_select on public.post_metric_snapshots for select to authenticated using ((select auth.uid()) = user_id);
create policy post_metric_snapshots_owner_insert on public.post_metric_snapshots for insert to authenticated with check ((select auth.uid()) = user_id);

create policy content_ideas_owner_select on public.content_ideas for select to authenticated using ((select auth.uid()) = user_id);
create policy content_ideas_owner_insert on public.content_ideas for insert to authenticated with check ((select auth.uid()) = user_id);
create policy content_ideas_owner_update on public.content_ideas for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy content_ideas_owner_delete on public.content_ideas for delete to authenticated using ((select auth.uid()) = user_id);

create policy generated_outputs_owner_select on public.generated_outputs for select to authenticated using ((select auth.uid()) = user_id);
create policy generated_outputs_owner_insert on public.generated_outputs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy generated_outputs_owner_update on public.generated_outputs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy generated_outputs_owner_delete on public.generated_outputs for delete to authenticated using ((select auth.uid()) = user_id);

create policy brain_dumps_owner_select on public.brain_dumps for select to authenticated using ((select auth.uid()) = user_id);
create policy brain_dumps_owner_insert on public.brain_dumps for insert to authenticated with check ((select auth.uid()) = user_id);
create policy brain_dumps_owner_update on public.brain_dumps for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy brain_dumps_owner_delete on public.brain_dumps for delete to authenticated using ((select auth.uid()) = user_id);

create policy saved_inspiration_posts_owner_select on public.saved_inspiration_posts for select to authenticated using ((select auth.uid()) = user_id);
create policy saved_inspiration_posts_owner_insert on public.saved_inspiration_posts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy saved_inspiration_posts_owner_update on public.saved_inspiration_posts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy saved_inspiration_posts_owner_delete on public.saved_inspiration_posts for delete to authenticated using ((select auth.uid()) = user_id);

create policy target_accounts_owner_select on public.target_accounts for select to authenticated using ((select auth.uid()) = user_id);
create policy target_accounts_owner_insert on public.target_accounts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy target_accounts_owner_update on public.target_accounts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy target_accounts_owner_delete on public.target_accounts for delete to authenticated using ((select auth.uid()) = user_id);

create policy target_account_posts_owner_select on public.target_account_posts for select to authenticated using ((select auth.uid()) = user_id);
create policy target_account_posts_owner_insert on public.target_account_posts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy target_account_posts_owner_update on public.target_account_posts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy target_account_posts_owner_delete on public.target_account_posts for delete to authenticated using ((select auth.uid()) = user_id);

create policy reply_drafts_owner_select on public.reply_drafts for select to authenticated using ((select auth.uid()) = user_id);
create policy reply_drafts_owner_insert on public.reply_drafts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy reply_drafts_owner_update on public.reply_drafts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy reply_drafts_owner_delete on public.reply_drafts for delete to authenticated using ((select auth.uid()) = user_id);

create policy account_research_reports_owner_select on public.account_research_reports for select to authenticated using ((select auth.uid()) = user_id);
create policy account_research_reports_owner_insert on public.account_research_reports for insert to authenticated with check ((select auth.uid()) = user_id);
create policy account_research_reports_owner_update on public.account_research_reports for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy account_research_reports_owner_delete on public.account_research_reports for delete to authenticated using ((select auth.uid()) = user_id);

create policy content_coach_reports_owner_select on public.content_coach_reports for select to authenticated using ((select auth.uid()) = user_id);
create policy content_coach_reports_owner_insert on public.content_coach_reports for insert to authenticated with check ((select auth.uid()) = user_id);
create policy content_coach_reports_owner_update on public.content_coach_reports for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy content_coach_reports_owner_delete on public.content_coach_reports for delete to authenticated using ((select auth.uid()) = user_id);

create policy algo_analysis_reports_owner_select on public.algo_analysis_reports for select to authenticated using ((select auth.uid()) = user_id);
create policy algo_analysis_reports_owner_insert on public.algo_analysis_reports for insert to authenticated with check ((select auth.uid()) = user_id);
create policy algo_analysis_reports_owner_update on public.algo_analysis_reports for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy algo_analysis_reports_owner_delete on public.algo_analysis_reports for delete to authenticated using ((select auth.uid()) = user_id);

create policy voice_profiles_owner_select on public.voice_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy voice_profiles_owner_insert on public.voice_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy voice_profiles_owner_update on public.voice_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy voice_profiles_owner_delete on public.voice_profiles for delete to authenticated using ((select auth.uid()) = user_id);

create policy embeddings_owner_select on public.embeddings for select to authenticated using ((select auth.uid()) = user_id);
create policy embeddings_owner_insert on public.embeddings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy embeddings_owner_update on public.embeddings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy embeddings_owner_delete on public.embeddings for delete to authenticated using ((select auth.uid()) = user_id);

create policy ai_jobs_owner_select on public.ai_jobs for select to authenticated using ((select auth.uid()) = user_id);
create policy ai_jobs_owner_insert on public.ai_jobs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy ai_jobs_owner_update on public.ai_jobs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy prompt_runs_owner_select on public.prompt_runs for select to authenticated using ((select auth.uid()) = user_id);
create policy prompt_runs_owner_insert on public.prompt_runs for insert to authenticated with check ((select auth.uid()) = user_id);

create policy sync_jobs_owner_select on public.sync_jobs for select to authenticated using ((select auth.uid()) = user_id);
create policy sync_jobs_owner_insert on public.sync_jobs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy sync_jobs_owner_update on public.sync_jobs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy audit_logs_owner_select on public.audit_logs for select to authenticated using ((select auth.uid()) = user_id);
create policy audit_logs_owner_insert on public.audit_logs for insert to authenticated with check ((select auth.uid()) = user_id);

create policy personal_save_tokens_owner_select on public.personal_save_tokens for select to authenticated using ((select auth.uid()) = user_id);
create policy personal_save_tokens_owner_insert on public.personal_save_tokens for insert to authenticated with check ((select auth.uid()) = user_id);
create policy personal_save_tokens_owner_update on public.personal_save_tokens for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy personal_save_tokens_owner_delete on public.personal_save_tokens for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on all tables in schema public from anon, authenticated;
revoke all on table public.x_connections from anon, authenticated;
revoke all on table public.personal_save_tokens from anon, authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table
  public.app_settings,
  public.posts,
  public.content_ideas,
  public.generated_outputs,
  public.brain_dumps,
  public.saved_inspiration_posts,
  public.target_accounts,
  public.target_account_posts,
  public.reply_drafts,
  public.account_research_reports,
  public.content_coach_reports,
  public.algo_analysis_reports,
  public.voice_profiles,
  public.embeddings
  to authenticated;

grant select, insert, update on table public.ai_jobs, public.sync_jobs to authenticated;
grant select, insert on table public.post_metric_snapshots, public.prompt_runs, public.audit_logs to authenticated;

grant select (
  id,
  user_id,
  x_user_id,
  username,
  display_name,
  avatar_url,
  token_expires_at,
  scopes,
  status,
  capabilities,
  last_synced_at,
  last_error,
  metadata,
  created_at,
  updated_at,
  deleted_at
) on public.x_connections to authenticated;

grant select (
  id,
  user_id,
  name,
  token_prefix,
  scopes,
  status,
  created_at,
  updated_at,
  last_used_at,
  revoked_at,
  expires_at,
  rate_limit_per_hour,
  metadata,
  deleted_at
) on public.personal_save_tokens to authenticated;
