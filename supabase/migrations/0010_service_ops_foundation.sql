create table if not exists public.service_audit_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  guest_token_hash text not null,
  action text not null,
  stage_index smallint,
  resource_type text,
  resource_id text,
  status text not null default 'info'
    check (status in ('info', 'success', 'warning', 'error')),
  detail text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists service_audit_logs_project_idx
  on public.service_audit_logs (project_id, created_at desc);

alter table public.service_audit_logs enable row level security;

comment on table public.service_audit_logs is
  'Server-side audit trail for payment, generation, approval, and workspace saves.';

create index if not exists generation_jobs_stage_status_idx
  on public.generation_jobs (stage_id, status, created_at desc);
