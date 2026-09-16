-- Server-owned update proposals. Existing plans/proposals remain readable without conversion.
create table if not exists public.plan_artifact_updates (
  id uuid primary key,
  owner_hash text not null,
  plan_id text not null check (length(plan_id) between 1 and 60),
  revision integer not null check (revision > 0),
  status text not null check (status in ('queued','running','ready','failed','stale','cancelled','applied')),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (octet_length(data::text) <= 16000000)
);
alter table public.plan_artifact_updates enable row level security;
revoke all on public.plan_artifact_updates from public, anon, authenticated;
grant all on public.plan_artifact_updates to service_role;
create index if not exists plan_artifact_updates_owner_idx on public.plan_artifact_updates(owner_hash, plan_id, created_at desc);

create or replace function public.commit_artifact_update(
  p_owner_hash text, p_plan_id text, p_id uuid, p_expected_revision integer, p_data jsonb,
  p_expected_plan jsonb default null, p_next_plan jsonb default null,
  p_site_id uuid default null, p_site_at timestamptz default null, p_draft jsonb default null
) returns text language plpgsql security invoker set search_path = '' as $$
declare
  state public.plan_states%rowtype;
  job public.plan_artifact_updates%rowtype;
  current_plan jsonb;
  plan_index integer;
  site public.landing_sites%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('plan-state:' || p_owner_hash, 0));
  if exists(select 1 from public.plan_owner_claims where guest_hash = p_owner_hash) then return 'owner_changed'; end if;
  select * into state from public.plan_states where owner_hash = p_owner_hash for update;
  if not found then return 'not_found'; end if;
  select value, ordinality::integer - 1 into current_plan, plan_index
  from jsonb_array_elements(state.data->'plans') with ordinality where value->>'id' = p_plan_id;
  if current_plan is null then return 'not_found'; end if;
  if p_expected_plan is not null and current_plan <> p_expected_plan then return 'source_changed'; end if;
  select * into job from public.plan_artifact_updates where id = p_id for update;
  if found and (job.owner_hash <> p_owner_hash or job.plan_id <> p_plan_id) then return 'not_found'; end if;
  if coalesce(job.revision, 0) <> p_expected_revision then return 'revision_conflict'; end if;
  if p_data->>'ownerHash' is distinct from p_owner_hash or p_data->>'planId' is distinct from p_plan_id
    or p_data->>'id' is distinct from p_id::text or (p_data->>'revision')::integer <> p_expected_revision + 1 then return 'invalid_job'; end if;
  if job.id is null then
    if (select count(*) from public.plan_artifact_updates where owner_hash = p_owner_hash and status in ('queued','running')) >= 2
      or (select count(*) from public.plan_artifact_updates where owner_hash = p_owner_hash and created_at > now() - interval '1 day') >= 12 then return 'limit_reached'; end if;
    if exists(select 1 from public.plan_artifact_updates where owner_hash = p_owner_hash and plan_id = p_plan_id and status in ('queued','running','ready')) then return 'review_pending'; end if;
    if (select count(*) from public.plan_artifact_updates where owner_hash = p_owner_hash and plan_id = p_plan_id) >= 30
      or (select count(*) from public.plan_artifact_updates where owner_hash = p_owner_hash and plan_id = p_plan_id and created_at > now() - interval '1 day') >= 6 then return 'limit_reached'; end if;
  end if;
  if p_next_plan is not null and (p_expected_plan is null or p_next_plan->>'id' is distinct from p_plan_id) then return 'invalid_plan'; end if;
  if p_draft is not null then
    select s.* into site from public.landing_sites s join public.projects p on p.id = s.project_id
      where s.id = p_site_id and p.guest_token_hash = p_owner_hash and p.opportunity->>'planId' = p_plan_id for update of s;
    if not found or p_site_at is null or site.updated_at <> p_site_at then return 'source_changed'; end if;
    if p_draft->>'slug' is distinct from site.draft->>'slug' then return 'invalid_draft'; end if;
  end if;
  if p_next_plan is not null then
    update public.plan_states set data = jsonb_set(state.data, array['plans',plan_index::text],p_next_plan),
      updated_at = greatest(clock_timestamp(),state.updated_at + interval '1 microsecond') where owner_hash = p_owner_hash;
  end if;
  -- Never modify the published pointer, public slug, or published versions.
  if p_draft is not null then update public.landing_sites set draft = p_draft where id = p_site_id; end if;
  insert into public.plan_artifact_updates(id,owner_hash,plan_id,revision,status,data,created_at,updated_at)
    values(p_id,p_owner_hash,p_plan_id,(p_data->>'revision')::integer,p_data->>'status',p_data,(p_data->>'createdAt')::timestamptz,(p_data->>'updatedAt')::timestamptz)
    on conflict(id) do update set revision = excluded.revision,status = excluded.status,data = excluded.data,updated_at = excluded.updated_at;
  return 'saved';
end;
$$;
revoke all on function public.commit_artifact_update(text,text,uuid,integer,jsonb,jsonb,jsonb,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.commit_artifact_update(text,text,uuid,integer,jsonb,jsonb,jsonb,uuid,timestamptz,jsonb) to service_role;

-- Refuse account transfer while independently stored work is in flight or awaiting review.
create or replace function public.guard_artifact_owner_transfer() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if exists(select 1 from public.plan_artifact_updates where owner_hash = new.guest_hash and status in ('queued','running','ready')) then
    raise exception 'PLAN_CLAIM_BUSY';
  end if;
  update public.plan_artifact_updates set owner_hash = new.account_hash,
    data = jsonb_set(data,'{ownerHash}',to_jsonb(new.account_hash)) where owner_hash = new.guest_hash;
  return new;
end;
$$;
create trigger artifact_owner_transfer before insert on public.plan_owner_claims
for each row execute function public.guard_artifact_owner_transfer();
