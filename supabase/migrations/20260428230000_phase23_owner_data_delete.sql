-- CreatorOS Personal Phase 23: transactional owner data deletion.
-- This function is service-role only. It clears token material before deleting rows.

create or replace function public.creatoros_delete_owner_data(
  p_user_id uuid,
  p_delete_profile boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_counts jsonb := '{}'::jsonb;
  v_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  update public.personal_save_tokens
     set token_hash = 'deleted:' || id::text || ':' || encode(extensions.gen_random_bytes(16), 'hex'),
         token_prefix = 'deleted',
         status = 'revoked',
         revoked_at = coalesce(revoked_at, now()),
         metadata = metadata || jsonb_build_object(
           'phase', '23-hardening-export-delete-observability',
           'token_material_deleted', true,
           'token_material_deleted_at', now()
         ),
         updated_at = now()
   where user_id = p_user_id;

  update public.x_connections
     set encrypted_access_token = null,
         encrypted_refresh_token = null,
         token_expires_at = null,
         status = 'revoked',
         last_error = null,
         metadata = metadata || jsonb_build_object(
           'phase', '23-hardening-export-delete-observability',
           'token_material_deleted', true,
           'token_material_deleted_at', now()
         ),
         updated_at = now()
   where user_id = p_user_id;

  delete from public.personal_save_tokens where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('personal_save_tokens', v_count);

  delete from public.x_connections where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('x_connections', v_count);

  delete from public.publishing_failures where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('publishing_failures', v_count);

  delete from public.campaign_items where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('campaign_items', v_count);

  delete from public.published_posts where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('published_posts', v_count);

  delete from public.publishing_jobs where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('publishing_jobs', v_count);

  delete from public.scheduled_posts where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('scheduled_posts', v_count);

  delete from public.content_calendar_items where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('content_calendar_items', v_count);

  delete from public.media_assets where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('media_assets', v_count);

  delete from public.publishing_drafts where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('publishing_drafts', v_count);

  delete from public.blog_exports where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('blog_exports', v_count);

  delete from public.blog_versions where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('blog_versions', v_count);

  delete from public.blog_repurposing_jobs where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('blog_repurposing_jobs', v_count);

  delete from public.blog_posts where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('blog_posts', v_count);

  delete from public.experiment_results where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('experiment_results', v_count);

  delete from public.weekly_reviews where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('weekly_reviews', v_count);

  delete from public.monthly_reviews where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('monthly_reviews', v_count);

  delete from public.profile_audits where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('profile_audits', v_count);

  delete from public.campaigns where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('campaigns', v_count);

  delete from public.experiments where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('experiments', v_count);

  delete from public.growth_goals where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('growth_goals', v_count);

  delete from public.content_pillars where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('content_pillars', v_count);

  delete from public.post_metric_snapshots where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('post_metric_snapshots', v_count);

  delete from public.reply_drafts where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('reply_drafts', v_count);

  delete from public.target_account_posts where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('target_account_posts', v_count);

  delete from public.account_research_reports where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('account_research_reports', v_count);

  delete from public.target_accounts where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('target_accounts', v_count);

  delete from public.content_coach_reports where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('content_coach_reports', v_count);

  delete from public.algo_analysis_reports where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('algo_analysis_reports', v_count);

  delete from public.voice_profiles where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('voice_profiles', v_count);

  delete from public.embeddings where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('embeddings', v_count);

  delete from public.prompt_runs where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('prompt_runs', v_count);

  delete from public.ai_jobs where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('ai_jobs', v_count);

  delete from public.sync_jobs where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('sync_jobs', v_count);

  delete from public.generated_outputs where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('generated_outputs', v_count);

  delete from public.brain_dumps where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('brain_dumps', v_count);

  delete from public.saved_inspiration_posts where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('saved_inspiration_posts', v_count);

  delete from public.content_ideas where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('content_ideas', v_count);

  delete from public.posts where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('posts', v_count);

  delete from public.app_settings where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('app_settings', v_count);

  delete from public.audit_logs where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('audit_logs', v_count);

  if p_delete_profile then
    delete from public.profiles where id = p_user_id;
    get diagnostics v_count = row_count;
    v_counts := v_counts || jsonb_build_object('profiles', v_count);
  end if;

  return v_counts;
end;
$$;

comment on function public.creatoros_delete_owner_data(uuid, boolean) is 'Phase 23 service-role-only transactional owner data delete. Clears token material before row deletion.';
revoke all on function public.creatoros_delete_owner_data(uuid, boolean) from public, anon, authenticated;
grant execute on function public.creatoros_delete_owner_data(uuid, boolean) to service_role;
