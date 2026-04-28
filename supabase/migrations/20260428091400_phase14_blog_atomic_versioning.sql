-- Phase 14 blog safety: serialize blog update + version creation.

alter table public.blog_versions
  add constraint blog_versions_blog_post_id_version_number_key unique (blog_post_id, version_number);

create or replace function public.creatoros_update_blog_with_version(
  p_blog_id uuid,
  p_user_id uuid,
  p_payload jsonb,
  p_create_version boolean,
  p_change_reason text,
  p_created_by text,
  p_provider text,
  p_model text,
  p_prompt_version text,
  p_metadata jsonb
)
returns public.blog_posts
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_existing public.blog_posts%rowtype;
  v_updated public.blog_posts%rowtype;
  v_next_version integer;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'admin_user_mismatch' using errcode = '42501';
  end if;

  select *
    into v_existing
    from public.blog_posts
    where id = p_blog_id
      and user_id = p_user_id
      and deleted_at is null
    for update;

  if not found then
    raise exception 'blog_not_found' using errcode = 'P0002';
  end if;

  update public.blog_posts
     set title = case when p_payload ? 'title' then p_payload ->> 'title' else title end,
         slug = case when p_payload ? 'slug' then p_payload ->> 'slug' else slug end,
         status = case when p_payload ? 'status' then p_payload ->> 'status' else status end,
         excerpt = case when p_payload ? 'excerpt' then p_payload ->> 'excerpt' else excerpt end,
         markdown = case when p_payload ? 'markdown' then p_payload ->> 'markdown' else markdown end,
         html = case when p_payload ? 'html' then p_payload ->> 'html' else html end,
         json_doc = case when p_payload ? 'json_doc' then coalesce(p_payload -> 'json_doc', '{}'::jsonb) else json_doc end,
         seo_title = case when p_payload ? 'seo_title' then p_payload ->> 'seo_title' else seo_title end,
         meta_description = case when p_payload ? 'meta_description' then p_payload ->> 'meta_description' else meta_description end,
         canonical_summary = case when p_payload ? 'canonical_summary' then p_payload ->> 'canonical_summary' else canonical_summary end,
         tags = case
           when p_payload ? 'tags' then coalesce((select array_agg(item.value) from jsonb_array_elements_text(p_payload -> 'tags') as item(value)), '{}'::text[])
           else tags
         end,
         categories = case
           when p_payload ? 'categories' then coalesce((select array_agg(item.value) from jsonb_array_elements_text(p_payload -> 'categories') as item(value)), '{}'::text[])
           else categories
         end,
         word_count = case when p_payload ? 'word_count' then (p_payload ->> 'word_count')::integer else word_count end,
         reading_time_minutes = case when p_payload ? 'reading_time_minutes' then (p_payload ->> 'reading_time_minutes')::integer else reading_time_minutes end,
         metadata = case when p_payload ? 'metadata' then coalesce(p_payload -> 'metadata', '{}'::jsonb) else metadata end,
         updated_at = now()
   where id = p_blog_id
     and user_id = p_user_id
     and deleted_at is null
   returning * into v_updated;

  if p_create_version then
    select coalesce(max(version_number), 0) + 1
      into v_next_version
      from public.blog_versions
      where blog_post_id = p_blog_id
        and user_id = p_user_id;

    insert into public.blog_versions (
      blog_post_id,
      change_reason,
      created_by,
      html,
      json_doc,
      markdown,
      metadata,
      model,
      prompt_version,
      provider,
      title,
      user_id,
      version_number
    ) values (
      v_updated.id,
      p_change_reason,
      coalesce(p_created_by, 'owner'),
      v_updated.html,
      v_updated.json_doc,
      v_updated.markdown,
      coalesce(p_metadata, '{}'::jsonb),
      p_model,
      p_prompt_version,
      p_provider,
      v_updated.title,
      p_user_id,
      v_next_version
    );
  end if;

  return v_updated;
end;
$$;