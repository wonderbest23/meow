create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  guest_token_hash text,
  title text not null,
  status text not null default 'active'
    check (status in ('draft', 'active', 'completed', 'cancelled')),
  payment_status text not null default 'test_paid'
    check (payment_status in ('pending', 'test_paid', 'paid', 'failed', 'refunded')),
  package_price integer not null default 990000,
  active_stage smallint not null default 0 check (active_stage between 0 and 5),
  opportunity jsonb not null,
  founder_profile jsonb not null default '{}'::jsonb,
  business_setup jsonb,
  business_assessment jsonb,
  market_workspace jsonb,
  market_analysis jsonb,
  business_plan jsonb,
  operations_workspace jsonb,
  operations_assessment jsonb,
  operations_package jsonb,
  execution_workspace jsonb,
  execution_analysis jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_index smallint not null check (stage_index between 0 and 5),
  status text not null default 'not_started'
    check (status in ('not_started', 'collecting_input', 'ready_to_generate', 'generating', 'ready_for_review', 'revision_requested', 'approved', 'failed')),
  inputs jsonb not null default '{}'::jsonb,
  input_version integer not null default 1,
  approved_artifact_id uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, stage_index)
);

create table if not exists public.stage_artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_id uuid not null references public.project_stages(id) on delete cascade,
  stage_index smallint not null check (stage_index between 0 and 5),
  version integer not null,
  schema_version text not null default '1.0',
  content jsonb not null,
  explanations jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  review_status text not null default 'draft'
    check (review_status in ('draft', 'automated_review', 'user_review', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  unique (stage_id, version)
);

alter table public.project_stages
  drop constraint if exists project_stages_approved_artifact_id_fkey;
alter table public.project_stages
  add constraint project_stages_approved_artifact_id_fkey
  foreign key (approved_artifact_id) references public.stage_artifacts(id) on delete set null;

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_id uuid not null references public.project_stages(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempt integer not null default 1,
  model text,
  input_snapshot jsonb not null default '{}'::jsonb,
  artifact_id uuid references public.stage_artifacts(id) on delete set null,
  error_code text,
  error_message text,
  retryable boolean not null default false,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.revision_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_id uuid not null references public.project_stages(id) on delete cascade,
  artifact_id uuid not null references public.stage_artifacts(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  instruction text not null check (char_length(instruction) between 10 and 2000),
  status text not null default 'open'
    check (status in ('open', 'processing', 'resolved', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists projects_owner_id_idx on public.projects(owner_id, updated_at desc);
create index if not exists projects_guest_token_hash_idx on public.projects(guest_token_hash);
create index if not exists project_stages_project_idx on public.project_stages(project_id, stage_index);
create index if not exists artifacts_project_stage_idx on public.stage_artifacts(project_id, stage_index, version desc);
create index if not exists generation_jobs_stage_idx on public.generation_jobs(stage_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at before update on public.projects
for each row execute function public.touch_updated_at();

drop trigger if exists stages_touch_updated_at on public.project_stages;
create trigger stages_touch_updated_at before update on public.project_stages
for each row execute function public.touch_updated_at();

alter table public.projects enable row level security;
alter table public.project_stages enable row level security;
alter table public.stage_artifacts enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.revision_requests enable row level security;

create policy "owners read projects" on public.projects
for select using (auth.uid() = owner_id);
create policy "owners update projects" on public.projects
for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owners read stages" on public.project_stages
for select using (exists (
  select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()
));
create policy "owners read artifacts" on public.stage_artifacts
for select using (exists (
  select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()
));
create policy "owners read jobs" on public.generation_jobs
for select using (exists (
  select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()
));
create policy "owners read revisions" on public.revision_requests
for select using (exists (
  select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()
));
