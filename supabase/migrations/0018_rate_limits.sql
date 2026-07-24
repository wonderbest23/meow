-- Durable, strongly-consistent rate-limit counters (optional backend for lib/rate-limit.ts).
-- Enabled at runtime by RATE_LIMIT_BACKEND=supabase; otherwise the app uses the in-memory limiter.
-- Counts are bucketed into fixed windows so a single atomic upsert both creates and increments.

create table if not exists public.rate_limits (
  bucket text not null,
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  expires_at timestamptz not null,
  primary key (bucket, key, window_start)
);

create index if not exists rate_limits_expires_idx on public.rate_limits(expires_at);

-- Service-role only: RLS on with no policies denies every other role by default.
alter table public.rate_limits enable row level security;

-- Atomically bump the counter for (bucket, key) in the current window and return the new count.
-- The window start is derived server-side from p_now so all callers agree on window boundaries.
create or replace function public.bump_rate_limit(
  p_bucket text,
  p_key text,
  p_window_ms bigint,
  p_now timestamptz default now()
) returns integer
language plpgsql
as $$
declare
  v_epoch_ms bigint;
  v_window_start timestamptz;
  v_count integer;
begin
  v_epoch_ms := floor(extract(epoch from p_now) * 1000)::bigint;
  v_window_start := to_timestamp((v_epoch_ms - (v_epoch_ms % p_window_ms)) / 1000.0);

  insert into public.rate_limits (bucket, key, window_start, count, expires_at)
    values (
      p_bucket,
      p_key,
      v_window_start,
      1,
      v_window_start + make_interval(secs => p_window_ms / 1000.0)
    )
  on conflict (bucket, key, window_start)
    do update set count = public.rate_limits.count + 1
  returning count into v_count;

  return v_count;
end;
$$;

-- Purge helper for a scheduled job (pg_cron / external cron): delete public.rate_limits rows
-- whose window has fully elapsed. Not called on the hot path.
create or replace function public.purge_expired_rate_limits(p_now timestamptz default now())
returns integer
language plpgsql
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limits where expires_at < p_now;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
