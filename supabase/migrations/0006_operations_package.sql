alter table public.projects
  add column if not exists operations_workspace jsonb,
  add column if not exists operations_assessment jsonb,
  add column if not exists operations_package jsonb;

create index if not exists projects_operations_readiness_idx
  on public.projects (((operations_assessment->>'readinessScore')::integer))
  where operations_assessment is not null;
