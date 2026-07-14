alter table public.projects
  add column if not exists launch_mission_workspace jsonb;

update public.projects
set launch_mission_workspace = metadata -> 'launchMissionWorkspace'
where launch_mission_workspace is null
  and metadata ? 'launchMissionWorkspace';

comment on column public.projects.launch_mission_workspace is
  'Evidence-gated beginner launch missions, workspace quotes, brand draft, and support choices.';
