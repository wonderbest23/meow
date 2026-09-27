-- Additive, inactive until an explicitly reviewed case set is inserted.
-- No owner, plan, or existing audit record is rewritten by this migration.
create schema oneul_quarantine;
revoke all on schema oneul_quarantine from public, anon, authenticated;

create table oneul_quarantine.cases (
  plan_id text primary key,
  case_ref text not null unique,
  batch text not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  release_evidence text,
  check (released_at is null or (not active and length(release_evidence)>0))
);
create table oneul_quarantine.snapshots (
  batch text not null,
  owner_hash text not null,
  original_row jsonb not null,
  captured_at timestamptz not null default now(),
  primary key(batch,owner_hash)
);
create table oneul_quarantine.copies (
  plan_id text not null references oneul_quarantine.cases(plan_id),
  owner_hash text not null,
  original_plan jsonb not null,
  digest text not null,
  primary key(plan_id,owner_hash)
);
create table oneul_quarantine.projects (
  project_id text primary key,
  plan_id text not null references oneul_quarantine.cases(plan_id),
  original_row jsonb not null
);
alter table oneul_quarantine.cases enable row level security;
alter table oneul_quarantine.snapshots enable row level security;
alter table oneul_quarantine.copies enable row level security;
alter table oneul_quarantine.projects enable row level security;
revoke all on all tables in schema oneul_quarantine from public,anon,authenticated,service_role;

create function oneul_quarantine.blocked(p_plan text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from oneul_quarantine.cases where plan_id=p_plan and active)
$$;
create function oneul_quarantine.blocked_project(p_project text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from oneul_quarantine.projects p join oneul_quarantine.cases c using(plan_id) where p.project_id=p_project and c.active)
  or exists(select 1 from public.projects p where p.id::text=p_project and oneul_quarantine.blocked(p.opportunity->>'planId'))
$$;
create function oneul_quarantine.owner_affected(p_owner text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from oneul_quarantine.copies p join oneul_quarantine.cases c using(plan_id) where p.owner_hash=p_owner and c.active)
$$;

create function public.plan_quarantine_status(p_owner text,p_plan_ids text[] default '{}',p_project_ids text[] default '{}') returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'revision',coalesce((select md5(string_agg(case_ref||':'||active::text,',' order by case_ref)) from oneul_quarantine.cases),''),
    'blockedPlanIds',coalesce((select jsonb_agg(c.plan_id order by c.plan_id) from oneul_quarantine.cases c where c.active and
      (c.plan_id=any(p_plan_ids) or exists(select 1 from oneul_quarantine.copies cp where cp.plan_id=c.plan_id and cp.owner_hash=p_owner))),'[]'::jsonb),
    'profileBlocked',oneul_quarantine.owner_affected(p_owner),
    'blockedProjectIds',coalesce((select jsonb_agg(id) from unnest(p_project_ids) id where oneul_quarantine.blocked_project(id)),'[]'::jsonb)
  )
$$;
revoke all on function public.plan_quarantine_status(text,text[],text[]) from public,anon,authenticated;
grant execute on function public.plan_quarantine_status(text,text[],text[]) to service_role;

