-- CreatorOS Personal Phase 06: publishing, blog, growth schema and RLS.
-- This migration adds storage only. It does not implement external X writes, publishing UI, or autonomous actions.

create table public.content_pillars (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  priority integer not null default 0,
  examples jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint content_pillars_name_not_blank check (length(btrim(name)) > 0),
  constraint content_pillars_priority_nonnegative check (priority >= 0)
);

create table public.growth_goals (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  metric_key text not null,
  target_value numeric,
  start_date date,
  end_date date,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint growth_goals_title_not_blank check (length(btrim(title)) > 0),
  constraint growth_goals_metric_key_not_blank check (length(btrim(metric_key)) > 0),
  constraint growth_goals_status_check check (status in ('active', 'paused', 'completed', 'archived', 'canceled')),
  constraint growth_goals_date_order_check check (end_date is null or start_date is null or end_date >= start_date),
  constraint growth_goals_target_nonnegative check (target_value is null or target_value >= 0)
);

create table public.campaigns (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  objective text,
  status text not null default 'draft',
  pillar_id uuid references public.content_pillars(id) on delete set null,
  start_date date,
  end_date date,
  hypothesis text,
  target_metrics jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint campaigns_name_not_blank check (length(btrim(name)) > 0),
  constraint campaigns_status_check check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  constraint campaigns_date_order_check check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.experiments (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  experiment_type text not null,
  title text not null,
  hypothesis text,
  start_date date,
  end_date date,
  status text not null default 'draft',
  success_metric text,
  content_filters jsonb not null default '{}'::jsonb,
  decision text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint experiments_type_not_blank check (length(btrim(experiment_type)) > 0),
  constraint experiments_title_not_blank check (length(btrim(title)) > 0),
  constraint experiments_status_check check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  constraint experiments_decision_check check (decision is null or decision in ('continue', 'stop', 'iterate', 'scale')),
  constraint experiments_date_order_check check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.media_assets (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_provider text not null default 'supabase',
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  width integer,
  height integer,
  duration_ms integer,
  alt_text text,
  x_media_id text,
  x_upload_status text not null default 'not_uploaded',
  checksum text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint media_assets_storage_provider_not_blank check (length(btrim(storage_provider)) > 0),
  constraint media_assets_storage_path_not_blank check (length(btrim(storage_path)) > 0),
  constraint media_assets_original_filename_not_blank check (length(btrim(original_filename)) > 0),
  constraint media_assets_mime_type_not_blank check (length(btrim(mime_type)) > 0),
  constraint media_assets_size_bytes_positive check (size_bytes > 0),
  constraint media_assets_dimensions_nonnegative check (
    (width is null or width >= 0) and (height is null or height >= 0) and (duration_ms is null or duration_ms >= 0)
  ),
  constraint media_assets_upload_status_check check (x_upload_status in ('not_uploaded', 'pending', 'uploaded', 'failed', 'skipped'))
);

create table public.content_calendar_items (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null,
  entity_type text not null,
  entity_id uuid,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null default 'UTC',
  status text not null default 'planned',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint content_calendar_items_item_type_check check (item_type in ('publishing', 'blog', 'campaign', 'experiment', 'review', 'custom')),
  constraint content_calendar_items_entity_type_not_blank check (length(btrim(entity_type)) > 0),
  constraint content_calendar_items_title_not_blank check (length(btrim(title)) > 0),
  constraint content_calendar_items_status_check check (status in ('planned', 'scheduled', 'in_progress', 'published', 'completed', 'missed', 'canceled', 'archived')),
  constraint content_calendar_items_date_order_check check (ends_at is null or ends_at >= starts_at)
);

create table public.publishing_drafts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null,
  source_type text,
  source_id uuid,
  source_post_id uuid references public.posts(id) on delete set null,
  source_content_idea_id uuid references public.content_ideas(id) on delete set null,
  source_generated_output_id uuid references public.generated_outputs(id) on delete set null,
  text text not null default '',
  thread_items jsonb not null default '[]'::jsonb,
  quote_post_id text,
  reply_to_post_id text,
  media_asset_ids uuid[] not null default '{}'::uuid[],
  status text not null default 'draft',
  approval_status text not null default 'pending',
  approval_payload_hash text,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approval_audit_log_id uuid references public.audit_logs(id) on delete set null,
  scheduled_at timestamptz,
  timezone text not null default 'UTC',
  campaign_id uuid references public.campaigns(id) on delete set null,
  experiment_id uuid references public.experiments(id) on delete set null,
  duplicate_check jsonb not null default '{}'::jsonb,
  similarity_check jsonb not null default '{}'::jsonb,
  risk_check jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint publishing_drafts_content_type_check check (
    content_type in ('single_post', 'thread', 'reply', 'quote_post', 'blog_post', 'blog_to_x_thread', 'blog_to_x_series', 'campaign_sequence')
  ),
  constraint publishing_drafts_body_present_check check (length(btrim(text)) > 0 or jsonb_array_length(thread_items) > 0),
  constraint publishing_drafts_status_check check (
    status in ('draft', 'ai_generated', 'owner_edited', 'analyzed', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'canceled', 'archived')
  ),
  constraint publishing_drafts_approval_status_check check (approval_status in ('pending', 'approved', 'invalidated', 'revoked')),
  constraint publishing_drafts_approved_payload_check check (
    approval_status <> 'approved' or (approval_payload_hash is not null and approved_at is not null and approved_by is not null)
  )
);

comment on column public.publishing_drafts.approval_payload_hash is 'Exact owner-approved payload hash. Editing content must invalidate this approval before any external write.';
comment on column public.publishing_drafts.source_post_id is 'Optional typed source FK for X-to-publishing workflows; source_type/source_id preserves generic provenance.';
comment on column public.publishing_drafts.source_content_idea_id is 'Optional typed source FK for idea-to-publishing workflows; source_type/source_id preserves generic provenance.';
comment on column public.publishing_drafts.source_generated_output_id is 'Optional typed source FK for AI-output-to-publishing workflows; source_type/source_id preserves generic provenance.';

create table public.publishing_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  publishing_draft_id uuid not null references public.publishing_drafts(id) on delete cascade,
  job_type text not null default 'publish',
  status text not null default 'queued',
  idempotency_key text not null,
  attempt_count integer not null default 0,
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  x_request_payload jsonb not null default '{}'::jsonb,
  x_response_payload jsonb not null default '{}'::jsonb,
  rate_limit_reset_at timestamptz,
  error_code text,
  error text,
  audit_log_id uuid references public.audit_logs(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint publishing_jobs_job_type_check check (job_type in ('dry_run', 'publish', 'retry', 'manual_mark', 'reconcile')),
  constraint publishing_jobs_status_check check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  constraint publishing_jobs_idempotency_key_not_blank check (length(btrim(idempotency_key)) > 0),
  constraint publishing_jobs_attempt_count_nonnegative check (attempt_count >= 0),
  constraint publishing_jobs_completion_order_check check (completed_at is null or started_at is null or completed_at >= started_at)
);

comment on column public.publishing_jobs.x_request_payload is 'Redacted external-write payload only. Do not store OAuth tokens or secrets.';
comment on column public.publishing_jobs.x_response_payload is 'Redacted X response payload only. Do not store OAuth tokens or secrets.';

create table public.scheduled_posts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  publishing_draft_id uuid not null references public.publishing_drafts(id) on delete cascade,
  scheduled_for timestamptz not null,
  timezone text not null default 'UTC',
  status text not null default 'scheduled',
  calendar_item_id uuid references public.content_calendar_items(id) on delete set null,
  lock_token text,
  locked_at timestamptz,
  scheduled_audit_log_id uuid references public.audit_logs(id) on delete set null,
  canceled_audit_log_id uuid references public.audit_logs(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint scheduled_posts_status_check check (status in ('scheduled', 'locked', 'publishing', 'published', 'failed', 'canceled', 'missed')),
  constraint scheduled_posts_lock_consistency_check check ((lock_token is null and locked_at is null) or (lock_token is not null and locked_at is not null))
);

create table public.published_posts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  publishing_draft_id uuid references public.publishing_drafts(id) on delete set null,
  publishing_job_id uuid references public.publishing_jobs(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  platform text not null default 'x',
  platform_post_id text,
  url text,
  content_type text not null,
  published_at timestamptz not null default now(),
  published_via text not null default 'api',
  thread_root_post_id text,
  thread_post_ids text[] not null default '{}'::text[],
  quote_target_post_id text,
  reply_target_post_id text,
  raw_api_payload jsonb not null default '{}'::jsonb,
  audit_log_id uuid references public.audit_logs(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint published_posts_platform_not_blank check (length(btrim(platform)) > 0),
  constraint published_posts_content_type_check check (
    content_type in ('single_post', 'thread', 'reply', 'quote_post', 'blog_post', 'blog_to_x_thread', 'blog_to_x_series', 'campaign_sequence')
  ),
  constraint published_posts_published_via_check check (published_via in ('api', 'manual', 'reconciled'))
);

create table public.publishing_failures (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  publishing_job_id uuid not null references public.publishing_jobs(id) on delete cascade,
  publishing_draft_id uuid not null references public.publishing_drafts(id) on delete cascade,
  failure_type text not null,
  provider_error_code text,
  sanitized_message text,
  retryable boolean not null default false,
  retry_after timestamptz,
  raw_error_redacted jsonb not null default '{}'::jsonb,
  audit_log_id uuid references public.audit_logs(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint publishing_failures_failure_type_not_blank check (length(btrim(failure_type)) > 0)
);

comment on column public.publishing_failures.raw_error_redacted is 'Redacted provider error payload only. Do not store OAuth tokens, API keys, or secrets.';

create table public.blog_posts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  slug text,
  status text not null default 'idea',
  source_type text,
  source_id uuid,
  source_post_id uuid references public.posts(id) on delete set null,
  source_content_idea_id uuid references public.content_ideas(id) on delete set null,
  source_generated_output_id uuid references public.generated_outputs(id) on delete set null,
  excerpt text,
  markdown text not null default '',
  html text,
  json_doc jsonb not null default '{}'::jsonb,
  seo_title text,
  meta_description text,
  canonical_summary text,
  tags text[] not null default '{}'::text[],
  categories text[] not null default '{}'::text[],
  word_count integer not null default 0,
  reading_time_minutes integer not null default 0,
  campaign_id uuid references public.campaigns(id) on delete set null,
  experiment_id uuid references public.experiments(id) on delete set null,
  published_external_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint blog_posts_title_not_blank check (length(btrim(title)) > 0),
  constraint blog_posts_status_check check (status in ('idea', 'outlining', 'drafting', 'editing', 'ready', 'exported', 'published_externally', 'archived')),
  constraint blog_posts_counts_nonnegative check (word_count >= 0 and reading_time_minutes >= 0)
);

comment on column public.blog_posts.source_post_id is 'Optional typed source FK for X-to-blog workflows; source_type/source_id preserves generic provenance.';
comment on column public.blog_posts.source_content_idea_id is 'Optional typed source FK for idea-to-blog workflows; source_type/source_id preserves generic provenance.';
comment on column public.blog_posts.source_generated_output_id is 'Optional typed source FK for AI-output-to-blog workflows; source_type/source_id preserves generic provenance.';

create table public.blog_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  blog_post_id uuid not null references public.blog_posts(id) on delete cascade,
  version_number integer not null,
  title text not null,
  markdown text not null default '',
  html text,
  json_doc jsonb not null default '{}'::jsonb,
  change_reason text,
  model text,
  provider text,
  prompt_version text,
  created_by text not null default 'owner',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint blog_versions_version_number_positive check (version_number > 0),
  constraint blog_versions_title_not_blank check (length(btrim(title)) > 0),
  constraint blog_versions_created_by_check check (created_by in ('owner', 'ai', 'system'))
);

create table public.blog_exports (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  blog_post_id uuid not null references public.blog_posts(id) on delete cascade,
  format text not null,
  export_payload text,
  storage_path text,
  exported_at timestamptz not null default now(),
  checksum text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint blog_exports_format_check check (format in ('markdown', 'html', 'json', 'mdx'))
);

create table public.blog_repurposing_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  blog_post_id uuid references public.blog_posts(id) on delete set null,
  source_post_id uuid references public.posts(id) on delete set null,
  direction text not null,
  status text not null default 'queued',
  output_publishing_draft_ids uuid[] not null default '{}'::uuid[],
  output_generated_output_ids uuid[] not null default '{}'::uuid[],
  model text,
  provider text,
  prompt_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint blog_repurposing_jobs_direction_check check (direction in ('blog_to_x', 'x_to_blog')),
  constraint blog_repurposing_jobs_status_check check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  constraint blog_repurposing_jobs_source_check check (blog_post_id is not null or source_post_id is not null)
);

