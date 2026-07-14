create table if not exists public.landing_sites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'unpublished')),
  draft jsonb not null,
  published_version integer,
  custom_domain text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.landing_versions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.landing_sites(id) on delete cascade,
  version integer not null check (version > 0),
  config jsonb not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (site_id, version)
);

create table if not exists public.landing_leads (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.landing_sites(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  message text,
  privacy_agreed boolean not null check (privacy_agreed),
  marketing_agreed boolean not null default false,
  source text not null default 'landing',
  created_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);

create table if not exists public.landing_events (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.landing_sites(id) on delete cascade,
  event_type text not null check (event_type in ('page_view', 'cta_click')),
  visitor_id text not null,
  path text not null,
  referrer text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists landing_versions_site_idx
  on public.landing_versions(site_id, version desc);
create index if not exists landing_leads_site_idx
  on public.landing_leads(site_id, created_at desc);
create index if not exists landing_events_site_type_idx
  on public.landing_events(site_id, event_type, created_at desc);

drop trigger if exists landing_sites_touch_updated_at on public.landing_sites;
create trigger landing_sites_touch_updated_at before update on public.landing_sites
for each row execute function public.touch_updated_at();

alter table public.landing_sites enable row level security;
alter table public.landing_versions enable row level security;
alter table public.landing_leads enable row level security;
alter table public.landing_events enable row level security;

create policy "owners read landing sites" on public.landing_sites
for select using (exists (
  select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()
));
create policy "owners read landing versions" on public.landing_versions
for select using (exists (
  select 1
  from public.landing_sites s
  join public.projects p on p.id = s.project_id
  where s.id = site_id and p.owner_id = auth.uid()
));
create policy "owners read landing leads" on public.landing_leads
for select using (exists (
  select 1
  from public.landing_sites s
  join public.projects p on p.id = s.project_id
  where s.id = site_id and p.owner_id = auth.uid()
));
