-- SCA-472 (C-2): atomic replace of the owner's active voice profile.
-- Replaces the non-atomic deactivate + insert pair in lib/voice/index.ts so
-- there is never a moment with zero active profiles for the owner (the
-- partial unique index voice_profiles_active_uidx already rejects two).

create or replace function public.creatoros_replace_active_voice_profile(
  p_user_id uuid,
  p_summary text,
  p_tone text,
  p_sentence_patterns jsonb,
  p_common_phrases jsonb,
  p_hook_patterns jsonb,
  p_topic_clusters jsonb,
  p_cta_patterns jsonb,
  p_formatting_habits jsonb,
  p_examples jsonb,
  p_post_count_used integer,
  p_blog_count_used integer,
  p_source_post_ids uuid[],
  p_source_blog_ids uuid[],
  p_metadata jsonb
)
returns public.voice_profiles
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_inserted public.voice_profiles%rowtype;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'admin_user_mismatch' using errcode = '42501';
  end if;

  -- Single transaction: flip prior active rows to inactive, then insert the
  -- replacement with is_active=true. The partial unique index
  -- voice_profiles_active_uidx (user_id) WHERE is_active AND deleted_at IS NULL
  -- enforces "exactly one active" at the DB level — if any concurrent writer
  -- raced this transaction, the INSERT below would fail and the entire
  -- statement rolls back, leaving the prior active row untouched.
  update public.voice_profiles
     set is_active = false
   where user_id = p_user_id
     and is_active = true
     and deleted_at is null;

  insert into public.voice_profiles (
    blog_count_used,
    common_phrases,
    cta_patterns,
    examples,
    formatting_habits,
    hook_patterns,
    is_active,
    metadata,
    post_count_used,
    sentence_patterns,
    source_blog_ids,
    source_post_ids,
    summary,
    tone,
    topic_clusters,
    user_id
  ) values (
    p_blog_count_used,
    coalesce(p_common_phrases, '[]'::jsonb),
    coalesce(p_cta_patterns, '[]'::jsonb),
    coalesce(p_examples, '[]'::jsonb),
    coalesce(p_formatting_habits, '{}'::jsonb),
    coalesce(p_hook_patterns, '[]'::jsonb),
    true,
    coalesce(p_metadata, '{}'::jsonb),
    p_post_count_used,
    coalesce(p_sentence_patterns, '[]'::jsonb),
    coalesce(p_source_blog_ids, '{}'::uuid[]),
    coalesce(p_source_post_ids, '{}'::uuid[]),
    p_summary,
    p_tone,
    coalesce(p_topic_clusters, '[]'::jsonb),
    p_user_id
  )
  returning * into v_inserted;

  return v_inserted;
end;
$$;

comment on function public.creatoros_replace_active_voice_profile is
  'SCA-472: atomically replaces the owner''s active voice profile. Deactivates prior is_active rows and inserts the new one inside a single transaction; the partial unique index on voice_profiles(user_id) WHERE is_active AND deleted_at IS NULL is the consistency anchor.';
