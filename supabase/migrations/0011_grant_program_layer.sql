alter table public.projects
  add column if not exists grant_workspace jsonb,
  add column if not exists grant_analysis jsonb,
  add column if not exists grant_package jsonb;

comment on column public.projects.grant_workspace is
  'Founder inputs for public grant program matching.';

comment on column public.projects.grant_analysis is
  'Eligibility scoring against curated Korean grant catalog.';

comment on column public.projects.grant_package is
  'Application draft paragraphs for top matched programs.';
