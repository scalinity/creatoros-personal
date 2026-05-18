-- SCA-541 (S-35): convert public.embeddings.embedding from vector(3072)
-- to halfvec(3072) so storage and transfer are halved.
-- text-embedding-3-large tolerates half precision per OpenAI's
-- recommendation, and the HNSW index added in phase 26 (M-16) already
-- operates on the halfvec cast.
--
-- ⚠ OPERATOR REVIEW REQUIRED ⚠
-- ============================================================================
-- This migration ALTERs the column type. Postgres will rewrite every row to
-- the new representation. On a small single-owner database that's seconds;
-- on a large embedding corpus this is a table-rewrite and table lock for the
-- duration. Before running in production:
--
--   1. Confirm embedding row count via:
--        select count(*) from public.embeddings;
--      If > ~50k rows, schedule a maintenance window.
--
--   2. Take a logical snapshot of the embeddings table (or rely on the
--      Supabase point-in-time recovery window) so a rollback is possible.
--
--   3. After the migration runs, recompute the HNSW index. The phase 26
--      migration created `embeddings_embedding_halfvec_hnsw_idx` against
--      `embedding::halfvec(3072)` — once the storage type IS halfvec, the
--      cast is a no-op and the index plan should pick it directly. Verify
--      with `explain analyze` on a representative retrieval query.
--
--   4. Update `lib/embeddings/index.ts` so insert/refresh writes a
--      halfvec literal directly instead of relying on Postgres to cast
--      from float[]. The current refresh path sends a vector literal,
--      which Postgres still accepts via implicit cast — no app-level
--      change is strictly required, but a future commit should drop the
--      cast for clarity.
-- ============================================================================
--
-- This file is intentionally idempotent. If embedding is already halfvec,
-- the alter is a no-op.

do $$
declare
  current_type text;
begin
  select format_type(atttypid, atttypmod)
    into current_type
    from pg_attribute
   where attrelid = 'public.embeddings'::regclass
     and attname = 'embedding'
     and not attisdropped;

  if current_type is null then
    raise notice 'SCA-541: public.embeddings.embedding column not found; skipping.';
    return;
  end if;

  if current_type ilike 'halfvec%' then
    raise notice 'SCA-541: public.embeddings.embedding already halfvec(%); skipping.', current_type;
    return;
  end if;

  raise notice 'SCA-541: rewriting public.embeddings.embedding from % to halfvec(3072).', current_type;
  execute 'alter table public.embeddings alter column embedding type extensions.halfvec(3072) using embedding::extensions.halfvec(3072)';
end$$;