create table public.campaign_items (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  publishing_draft_id uuid references public.publishing_drafts(id) on delete set null,
  blog_post_id uuid references public.blog_posts(id) on delete set null,
  published_post_id uuid references public.published_posts(id) on delete set null,
  role text,
  sequence_index integer not null default 0,
  scheduled_for timestamptz,
  status text not null default 'planned',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint campaign_items_entity_type_check check (entity_type in ('x_post', 'x_thread', 'reply', 'quote_post', 'blog_post', 'blog_to_x_series')),
  constraint campaign_items_sequence_index_nonnegative check (sequence_index >= 0),
  constraint campaign_items_status_check check (status in ('planned', 'drafted', 'scheduled', 'published', 'completed', 'failed', 'canceled', 'archived'))
);

create table public.experiment_results (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  metrics jsonb not null default '{}'::jsonb,
  baseline_metrics jsonb not null default '{}'::jsonb,
  result text,
  ai_interpretation jsonb not null default '{}'::jsonb,
  decision text,
  generated_at timestamptz not null default now(),
  model text,
  provider text,
  prompt_version text,
  confidence_label text not null default 'mixed',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint experiment_results_decision_check check (decision is null or decision in ('continue', 'stop', 'iterate', 'scale')),
  constraint experiment_results_confidence_label_check check (confidence_label in ('fact', 'inference', 'speculation', 'mixed'))
);

