drop policy if exists post_metric_snapshots_owner_insert on public.post_metric_snapshots;

create policy post_metric_snapshots_owner_insert
  on public.post_metric_snapshots
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.posts
      where posts.id = post_metric_snapshots.post_id
        and posts.user_id = (select auth.uid())
    )
  );
