alter table public.projects
  add column if not exists execution_workspace jsonb,
  add column if not exists execution_analysis jsonb;

create index if not exists projects_execution_confidence_idx
  on public.projects (((execution_analysis->>'confidenceScore')::integer))
  where execution_analysis is not null;