create table public.weekly_reviews (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  report jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  model text,
  provider text,
  prompt_version text,
  confidence_label text not null default 'mixed',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint weekly_reviews_date_order_check check (week_end >= week_start),
  constraint weekly_reviews_confidence_label_check check (confidence_label in ('fact', 'inference', 'speculation', 'mixed'))
);

create table public.monthly_reviews (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null,
  month_end date not null,
  report jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  strategy_changes jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  model text,
  provider text,
  prompt_version text,
  confidence_label text not null default 'mixed',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint monthly_reviews_date_order_check check (month_end >= month_start),
  constraint monthly_reviews_confidence_label_check check (confidence_label in ('fact', 'inference', 'speculation', 'mixed'))
);

create table public.profile_audits (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  input_snapshot jsonb not null default '{}'::jsonb,
  score integer,
  findings jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  suggested_pinned_post_drafts jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  model text,
  provider text,
  prompt_version text,
  confidence_label text not null default 'mixed',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint profile_audits_score_range check (score is null or score between 0 and 100),
  constraint profile_audits_confidence_label_check check (confidence_label in ('fact', 'inference', 'speculation', 'mixed'))
);

create index publishing_drafts_user_id_idx on public.publishing_drafts (user_id);
create index publishing_jobs_user_id_idx on public.publishing_jobs (user_id);
create index scheduled_posts_user_id_idx on public.scheduled_posts (user_id);
create index published_posts_user_id_idx on public.published_posts (user_id);
create index publishing_failures_user_id_idx on public.publishing_failures (user_id);
create index media_assets_user_id_idx on public.media_assets (user_id);
create index content_calendar_items_user_id_idx on public.content_calendar_items (user_id);
create index blog_posts_user_id_idx on public.blog_posts (user_id);
create index blog_versions_user_id_idx on public.blog_versions (user_id);
create index blog_exports_user_id_idx on public.blog_exports (user_id);
create index blog_repurposing_jobs_user_id_idx on public.blog_repurposing_jobs (user_id);
create index growth_goals_user_id_idx on public.growth_goals (user_id);
create index content_pillars_user_id_idx on public.content_pillars (user_id);
create index campaigns_user_id_idx on public.campaigns (user_id);
create index campaign_items_user_id_idx on public.campaign_items (user_id);
create index experiments_user_id_idx on public.experiments (user_id);
create index experiment_results_user_id_idx on public.experiment_results (user_id);
create index weekly_reviews_user_id_idx on public.weekly_reviews (user_id);
create index monthly_reviews_user_id_idx on public.monthly_reviews (user_id);
create index profile_audits_user_id_idx on public.profile_audits (user_id);

