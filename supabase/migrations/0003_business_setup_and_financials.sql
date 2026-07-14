alter table public.projects
  add column if not exists business_setup jsonb,
  add column if not exists business_assessment jsonb;

create index if not exists projects_business_archetype_idx
  on public.projects ((business_setup->>'archetype'))
  where business_setup is not null;
