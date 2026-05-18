export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamp = string;
type Uuid = string;
type Nullable<T> = T | null;
type Vector = number[];

type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

type MutableOwnerRow = {
  id: Uuid;
  user_id: Uuid;
  metadata: Json;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Nullable<Timestamp>;
};

type MutableJobRow = {
  id: Uuid;
  user_id: Uuid;
  metadata: Json;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type AppendOnlyOwnerRow = {
  id: Uuid;
  user_id: Uuid;
  metadata: Json;
  created_at: Timestamp;
};

type AiAttributionColumns = {
  model: Nullable<string>;
  provider: Nullable<string>;
  prompt_version: Nullable<string>;
};

type ConfidenceColumn = {
  confidence_label: string;
};

type PostMetrics = {
  impression_count: number;
  like_count: number;
  reply_count: number;
  repost_count: number;
  quote_count: number;
  bookmark_count: number;
};

type ExtendedPostMetrics = PostMetrics & {
  profile_click_count: number;
  url_link_click_count: number;
  media_view_count: number;
  video_view_count: number;
};

type ScoreColumns = {
  engagement_rate: Nullable<number>;
  virality_score: Nullable<number>;
  quality_score: Nullable<number>;
  heuristic_score: Nullable<number>;
};

export type ProfileRow = {
  id: Uuid;
  email: string;
  display_name: Nullable<string>;
  avatar_url: Nullable<string>;
  is_admin: boolean;
  last_seen_at: Nullable<Timestamp>;
  metadata: Json;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type AppSettingsRow = MutableOwnerRow & {
  theme: string;
  ai_provider: string;
  ai_model: string;
  ai_thinking_type: string;
  ai_effort: string;
  ai_max_tokens: number;
  x_sync_enabled: boolean;
  publishing_enabled: boolean;
  default_timezone: string;
};

export type XConnectionRow = MutableOwnerRow & {
  x_user_id: Nullable<string>;
  username: Nullable<string>;
  display_name: Nullable<string>;
  avatar_url: Nullable<string>;
  encrypted_access_token: Nullable<string>;
  encrypted_refresh_token: Nullable<string>;
  token_expires_at: Nullable<Timestamp>;
  scopes: string[];
  status: string;
  capabilities: Json;
  last_synced_at: Nullable<Timestamp>;
  last_error: Nullable<string>;
};

export type PostRow = MutableOwnerRow & ExtendedPostMetrics & ScoreColumns & {
  platform: string;
  platform_post_id: Nullable<string>;
  url: Nullable<string>;
  text: string;
  author_username: Nullable<string>;
  author_display_name: Nullable<string>;
  is_owner_post: boolean;
  created_at_platform: Nullable<Timestamp>;
  imported_at: Timestamp;
  source: string;
  topic: Nullable<string>;
  format: Nullable<string>;
  hook_type: Nullable<string>;
  tone: Nullable<string>;
  content_pillar: Nullable<string>;
  has_media: boolean;
  has_link: boolean;
  media_metadata: Json;
  raw_api_payload: Json;
};

export type PostMetricSnapshotRow = AppendOnlyOwnerRow & ExtendedPostMetrics & ScoreColumns & {
  post_id: Uuid;
  snapshot_at: Timestamp;
  source: string;
  score_metadata: Json;
  raw_api_payload: Json;
};

export type ContentIdeaRow = MutableOwnerRow & {
  title: Nullable<string>;
  raw_text: string;
  tags: string[];
  status: string;
  source: string;
  linked_post_id: Nullable<Uuid>;
  source_entity_type: Nullable<string>;
  source_entity_id: Nullable<Uuid>;
  favorite: boolean;
};

export type GeneratedOutputRow = MutableOwnerRow & {
  type: string;
  input_id: Nullable<Uuid>;
  input_type: Nullable<string>;
  text: string;
  variants: Json;
  model: Nullable<string>;
  provider: Nullable<string>;
  prompt_version: Nullable<string>;
  saved: boolean;
  favorite: boolean;
  copied_at: Nullable<Timestamp>;
  archived_at: Nullable<Timestamp>;
};

export type BrainDumpRow = MutableOwnerRow & {
  title: Nullable<string>;
  raw_text: string;
  extracted_themes: Json;
  extracted_claims: Json;
  extracted_stories: Json;
  extracted_examples: Json;
  extracted_contradictions: Json;
  strong_lines: Json;
  generated_pack: Json;
  model: Nullable<string>;
  provider: Nullable<string>;
  prompt_version: Nullable<string>;
};

export type SavedInspirationPostRow = MutableOwnerRow & {
  url: Nullable<string>;
  platform: string;
  platform_post_id: Nullable<string>;
  author_username: Nullable<string>;
  author_display_name: Nullable<string>;
  text: string;
  tags: string[];
  notes: Nullable<string>;
  captured_at: Timestamp;
  transformed_outputs: Json;
  plagiarism_risk_notes: Nullable<string>;
  similarity_risk: Nullable<string>;
};

export type TargetAccountRow = MutableOwnerRow & {
  username: string;
  display_name: Nullable<string>;
  notes: Nullable<string>;
  niche: Nullable<string>;
  priority: number;
  list_name: Nullable<string>;
  last_synced_at: Nullable<Timestamp>;
};

export type TargetAccountPostRow = MutableOwnerRow & PostMetrics & {
  target_account_id: Uuid;
  platform: string;
  platform_post_id: Nullable<string>;
  url: Nullable<string>;
  author_username: Nullable<string>;
  text: string;
  created_at_platform: Nullable<Timestamp>;
  source: string;
  raw_api_payload: Json;
};

export type ReplyDraftRow = MutableOwnerRow & {
  target_account_id: Nullable<Uuid>;
  target_post_id: Nullable<Uuid>;
  publishing_draft_id: Nullable<Uuid>;
  original_post_text: string;
  reply_text: string;
  reply_type: Nullable<string>;
  status: string;
  copied_at: Nullable<Timestamp>;
  used_at: Nullable<Timestamp>;
  published_post_id: Nullable<Uuid>;
  model: Nullable<string>;
  provider: Nullable<string>;
  prompt_version: Nullable<string>;
};

export type AccountResearchReportRow = MutableOwnerRow & {
  target_account_id: Nullable<Uuid>;
  username: Nullable<string>;
  input_source: string;
  input_post_ids: Uuid[];
  report: Json;
  top_posts: Json;
  generated_at: Timestamp;
  model: Nullable<string>;
  provider: Nullable<string>;
  prompt_version: Nullable<string>;
};

export type ContentCoachReportRow = MutableOwnerRow & {
  kind: string;
  question: Nullable<string>;
  answer: Nullable<string>;
  diagnosis: Json;
  evidence: Json;
  recommendations: Json;
  draft_posts: Json;
  confidence_labels: Json;
  model: Nullable<string>;
  provider: Nullable<string>;
  prompt_version: Nullable<string>;
  generated_at: Timestamp;
};

export type AlgoAnalysisReportRow = MutableOwnerRow & {
  draft_text: string;
  content_type: string;
  overall_score: Nullable<number>;
  metric_scores: Json;
  diagnosis: Json;
  rewrites: Json;
  thread_expansion: Json;
  publish_readiness: Json;
  risk_warnings: Json;
  model: Nullable<string>;
  provider: Nullable<string>;
  prompt_version: Nullable<string>;
  voice_profile_id: Nullable<Uuid>;
  confidence_label: string;
};

export type VoiceProfileRow = MutableOwnerRow & {
  summary: string;
  tone: Nullable<string>;
  sentence_patterns: Json;
  common_phrases: Json;
  hook_patterns: Json;
  topic_clusters: Json;
  cta_patterns: Json;
  formatting_habits: Json;
  examples: Json;
  generated_at: Timestamp;
  post_count_used: number;
  blog_count_used: number;
  source_post_ids: Uuid[];
  source_blog_ids: Uuid[];
  is_active: boolean;
};

export type EmbeddingRow = MutableOwnerRow & {
  entity_type: string;
  entity_id: Uuid;
  content: string;
  content_hash: string;
  embedding: Vector;
  embedding_model: string;
};

export type AiJobRow = Omit<AppendOnlyOwnerRow, "created_at"> & {
  job_type: string;
  status: string;
  input_entity_type: Nullable<string>;
  input_entity_id: Nullable<Uuid>;
  started_at: Nullable<Timestamp>;
  completed_at: Nullable<Timestamp>;
  error: Nullable<string>;
  provider: Nullable<string>;
  model: Nullable<string>;
  prompt_version: Nullable<string>;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type PromptRunRow = AppendOnlyOwnerRow & {
  ai_job_id: Nullable<Uuid>;
  prompt_name: string;
  prompt_version: string;
  provider: string;
  model: string;
  input_hash: string;
  input_redacted: Json;
  output_redacted: Json;
  status: string;
  latency_ms: Nullable<number>;
  input_tokens: Nullable<number>;
  output_tokens: Nullable<number>;
  total_tokens: Nullable<number>;
  estimated_cost_usd: Nullable<number>;
  error: Nullable<string>;
};

export type SyncJobRow = Omit<AppendOnlyOwnerRow, "created_at"> & {
  job_type: string;
  status: string;
  started_at: Nullable<Timestamp>;
  completed_at: Nullable<Timestamp>;
  records_seen: number;
  records_created: number;
  records_updated: number;
  records_failed: number;
  rate_limit_reset_at: Nullable<Timestamp>;
  error: Nullable<string>;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type AuditLogRow = {
  id: Uuid;
  user_id: Nullable<Uuid>;
  event_type: string;
  actor_email: Nullable<string>;
  ip_hash: Nullable<string>;
  user_agent: Nullable<string>;
  target_type: Nullable<string>;
  target_id: Nullable<Uuid>;
  success: boolean;
  error: Nullable<string>;
  metadata: Json;
  created_at: Timestamp;
};

export type PersonalSaveTokenRow = MutableOwnerRow & {
  name: string;
  token_hash: string;
  token_prefix: string;
  scopes: string[];
  status: string;
  last_used_at: Nullable<Timestamp>;
  revoked_at: Nullable<Timestamp>;
  expires_at: Nullable<Timestamp>;
  rate_limit_per_hour: number;
};

export type ContentPillarRow = MutableOwnerRow & {
  name: string;
  description: Nullable<string>;
  priority: number;
  examples: Json;
  active: boolean;
};

export type GrowthGoalRow = MutableOwnerRow & {
  title: string;
  description: Nullable<string>;
  metric_key: string;
  target_value: Nullable<number>;
  start_date: Nullable<string>;
  end_date: Nullable<string>;
  status: string;
};

export type CampaignRow = MutableOwnerRow & {
  name: string;
  objective: Nullable<string>;
  status: string;
  pillar_id: Nullable<Uuid>;
  start_date: Nullable<string>;
  end_date: Nullable<string>;
  hypothesis: Nullable<string>;
  target_metrics: Json;
  result_summary: Json;
};

export type ExperimentRow = MutableOwnerRow & {
  experiment_type: string;
  title: string;
  hypothesis: Nullable<string>;
  start_date: Nullable<string>;
  end_date: Nullable<string>;
  status: string;
  success_metric: Nullable<string>;
  content_filters: Json;
  decision: Nullable<string>;
};

export type MediaAssetRow = MutableOwnerRow & {
  storage_provider: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  width: Nullable<number>;
  height: Nullable<number>;
  duration_ms: Nullable<number>;
  alt_text: Nullable<string>;
  x_media_id: Nullable<string>;
  x_upload_status: string;
  checksum: Nullable<string>;
};

export type ContentCalendarItemRow = MutableOwnerRow & {
  item_type: string;
  entity_type: string;
  entity_id: Nullable<Uuid>;
  title: string;
  starts_at: Timestamp;
  ends_at: Nullable<Timestamp>;
  timezone: string;
  status: string;
};

export type PublishingDraftRow = MutableOwnerRow & {
  content_type: string;
  source_type: Nullable<string>;
  source_id: Nullable<Uuid>;
  source_post_id: Nullable<Uuid>;
  source_content_idea_id: Nullable<Uuid>;
  source_generated_output_id: Nullable<Uuid>;
  text: string;
  thread_items: Json;
  quote_post_id: Nullable<string>;
  reply_to_post_id: Nullable<string>;
  media_asset_ids: Uuid[];
  status: string;
  approval_status: string;
  approval_payload_hash: Nullable<string>;
  approved_at: Nullable<Timestamp>;
  approved_by: Nullable<Uuid>;
  approval_audit_log_id: Nullable<Uuid>;
  scheduled_at: Nullable<Timestamp>;
  timezone: string;
  campaign_id: Nullable<Uuid>;
  experiment_id: Nullable<Uuid>;
  duplicate_check: Json;
  similarity_check: Json;
  risk_check: Json;
};

export type PublishingJobRow = MutableJobRow & {
  publishing_draft_id: Uuid;
  job_type: string;
  status: string;
  idempotency_key: string;
  attempt_count: number;
  scheduled_for: Nullable<Timestamp>;
  started_at: Nullable<Timestamp>;
  completed_at: Nullable<Timestamp>;
  x_request_payload: Json;
  x_response_payload: Json;
  rate_limit_reset_at: Nullable<Timestamp>;
  error_code: Nullable<string>;
  error: Nullable<string>;
  audit_log_id: Nullable<Uuid>;
};

export type ScheduledPostRow = MutableOwnerRow & {
  publishing_draft_id: Uuid;
  scheduled_for: Timestamp;
  timezone: string;
  status: string;
  calendar_item_id: Nullable<Uuid>;
  lock_token: Nullable<string>;
  locked_at: Nullable<Timestamp>;
  scheduled_audit_log_id: Nullable<Uuid>;
  canceled_audit_log_id: Nullable<Uuid>;
};

export type PublishedPostRow = MutableOwnerRow & {
  publishing_draft_id: Nullable<Uuid>;
  publishing_job_id: Nullable<Uuid>;
  post_id: Nullable<Uuid>;
  platform: string;
  platform_post_id: Nullable<string>;
  url: Nullable<string>;
  content_type: string;
  published_at: Timestamp;
  published_via: string;
  thread_root_post_id: Nullable<string>;
  thread_post_ids: string[];
  quote_target_post_id: Nullable<string>;
  reply_target_post_id: Nullable<string>;
  raw_api_payload: Json;
  audit_log_id: Nullable<Uuid>;
};

export type PublishingFailureRow = AppendOnlyOwnerRow & {
  publishing_job_id: Uuid;
  publishing_draft_id: Uuid;
  failure_type: string;
  provider_error_code: Nullable<string>;
  sanitized_message: Nullable<string>;
  retryable: boolean;
  retry_after: Nullable<Timestamp>;
  raw_error_redacted: Json;
  audit_log_id: Nullable<Uuid>;
};

export type BlogPostRow = MutableOwnerRow & {
  title: string;
  slug: Nullable<string>;
  status: string;
  source_type: Nullable<string>;
  source_id: Nullable<Uuid>;
  source_post_id: Nullable<Uuid>;
  source_content_idea_id: Nullable<Uuid>;
  source_generated_output_id: Nullable<Uuid>;
  excerpt: Nullable<string>;
  markdown: string;
  html: Nullable<string>;
  json_doc: Json;
  seo_title: Nullable<string>;
  meta_description: Nullable<string>;
  canonical_summary: Nullable<string>;
  tags: string[];
  categories: string[];
  word_count: number;
  reading_time_minutes: number;
  campaign_id: Nullable<Uuid>;
  experiment_id: Nullable<Uuid>;
  published_external_url: Nullable<string>;
};

export type BlogVersionRow = AppendOnlyOwnerRow & AiAttributionColumns & {
  blog_post_id: Uuid;
  version_number: number;
  title: string;
  markdown: string;
  html: Nullable<string>;
  json_doc: Json;
  change_reason: Nullable<string>;
  created_by: string;
};

export type BlogExportRow = AppendOnlyOwnerRow & {
  blog_post_id: Uuid;
  format: string;
  export_payload: Nullable<string>;
  storage_path: Nullable<string>;
  exported_at: Timestamp;
  checksum: Nullable<string>;
};

export type BlogRepurposingJobRow = MutableOwnerRow & AiAttributionColumns & {
  blog_post_id: Nullable<Uuid>;
  source_post_id: Nullable<Uuid>;
  direction: string;
  status: string;
  output_publishing_draft_ids: Uuid[];
  output_generated_output_ids: Uuid[];
};

export type CampaignItemRow = MutableOwnerRow & {
  campaign_id: Uuid;
  entity_type: string;
  entity_id: Nullable<Uuid>;
  publishing_draft_id: Nullable<Uuid>;
  blog_post_id: Nullable<Uuid>;
  published_post_id: Nullable<Uuid>;
  role: Nullable<string>;
  sequence_index: number;
  scheduled_for: Nullable<Timestamp>;
  status: string;
};

export type ExperimentResultRow = AppendOnlyOwnerRow & AiAttributionColumns & ConfidenceColumn & {
  experiment_id: Uuid;
  metrics: Json;
  baseline_metrics: Json;
  result: Nullable<string>;
  ai_interpretation: Json;
  decision: Nullable<string>;
  generated_at: Timestamp;
};

export type WeeklyReviewRow = AppendOnlyOwnerRow & AiAttributionColumns & ConfidenceColumn & {
  week_start: string;
  week_end: string;
  report: Json;
  evidence: Json;
  recommendations: Json;
  generated_at: Timestamp;
};

export type MonthlyReviewRow = AppendOnlyOwnerRow & AiAttributionColumns & ConfidenceColumn & {
  month_start: string;
  month_end: string;
  report: Json;
  evidence: Json;
  strategy_changes: Json;
  generated_at: Timestamp;
};

export type ProfileAuditRow = AppendOnlyOwnerRow & AiAttributionColumns & ConfidenceColumn & {
  input_snapshot: Json;
  score: Nullable<number>;
  findings: Json;
  recommendations: Json;
  suggested_pinned_post_drafts: Json;
  generated_at: Timestamp;
};

export type XOAuthStateRow = {
  state: string;
  user_id: Uuid;
  code_verifier: string;
  scopes: string[];
  mode: "publishing" | "read";
  return_to: Nullable<string>;
  created_at: Timestamp;
  expires_at: Timestamp;
  consumed_at: Nullable<Timestamp>;
};

export type RateLimitBucketRow = {
  id: string;
  bucket_id: string;
  window_start_ms: number;
  count: number;
  reset_at: Timestamp;
  created_at: Timestamp;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow>;
      app_settings: Table<AppSettingsRow>;
      x_connections: Table<XConnectionRow>;
      posts: Table<PostRow>;
      post_metric_snapshots: Table<PostMetricSnapshotRow>;
      content_ideas: Table<ContentIdeaRow>;
      generated_outputs: Table<GeneratedOutputRow>;
      brain_dumps: Table<BrainDumpRow>;
      saved_inspiration_posts: Table<SavedInspirationPostRow>;
      target_accounts: Table<TargetAccountRow>;
      target_account_posts: Table<TargetAccountPostRow>;
      reply_drafts: Table<ReplyDraftRow>;
      account_research_reports: Table<AccountResearchReportRow>;
      content_coach_reports: Table<ContentCoachReportRow>;
      algo_analysis_reports: Table<AlgoAnalysisReportRow>;
      voice_profiles: Table<VoiceProfileRow>;
      embeddings: Table<EmbeddingRow>;
      ai_jobs: Table<AiJobRow>;
      prompt_runs: Table<PromptRunRow>;
      sync_jobs: Table<SyncJobRow>;
      audit_logs: Table<AuditLogRow>;
      personal_save_tokens: Table<PersonalSaveTokenRow>;
      publishing_drafts: Table<PublishingDraftRow>;
      publishing_jobs: Table<PublishingJobRow>;
      scheduled_posts: Table<ScheduledPostRow>;
      published_posts: Table<PublishedPostRow>;
      publishing_failures: Table<PublishingFailureRow>;
      media_assets: Table<MediaAssetRow>;
      content_calendar_items: Table<ContentCalendarItemRow>;
      blog_posts: Table<BlogPostRow>;
      blog_versions: Table<BlogVersionRow>;
      blog_exports: Table<BlogExportRow>;
      blog_repurposing_jobs: Table<BlogRepurposingJobRow>;
      growth_goals: Table<GrowthGoalRow>;
      content_pillars: Table<ContentPillarRow>;
      campaigns: Table<CampaignRow>;
      campaign_items: Table<CampaignItemRow>;
      experiments: Table<ExperimentRow>;
      experiment_results: Table<ExperimentResultRow>;
      weekly_reviews: Table<WeeklyReviewRow>;
      monthly_reviews: Table<MonthlyReviewRow>;
      profile_audits: Table<ProfileAuditRow>;
      x_oauth_states: Table<XOAuthStateRow>;
      rate_limit_buckets: Table<RateLimitBucketRow>;
    };
    Views: Record<string, never>;
    Functions: {
      creatoros_delete_owner_data: {
        Args: {
          p_delete_profile?: boolean;
          p_user_id: Uuid;
        };
        Returns: Json;
      };
      creatoros_update_blog_with_version: {
        Args: {
          p_blog_id: Uuid;
          p_change_reason: Nullable<string>;
          p_create_version: boolean;
          p_created_by: string;
          p_metadata: Json;
          p_model: Nullable<string>;
          p_payload: Json;
          p_prompt_version: Nullable<string>;
          p_provider: Nullable<string>;
          p_user_id: Uuid;
        };
        Returns: BlogPostRow;
      };
      creatoros_rate_limit_increment: {
        Args: {
          p_id: string;
          p_bucket_id: string;
          p_window_start_ms: number;
          p_window_ms: number;
        };
        Returns: { count: number; reset_at: Timestamp }[];
      };
      creatoros_rate_limit_cleanup: {
        Args: { p_now?: Timestamp };
        Returns: number;
      };
      creatoros_x_oauth_states_cleanup: {
        Args: { p_now?: Timestamp };
        Returns: number;
      };
      creatoros_replace_active_voice_profile: {
        Args: {
          p_blog_count_used: number;
          p_common_phrases: Json;
          p_cta_patterns: Json;
          p_examples: Json;
          p_formatting_habits: Json;
          p_hook_patterns: Json;
          p_metadata: Json;
          p_post_count_used: number;
          p_sentence_patterns: Json;
          p_source_blog_ids: string[];
          p_source_post_ids: string[];
          p_summary: string;
          p_tone: Nullable<string>;
          p_topic_clusters: Json;
          p_user_id: Uuid;
        };
        Returns: VoiceProfileRow;
      };
      // SCA-496 (W-17): server-side top-k cosine similarity over
      // public.embeddings via the halfvec HNSW index. The query embedding
      // is converted to halfvec text format on the caller; the RPC never
      // ships the row embedding back to the client.
      creatoros_retrieve_embeddings_by_similarity: {
        Args: {
          p_entity_types: Nullable<string[]>;
          p_limit: number;
          p_query_embedding: string;
          p_user_id: Uuid;
        };
        Returns: Array<{
          content: string;
          created_at: string;
          embedding_model: string;
          entity_id: string;
          entity_type: string;
          id: Uuid;
          metadata: Json;
          score: number;
          updated_at: Nullable<string>;
          user_id: Uuid;
        }>;
      };
      creatoros_load_embedding_status: {
        Args: { p_user_id: Uuid };
        Returns: Array<{ indexed_count: number; last_refresh_at: Nullable<string> }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