create unique index content_pillars_name_uidx on public.content_pillars (user_id, lower(name)) where deleted_at is null;
create index content_pillars_active_idx on public.content_pillars (user_id, active, priority);
create index growth_goals_status_idx on public.growth_goals (user_id, status, end_date);
create unique index campaigns_name_uidx on public.campaigns (user_id, lower(name)) where deleted_at is null;
create index campaigns_status_idx on public.campaigns (user_id, status, start_date, end_date);
create index campaigns_pillar_id_idx on public.campaigns (pillar_id);
create index experiments_status_idx on public.experiments (user_id, status, start_date, end_date);
create index experiments_filters_idx on public.experiments using gin (content_filters);

create index media_assets_upload_status_idx on public.media_assets (user_id, x_upload_status, created_at desc);
create unique index media_assets_storage_path_uidx on public.media_assets (user_id, storage_path) where deleted_at is null;
create unique index media_assets_x_media_id_uidx on public.media_assets (user_id, x_media_id) where x_media_id is not null;
create index media_assets_checksum_idx on public.media_assets (user_id, checksum) where checksum is not null;
create index content_calendar_items_starts_at_idx on public.content_calendar_items (user_id, starts_at, status) where deleted_at is null;
create index content_calendar_items_entity_idx on public.content_calendar_items (user_id, entity_type, entity_id) where entity_id is not null;

