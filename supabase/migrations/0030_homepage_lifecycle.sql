-- Preserve existing data. Duplicate legacy links/slugs must be reviewed, never silently deleted.
alter table public.landing_sites add column if not exists published_slug text;
alter table public.landing_versions add column if not exists source_updated_at timestamptz;
update public.landing_sites s set published_slug = v.config->>'slug'
from public.landing_versions v
where v.site_id = s.id and v.version = s.published_version and s.published_slug is null;
create unique index if not exists landing_sites_published_slug_idx on public.landing_sites(published_slug) where published_slug is not null;

create or replace function public.ensure_plan_project(p_plan_id text, p_title text, p_owner_hash text, p_owner_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  project_ids uuid[];
  project_id uuid;
begin
  if coalesce(length(p_plan_id), 0) not between 1 and 60 or coalesce(length(p_owner_hash), 0) <> 64 then
    raise exception 'PLAN_PROJECT_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('plan-project:' || p_owner_hash || ':' || p_plan_id, 0));
  select array_agg(id) into project_ids from public.projects
  where guest_token_hash = p_owner_hash and opportunity->>'planId' = p_plan_id;
  if cardinality(project_ids) > 1 then raise exception 'PLAN_PROJECT_DUPLICATE'; end if;
  project_id := project_ids[1];
  if project_id is null then
    insert into public.projects(title, opportunity, founder_profile, payment_status, package_price, guest_token_hash, owner_id, status)
    values (left(p_title, 120), jsonb_build_object('title', left(p_title, 120), 'planId', p_plan_id, 'source', 'plan-builder'), '{}'::jsonb, 'paid', 0, p_owner_hash, p_owner_id, 'active')
    returning id into project_id;
  end if;
  insert into public.project_stages(project_id, stage_index, status)
  select project_id, i, case when i = 0 then 'collecting_input' else 'not_started' end from generate_series(0, 5) i
  on conflict on constraint project_stages_project_id_stage_index_key do nothing;
  return project_id;
end;
$$;

create or replace function public.publish_landing_snapshot(p_project_id uuid, p_owner_hash text, p_expected_updated_at timestamptz)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  site public.landing_sites%rowtype;
  current_version public.landing_versions%rowtype;
  next_version integer;
begin
  select s.* into site from public.landing_sites s join public.projects p on p.id = s.project_id
  where s.project_id = p_project_id and p.guest_token_hash = p_owner_hash for update of s;
  if not found then raise exception 'LANDING_NOT_FOUND'; end if;
  select * into current_version from public.landing_versions where site_id = site.id and version = site.published_version;
  -- A retry only succeeds if the same snapshot is still published and no draft changed.
  if site.status = 'published' and current_version.source_updated_at = p_expected_updated_at and current_version.config = site.draft then return; end if;
  if p_expected_updated_at is null or site.updated_at <> p_expected_updated_at then raise exception 'LANDING_DRAFT_CONFLICT'; end if;
  if site.status = 'published' and current_version.config = site.draft then return; end if;
  select coalesce(max(version), 0) + 1 into next_version from public.landing_versions where site_id = site.id;
  insert into public.landing_versions(site_id, version, config, published_at, source_updated_at)
  values (site.id, next_version, site.draft, now(), site.updated_at);
  update public.landing_sites set status = 'published', published_version = next_version, published_slug = site.draft->>'slug' where id = site.id;
end;
$$;

create or replace function public.rollback_landing_snapshot(p_project_id uuid, p_owner_hash text, p_version integer, p_expected_updated_at timestamptz)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  site public.landing_sites%rowtype;
  target public.landing_versions%rowtype;
begin
  select s.* into site from public.landing_sites s join public.projects p on p.id = s.project_id
  where s.project_id = p_project_id and p.guest_token_hash = p_owner_hash for update of s;
  if not found then raise exception 'LANDING_NOT_FOUND'; end if;
  select * into target from public.landing_versions where site_id = site.id and version = p_version;
  if not found then raise exception 'LANDING_VERSION_NOT_FOUND'; end if;
  if site.status = 'published' and site.published_version = target.version and site.draft = target.config then return; end if;
  if p_expected_updated_at is null or site.updated_at <> p_expected_updated_at then raise exception 'LANDING_DRAFT_CONFLICT'; end if;
  update public.landing_sites set slug = target.config->>'slug', draft = target.config,
    published_version = target.version, published_slug = target.config->>'slug', status = 'published' where id = site.id;
end;
$$;

revoke all on function public.ensure_plan_project(text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.publish_landing_snapshot(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.rollback_landing_snapshot(uuid, text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.ensure_plan_project(text, text, text, uuid) to service_role;
grant execute on function public.publish_landing_snapshot(uuid, text, timestamptz) to service_role;
grant execute on function public.rollback_landing_snapshot(uuid, text, integer, timestamptz) to service_role;
