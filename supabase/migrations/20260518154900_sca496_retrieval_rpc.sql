-- SCA-496 (W-17): two RPCs that move retrieval similarity work from
-- Node into Postgres so the HNSW index added in phase 26 (M-16) is
-- actually consulted at query time.
--
-- Prior implementation pulled every owner embedding row (up to 500)
-- via `select *` and ran cosine similarity in JS — ~12 MB row payload
-- plus ~1.5M FP ops per coach question. The new path ships only the
-- top-k metadata + score back to Node; the vector itself never crosses
-- the wire.

set check_function_bodies = off;

-- `creatoros_retrieve_embeddings_by_similarity`: ranks owner embeddings
-- against `query_embedding` (already converted to halfvec on the caller
-- side) and returns the top `result_limit` rows. `entity_types` is the
-- optional allow-list — when NULL or empty, all types are eligible.
create or replace function public.creatoros_retrieve_embeddings_by_similarity(
  p_user_id uuid,
  p_query_embedding halfvec(3072),
  p_entity_types text[] default null,
  p_limit integer default 12
)
returns table (
  content text,
  created_at timestamptz,
  embedding_model text,
  entity_id text,
  entity_type text,
  id uuid,
  metadata jsonb,
  score real,
  updated_at timestamptz,
  user_id uuid
)
language sql
stable
security invoker
as $$
  select
    e.content,
    e.created_at,
    e.embedding_model,
    e.entity_id,
    e.entity_type,
    e.id,
    e.metadata,
    -- cosine similarity = 1 - cosine_distance. pgvector's <=> is cosine
    -- distance for halfvec_cosine_ops, so 1 - (a <=> b) is similarity.
    (1 - (e.embedding::halfvec(3072) <=> p_query_embedding))::real as score,
    e.updated_at,
    e.user_id
  from public.embeddings e
  where e.user_id = p_user_id
    and e.deleted_at is null
    and (p_entity_types is null or array_length(p_entity_types, 1) is null or e.entity_type = any(p_entity_types))
  order by e.embedding::halfvec(3072) <=> p_query_embedding
  limit greatest(coalesce(p_limit, 12), 1);
$$;

revoke all on function public.creatoros_retrieve_embeddings_by_similarity(uuid, halfvec(3072), text[], integer) from public;
grant execute on function public.creatoros_retrieve_embeddings_by_similarity(uuid, halfvec(3072), text[], integer) to authenticated;
grant execute on function public.creatoros_retrieve_embeddings_by_similarity(uuid, halfvec(3072), text[], integer) to service_role;

comment on function public.creatoros_retrieve_embeddings_by_similarity(uuid, halfvec(3072), text[], integer) is
'SCA-496 (W-17): server-side top-k cosine similarity over public.embeddings using the halfvec HNSW index. Caller passes a halfvec(3072) query embedding; the function never ships the row embedding back to the client.';

-- `creatoros_load_embedding_status`: returns just the indexed count and
-- last-refresh timestamp without pulling vector payloads. Replaces the
-- `select *` + .limit(1000) probe used by loadEmbeddingStatus.
create or replace function public.creatoros_load_embedding_status(
  p_user_id uuid
)
returns table (
  indexed_count bigint,
  last_refresh_at timestamptz
)
language sql
stable
security invoker
as $$
  select
    count(*) as indexed_count,
    max(coalesce(e.updated_at, e.created_at)) as last_refresh_at
  from public.embeddings e
  where e.user_id = p_user_id
    and e.deleted_at is null;
$$;

revoke all on function public.creatoros_load_embedding_status(uuid) from public;
grant execute on function public.creatoros_load_embedding_status(uuid) to authenticated;
grant execute on function public.creatoros_load_embedding_status(uuid) to service_role;

comment on function public.creatoros_load_embedding_status(uuid) is
'SCA-496 (W-17): returns just the indexed count + last refresh timestamp for the embeddings panel, without pulling vector payloads.';