create index publishing_drafts_status_idx on public.publishing_drafts (user_id, status, updated_at desc) where deleted_at is null;
create index publishing_drafts_campaign_id_idx on public.publishing_drafts (campaign_id) where campaign_id is not null;
create index publishing_drafts_experiment_id_idx on public.publishing_drafts (experiment_id) where experiment_id is not null;
create index publishing_drafts_source_post_id_idx on public.publishing_drafts (source_post_id) where source_post_id is not null;
create index publishing_drafts_source_content_idea_id_idx on public.publishing_drafts (source_content_idea_id) where source_content_idea_id is not null;
create index publishing_drafts_source_generated_output_id_idx on public.publishing_drafts (source_generated_output_id) where source_generated_output_id is not null;
create index publishing_drafts_media_asset_ids_idx on public.publishing_drafts using gin (media_asset_ids);
create index publishing_drafts_risk_check_idx on public.publishing_drafts using gin (risk_check);
create unique index publishing_jobs_idempotency_key_uidx on public.publishing_jobs (idempotency_key);
create index publishing_jobs_status_idx on public.publishing_jobs (user_id, status, scheduled_for nulls first, created_at desc);
create index publishing_jobs_draft_id_idx on public.publishing_jobs (publishing_draft_id, created_at desc);
create unique index scheduled_posts_active_draft_uidx on public.scheduled_posts (publishing_draft_id) where deleted_at is null and status in ('scheduled', 'locked', 'publishing');
create index scheduled_posts_due_idx on public.scheduled_posts (scheduled_for, user_id) where status = 'scheduled' and deleted_at is null;
create index scheduled_posts_calendar_item_id_idx on public.scheduled_posts (calendar_item_id) where calendar_item_id is not null;
create unique index published_posts_platform_post_uidx on public.published_posts (user_id, platform, platform_post_id) where platform_post_id is not null;
create index published_posts_draft_id_idx on public.published_posts (publishing_draft_id) where publishing_draft_id is not null;
create index published_posts_post_id_idx on public.published_posts (post_id) where post_id is not null;
create index publishing_failures_job_id_idx on public.publishing_failures (publishing_job_id, created_at desc);
create index publishing_failures_retry_idx on public.publishing_failures (user_id, retry_after) where retryable;

