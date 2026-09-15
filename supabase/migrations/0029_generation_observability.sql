-- Nullable metadata keeps existing usage records and older application writers valid.
alter table public.llm_usage add column if not exists model text;
alter table public.llm_usage add column if not exists elapsed_ms integer check (elapsed_ms >= 0);
alter table public.llm_usage add column if not exists failure_code text;

-- Return operational metadata only, never prompts, business content or owner credentials.
-- The window is intentionally bounded; this is not a complete historical audit log.
create or replace function public.admin_generation_jobs(p_offset integer default 0, p_limit integer default 21, p_status text default 'all')
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with recent as materialized (
    select owner_hash, data, updated_at from public.plan_states
    where updated_at >= now() - interval '7 days'
    order by updated_at desc, owner_hash limit 1000
  ), plans as (
    select r.owner_hash, r.updated_at, p.value as plan
    from recent r cross join lateral jsonb_array_elements(case when jsonb_typeof(r.data->'plans') = 'array' then r.data->'plans' else '[]'::jsonb end) p
  ), jobs as (
    select p.owner_hash, p.updated_at, p.plan->>'id' as plan_id, j.kind, j.job
    from plans p cross join lateral (values
      ('deck', p.plan->'answers'->'__deck_job'), ('coach', p.plan->'answers'->'__coach_job')
    ) j(kind, job) where jsonb_typeof(j.job) = 'object'
    union all
    select p.owner_hash, p.updated_at, p.plan->>'id', 'operating', a.value
    from plans p cross join lateral jsonb_array_elements(case when jsonb_typeof(p.plan#>'{answers,__business_operations,analyses}') = 'array' then p.plan#>'{answers,__business_operations,analyses}' else '[]'::jsonb end) a
  ), page as (
    select * from jobs where p_status = 'all'
      or (p_status = 'failed' and job->>'status' = 'failed')
      or (p_status = 'running' and job->>'status' in ('running', 'queued'))
      or (p_status = 'complete' and job->>'status' in ('complete', 'ready'))
    order by updated_at desc, owner_hash, plan_id, kind, coalesce(job->>'id', job->>'token', '')
    limit greatest(1, least(p_limit, 101)) offset greatest(0, least(p_offset, 10000))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', md5(owner_hash || ':' || plan_id || ':' || kind || ':' || coalesce(job->>'id', job->>'token', '')),
    'planId', left(plan_id, 60), 'kind', kind, 'status', left(job->>'status', 20),
    'phase', left(job->>'phase', 40),
    'errorCode', case when coalesce(job->>'code', job->>'error') ~ '^[a-zA-Z0-9_]{1,80}$' then coalesce(job->>'code', job->>'error') when coalesce(job->>'code', job->>'error') is not null then 'unclassified' else null end,
    'checkpoint', case when kind = 'deck' and jsonb_typeof(job#>'{result,slides}') = 'array' then 'reviewed_slides' when kind = 'deck' and jsonb_typeof(job#>'{draft,slides}') = 'array' then 'draft_slides' when kind = 'operating' and job->>'status' = 'ready' then 'analysis' else 'source' end,
    'updatedAt', coalesce(job->>'finishedAt', job->>'updatedAt', job->>'startedAt', updated_at::text),
    'startedAt', job->>'startedAt', 'finishedAt', job->>'finishedAt',
    'provider', left(job#>>'{consent,target,provider}', 40), 'model', left(job#>>'{consent,target,model}', 120),
    'inputTokens', case when jsonb_typeof(job#>'{usage,inputTokens}') = 'number' then job#>'{usage,inputTokens}' else null end,
    'outputTokens', case when jsonb_typeof(job#>'{usage,outputTokens}') = 'number' then job#>'{usage,outputTokens}' else null end
  )), '[]'::jsonb) from page;
$$;

revoke all on function public.admin_generation_jobs(integer, integer, text) from public, anon, authenticated;
grant execute on function public.admin_generation_jobs(integer, integer, text) to service_role;