create function oneul_quarantine.visible_state(p_owner text,p_data jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
  select p_data || jsonb_build_object(
    'plans',coalesce((select jsonb_agg(p.value order by p.n) from jsonb_array_elements(coalesce(p_data->'plans','[]'::jsonb)) with ordinality p(value,n) where not oneul_quarantine.blocked(p.value->>'id')),'[]'::jsonb),
    'activePlanId',case when oneul_quarantine.blocked(p_data->>'activePlanId') then 'null'::jsonb else coalesce(p_data->'activePlanId','null'::jsonb) end,
    'business',case when oneul_quarantine.owner_affected(p_owner) then '{}'::jsonb else coalesce(p_data->'business','{}'::jsonb) end
  )
$$;
create view public.plan_states_accessible with(security_barrier=true) as
  select owner_hash,oneul_quarantine.visible_state(owner_hash,data) as data,updated_at from public.plan_states;
create view public.projects_accessible with(security_barrier=true) as
  select * from public.projects p where not oneul_quarantine.blocked_project(p.id::text);
revoke all on public.plan_states_accessible,public.projects_accessible from public,anon,authenticated,service_role;
grant select on public.plan_states_accessible,public.projects_accessible to service_role;

create function oneul_quarantine.guard_state() returns trigger
language plpgsql security definer set search_path='' as $$
declare p jsonb; prior jsonb; preserved jsonb; existing_data jsonb;
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('oneul-quarantine-activation',0));
  if TG_OP='DELETE' then
    if oneul_quarantine.owner_affected(OLD.owner_hash) then raise exception 'PLAN_QUARANTINED'; end if;
    return OLD;
  end if;
  if TG_OP='UPDATE' and OLD.owner_hash<>NEW.owner_hash and oneul_quarantine.owner_affected(OLD.owner_hash) then raise exception 'PLAN_QUARANTINED'; end if;
  if TG_OP='INSERT' then
    -- INSERT .. ON CONFLICT invokes the insert trigger before the update trigger.
    select data into existing_data from public.plan_states where owner_hash=NEW.owner_hash;
  else existing_data:=OLD.data;
  end if;
  for p in select value from jsonb_array_elements(coalesce(NEW.data->'plans','[]'::jsonb)) loop
    if oneul_quarantine.blocked(p->>'id') then
      prior:=null;
      select value into prior from jsonb_array_elements(coalesce(existing_data->'plans','[]'::jsonb)) where value->>'id'=p->>'id';
      if prior is null or prior<>p then raise exception 'PLAN_QUARANTINED'; end if;
    end if;
  end loop;
  if TG_OP='UPDATE' and oneul_quarantine.owner_affected(OLD.owner_hash) then
    -- Omitted hidden records are restored in their original order; autosave is not deletion.
    select coalesce(jsonb_agg(value order by n),'[]'::jsonb) into preserved
    from jsonb_array_elements(coalesce(OLD.data->'plans','[]'::jsonb)) with ordinality q(value,n)
    where oneul_quarantine.blocked(value->>'id');
    NEW.data:=jsonb_set(NEW.data,'{plans}',preserved||coalesce((select jsonb_agg(value order by n) from jsonb_array_elements(coalesce(NEW.data->'plans','[]'::jsonb)) with ordinality q(value,n) where not oneul_quarantine.blocked(value->>'id')),'[]'::jsonb));
    NEW.data:=jsonb_set(NEW.data,'{business}',coalesce(OLD.data->'business','{}'::jsonb));
  end if;
  return NEW;
end $$;
create trigger plan_quarantine_guard before insert or update or delete on public.plan_states for each row execute function oneul_quarantine.guard_state();

create function oneul_quarantine.guard_project() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('oneul-quarantine-activation',0));
  if TG_OP<>'INSERT' and oneul_quarantine.blocked_project(OLD.id::text) then raise exception 'PLAN_QUARANTINED'; end if;
  if TG_OP<>'DELETE' and oneul_quarantine.blocked(NEW.opportunity->>'planId') then raise exception 'PLAN_QUARANTINED'; end if;
  if TG_OP='DELETE' then return OLD; end if;
  return NEW;
end $$;
create trigger project_quarantine_guard before insert or update or delete on public.projects for each row execute function oneul_quarantine.guard_project();

create function oneul_quarantine.guard_claim() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('oneul-quarantine-activation',0));
  if oneul_quarantine.owner_affected(NEW.guest_hash) or oneul_quarantine.owner_affected(NEW.account_hash) then raise exception 'PLAN_QUARANTINED'; end if;
  return NEW;
end $$;
create trigger claim_quarantine_guard before insert or update on public.plan_owner_claims for each row execute function oneul_quarantine.guard_claim();

create function oneul_quarantine.guard_child() returns trigger
language plpgsql security definer set search_path='' as $$
declare item jsonb; project_key text;
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('oneul-quarantine-activation',0));
  for item in select value from jsonb_array_elements(case when TG_OP='INSERT' then jsonb_build_array(to_jsonb(NEW)) when TG_OP='DELETE' then jsonb_build_array(to_jsonb(OLD)) else jsonb_build_array(to_jsonb(OLD),to_jsonb(NEW)) end) loop
    project_key:=item->>'project_id';
    if item ? 'site_id' then select project_id::text into project_key from public.landing_sites where id::text=item->>'site_id'; end if;
    if item ? 'stage_id' then select project_id::text into project_key from public.project_stages where id::text=item->>'stage_id'; end if;
    if oneul_quarantine.blocked_project(project_key) or oneul_quarantine.blocked(item->>'plan_id') then raise exception 'PLAN_QUARANTINED'; end if;
  end loop;
  if TG_OP='DELETE' then return OLD; end if;
  return NEW;
end $$;
do $$ declare t text; begin
  foreach t in array array['project_stages','stage_artifacts','generation_jobs','revision_requests','landing_sites','landing_versions','landing_leads','landing_events','plan_artifact_updates'] loop
    if to_regclass('public.'||t) is not null then
      execute format('create trigger quarantine_child_guard before insert or update or delete on public.%I for each row execute function oneul_quarantine.guard_child()',t);
    end if;
  end loop;
end $$;

-- No broad default-privilege changes: only this new schema's objects are locked down.
revoke all on all functions in schema oneul_quarantine from public,anon,authenticated,service_role;
grant usage on schema oneul_quarantine to service_role;
grant execute on function oneul_quarantine.visible_state(text,jsonb),oneul_quarantine.blocked_project(text) to service_role;