create unique index blog_posts_slug_uidx on public.blog_posts (user_id, lower(slug)) where slug is not null and deleted_at is null;
create index blog_posts_status_idx on public.blog_posts (user_id, status, updated_at desc) where deleted_at is null;
create index blog_posts_campaign_id_idx on public.blog_posts (campaign_id) where campaign_id is not null;
create index blog_posts_experiment_id_idx on public.blog_posts (experiment_id) where experiment_id is not null;
create index blog_posts_source_post_id_idx on public.blog_posts (source_post_id) where source_post_id is not null;
create index blog_posts_source_content_idea_id_idx on public.blog_posts (source_content_idea_id) where source_content_idea_id is not null;
create index blog_posts_source_generated_output_id_idx on public.blog_posts (source_generated_output_id) where source_generated_output_id is not null;
create index blog_posts_tags_idx on public.blog_posts using gin (tags);
create index blog_posts_categories_idx on public.blog_posts using gin (categories);
create index blog_posts_text_search_idx on public.blog_posts using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(excerpt, '') || ' ' || coalesce(markdown, '')));
create unique index blog_versions_post_version_uidx on public.blog_versions (blog_post_id, version_number);
create index blog_versions_blog_post_id_idx on public.blog_versions (blog_post_id, created_at desc);
create index blog_exports_blog_post_id_idx on public.blog_exports (blog_post_id, exported_at desc);
create unique index blog_exports_checksum_uidx on public.blog_exports (blog_post_id, format, checksum) where checksum is not null;
create index blog_repurposing_jobs_status_idx on public.blog_repurposing_jobs (user_id, status, created_at desc) where deleted_at is null;
create index blog_repurposing_jobs_blog_post_id_idx on public.blog_repurposing_jobs (blog_post_id) where blog_post_id is not null;
create index blog_repurposing_jobs_source_post_id_idx on public.blog_repurposing_jobs (source_post_id) where source_post_id is not null;

create index campaign_items_campaign_id_idx on public.campaign_items (campaign_id, sequence_index);
create index campaign_items_status_idx on public.campaign_items (user_id, status, scheduled_for) where deleted_at is null;
create index campaign_items_entity_idx on public.campaign_items (user_id, entity_type, entity_id) where entity_id is not null;
create index campaign_items_publishing_draft_id_idx on public.campaign_items (publishing_draft_id) where publishing_draft_id is not null;
create index campaign_items_blog_post_id_idx on public.campaign_items (blog_post_id) where blog_post_id is not null;
create index campaign_items_published_post_id_idx on public.campaign_items (published_post_id) where published_post_id is not null;
create index experiment_results_experiment_id_idx on public.experiment_results (experiment_id, generated_at desc);
create unique index weekly_reviews_period_uidx on public.weekly_reviews (user_id, week_start);
create unique index monthly_reviews_period_uidx on public.monthly_reviews (user_id, month_start);
create index profile_audits_generated_at_idx on public.profile_audits (user_id, generated_at desc);

create trigger set_content_pillars_updated_at before update on public.content_pillars for each row execute function public.set_updated_at();
create trigger set_growth_goals_updated_at before update on public.growth_goals for each row execute function public.set_updated_at();
create trigger set_campaigns_updated_at before update on public.campaigns for each row execute function public.set_updated_at();
create trigger set_experiments_updated_at before update on public.experiments for each row execute function public.set_updated_at();
create trigger set_media_assets_updated_at before update on public.media_assets for each row execute function public.set_updated_at();
create trigger set_content_calendar_items_updated_at before update on public.content_calendar_items for each row execute function public.set_updated_at();
create trigger set_publishing_drafts_updated_at before update on public.publishing_drafts for each row execute function public.set_updated_at();
create trigger set_publishing_jobs_updated_at before update on public.publishing_jobs for each row execute function public.set_updated_at();
create trigger set_scheduled_posts_updated_at before update on public.scheduled_posts for each row execute function public.set_updated_at();
create trigger set_published_posts_updated_at before update on public.published_posts for each row execute function public.set_updated_at();
create trigger set_blog_posts_updated_at before update on public.blog_posts for each row execute function public.set_updated_at();
create trigger set_blog_repurposing_jobs_updated_at before update on public.blog_repurposing_jobs for each row execute function public.set_updated_at();
create trigger set_campaign_items_updated_at before update on public.campaign_items for each row execute function public.set_updated_at();

alter table public.publishing_drafts enable row level security;
alter table public.publishing_jobs enable row level security;
alter table public.scheduled_posts enable row level security;
alter table public.published_posts enable row level security;
alter table public.publishing_failures enable row level security;
alter table public.media_assets enable row level security;
alter table public.content_calendar_items enable row level security;
alter table public.blog_posts enable row level security;
alter table public.blog_versions enable row level security;
alter table public.blog_exports enable row level security;
alter table public.blog_repurposing_jobs enable row level security;
alter table public.growth_goals enable row level security;
alter table public.content_pillars enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_items enable row level security;
alter table public.experiments enable row level security;
alter table public.experiment_results enable row level security;
alter table public.weekly_reviews enable row level security;
alter table public.monthly_reviews enable row level security;
alter table public.profile_audits enable row level security;

