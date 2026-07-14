alter table public.projects
  add column if not exists market_workspace jsonb,
  add column if not exists market_analysis jsonb,
  add column if not exists business_plan jsonb;

create index if not exists projects_selected_location_idx
  on public.projects ((market_workspace->>'selectedLocationId'))
  where market_workspace is not null;
