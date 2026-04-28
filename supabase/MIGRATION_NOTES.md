# Supabase Migration Notes

## Local Supabase State

- `supabase/config.toml` currently declares `project_id = "CreatorOS"`.
- A stale stopped local Supabase stack labeled `stir` previously held unrelated migration-history rows from another local project and caused `supabase migration list --local` to show remote-history entries not present in this repo.
- On 2026-04-28, the stopped `stir` containers were already gone and the remaining `stir` Docker volumes were removed with `docker volume rm` scoped by `com.supabase.cli.project=stir`.
- No `stir` Supabase containers or volumes remain. No `CreatorOS` Supabase local volumes exist yet, so the next CreatorOS `supabase start` / `supabase db reset` will create a fresh local database for this repo.
- Do not use `supabase stop --all` while another app is using Supabase local. Use `--project-id` or `--workdir` to target the intended project.

## Phase 06 Publishing, Blog, Growth Schema and RLS

- Migration file: `supabase/migrations/20260428004011_publishing_blog_growth_schema_rls.sql`.
- Created with Supabase CLI `2.95.4` via `supabase migration new publishing_blog_growth_schema_rls`.
- Before the stale `stir` volumes were removed, `supabase migration list --local` showed unrelated migration-history rows. The local CreatorOS database has not been restarted since cleanup, to keep Supabase ports free for other apps.
- Phase 05 and Phase 06 migrations were validated together inside a disposable database in the running Supabase Postgres container with minimal `auth.users` and `auth.uid()` stubs before the stale volumes were removed.
- Disposable validation confirmed both migrations apply cleanly and all 20 Phase 06 public tables have RLS enabled.

## Phase 05 Core Schema and RLS

- Migration file: `supabase/migrations/20260428002018_core_schema_rls.sql`.
- Created with Supabase CLI `2.95.4` via `supabase migration new core_schema_rls`.
- Before the stale `stir` volumes were removed, `supabase migration up --local` was blocked by pre-existing local migration-history rows that were not present in this repo's `supabase/migrations` directory.
- The migration was validated inside a disposable database in the running Supabase Postgres container with minimal `auth.users` and `auth.uid()` stubs before the stale volumes were removed.
- Disposable validation confirmed the migration applies, enables RLS on 22 public core tables, and grants no authenticated SELECT privilege on `x_connections.encrypted_access_token`, `x_connections.encrypted_refresh_token`, or `personal_save_tokens.token_hash`.

If CreatorOS local Supabase is needed again, start/reset it from this repo after confirming the default local ports are free or after assigning this repo unique ports in `supabase/config.toml`.