create policy publishing_drafts_owner_select on public.publishing_drafts for select to authenticated using ((select auth.uid()) = user_id);
create policy publishing_drafts_owner_insert on public.publishing_drafts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy publishing_drafts_owner_update on public.publishing_drafts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy publishing_drafts_owner_delete on public.publishing_drafts for delete to authenticated using ((select auth.uid()) = user_id);

create policy publishing_jobs_owner_select on public.publishing_jobs for select to authenticated using ((select auth.uid()) = user_id);
create policy publishing_jobs_owner_insert on public.publishing_jobs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy publishing_jobs_owner_update on public.publishing_jobs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy scheduled_posts_owner_select on public.scheduled_posts for select to authenticated using ((select auth.uid()) = user_id);
create policy scheduled_posts_owner_insert on public.scheduled_posts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy scheduled_posts_owner_update on public.scheduled_posts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy scheduled_posts_owner_delete on public.scheduled_posts for delete to authenticated using ((select auth.uid()) = user_id);

create policy published_posts_owner_select on public.published_posts for select to authenticated using ((select auth.uid()) = user_id);
create policy published_posts_owner_insert on public.published_posts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy published_posts_owner_update on public.published_posts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy published_posts_owner_delete on public.published_posts for delete to authenticated using ((select auth.uid()) = user_id);

create policy publishing_failures_owner_select on public.publishing_failures for select to authenticated using ((select auth.uid()) = user_id);
create policy publishing_failures_owner_insert on public.publishing_failures for insert to authenticated with check ((select auth.uid()) = user_id);

create policy media_assets_owner_select on public.media_assets for select to authenticated using ((select auth.uid()) = user_id);
create policy media_assets_owner_insert on public.media_assets for insert to authenticated with check ((select auth.uid()) = user_id);
create policy media_assets_owner_update on public.media_assets for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy media_assets_owner_delete on public.media_assets for delete to authenticated using ((select auth.uid()) = user_id);

create policy content_calendar_items_owner_select on public.content_calendar_items for select to authenticated using ((select auth.uid()) = user_id);
create policy content_calendar_items_owner_insert on public.content_calendar_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy content_calendar_items_owner_update on public.content_calendar_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy content_calendar_items_owner_delete on public.content_calendar_items for delete to authenticated using ((select auth.uid()) = user_id);

create policy blog_posts_owner_select on public.blog_posts for select to authenticated using ((select auth.uid()) = user_id);
create policy blog_posts_owner_insert on public.blog_posts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy blog_posts_owner_update on public.blog_posts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy blog_posts_owner_delete on public.blog_posts for delete to authenticated using ((select auth.uid()) = user_id);

create policy blog_versions_owner_select on public.blog_versions for select to authenticated using ((select auth.uid()) = user_id);
create policy blog_versions_owner_insert on public.blog_versions for insert to authenticated with check ((select auth.uid()) = user_id);

create policy blog_exports_owner_select on public.blog_exports for select to authenticated using ((select auth.uid()) = user_id);
create policy blog_exports_owner_insert on public.blog_exports for insert to authenticated with check ((select auth.uid()) = user_id);

create policy blog_repurposing_jobs_owner_select on public.blog_repurposing_jobs for select to authenticated using ((select auth.uid()) = user_id);
create policy blog_repurposing_jobs_owner_insert on public.blog_repurposing_jobs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy blog_repurposing_jobs_owner_update on public.blog_repurposing_jobs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy blog_repurposing_jobs_owner_delete on public.blog_repurposing_jobs for delete to authenticated using ((select auth.uid()) = user_id);

create policy growth_goals_owner_select on public.growth_goals for select to authenticated using ((select auth.uid()) = user_id);
create policy growth_goals_owner_insert on public.growth_goals for insert to authenticated with check ((select auth.uid()) = user_id);
create policy growth_goals_owner_update on public.growth_goals for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy growth_goals_owner_delete on public.growth_goals for delete to authenticated using ((select auth.uid()) = user_id);

