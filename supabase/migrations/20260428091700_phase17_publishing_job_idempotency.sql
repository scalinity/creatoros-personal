create unique index if not exists publishing_jobs_user_id_idempotency_key_key
  on public.publishing_jobs (user_id, idempotency_key);

comment on index public.publishing_jobs_user_id_idempotency_key_key is
  'Prevents duplicate publishing jobs for the same owner/idempotency key before an external X write can repeat.';