create policy content_pillars_owner_select on public.content_pillars for select to authenticated using ((select auth.uid()) = user_id);
create policy content_pillars_owner_insert on public.content_pillars for insert to authenticated with check ((select auth.uid()) = user_id);
create policy content_pillars_owner_update on public.content_pillars for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy content_pillars_owner_delete on public.content_pillars for delete to authenticated using ((select auth.uid()) = user_id);

create policy campaigns_owner_select on public.campaigns for select to authenticated using ((select auth.uid()) = user_id);
create policy campaigns_owner_insert on public.campaigns for insert to authenticated with check ((select auth.uid()) = user_id);
create policy campaigns_owner_update on public.campaigns for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy campaigns_owner_delete on public.campaigns for delete to authenticated using ((select auth.uid()) = user_id);

create policy campaign_items_owner_select on public.campaign_items for select to authenticated using ((select auth.uid()) = user_id);
create policy campaign_items_owner_insert on public.campaign_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy campaign_items_owner_update on public.campaign_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy campaign_items_owner_delete on public.campaign_items for delete to authenticated using ((select auth.uid()) = user_id);

create policy experiments_owner_select on public.experiments for select to authenticated using ((select auth.uid()) = user_id);
create policy experiments_owner_insert on public.experiments for insert to authenticated with check ((select auth.uid()) = user_id);
create policy experiments_owner_update on public.experiments for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy experiments_owner_delete on public.experiments for delete to authenticated using ((select auth.uid()) = user_id);

create policy experiment_results_owner_select on public.experiment_results for select to authenticated using ((select auth.uid()) = user_id);
create policy experiment_results_owner_insert on public.experiment_results for insert to authenticated with check ((select auth.uid()) = user_id);

create policy weekly_reviews_owner_select on public.weekly_reviews for select to authenticated using ((select auth.uid()) = user_id);
create policy weekly_reviews_owner_insert on public.weekly_reviews for insert to authenticated with check ((select auth.uid()) = user_id);

create policy monthly_reviews_owner_select on public.monthly_reviews for select to authenticated using ((select auth.uid()) = user_id);
create policy monthly_reviews_owner_insert on public.monthly_reviews for insert to authenticated with check ((select auth.uid()) = user_id);

create policy profile_audits_owner_select on public.profile_audits for select to authenticated using ((select auth.uid()) = user_id);
create policy profile_audits_owner_insert on public.profile_audits for insert to authenticated with check ((select auth.uid()) = user_id);

revoke all on table
  public.publishing_drafts,
  public.publishing_jobs,
  public.scheduled_posts,
  public.published_posts,
  public.publishing_failures,
  public.media_assets,
  public.content_calendar_items,
  public.blog_posts,
  public.blog_versions,
  public.blog_exports,
  public.blog_repurposing_jobs,
  public.growth_goals,
  public.content_pillars,
  public.campaigns,
  public.campaign_items,
  public.experiments,
  public.experiment_results,
  public.weekly_reviews,
  public.monthly_reviews,
  public.profile_audits
  from anon, authenticated;

grant select, insert, update, delete on table
  public.publishing_drafts,
  public.scheduled_posts,
  public.published_posts,
  public.media_assets,
  public.content_calendar_items,
  public.blog_posts,
  public.blog_repurposing_jobs,
  public.growth_goals,
  public.content_pillars,
  public.campaigns,
  public.campaign_items,
  public.experiments
  to authenticated;

grant select, insert, update on table public.publishing_jobs to authenticated;

grant select, insert on table
  public.publishing_failures,
  public.blog_versions,
  public.blog_exports,
  public.experiment_results,
  public.weekly_reviews,
  public.monthly_reviews,
  public.profile_audits
  to authenticated;

alter table public.reply_drafts add constraint reply_drafts_publishing_draft_id_fkey
  foreign key (publishing_draft_id) references public.publishing_drafts(id) on delete set null;
alter table public.reply_drafts add constraint reply_drafts_published_post_id_fkey
  foreign key (published_post_id) references public.published_posts(id) on delete set null;

comment on column public.reply_drafts.publishing_draft_id is 'References Phase 06 publishing_drafts after the publishing schema is available.';
comment on column public.reply_drafts.published_post_id is 'References Phase 06 published_posts after the publishing schema is available.';