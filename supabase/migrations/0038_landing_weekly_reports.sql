-- 주간 사장님 리포트(lib/landing/weekly-report.ts).
-- 홈페이지마다 수신 거부 표시와, 주마다 한 줄씩 '이번 주 리포트를 맡았다/보냈다' 기록.
alter table public.landing_sites add column if not exists weekly_report_opt_out boolean not null default false;

create table if not exists public.landing_weekly_reports (
  site_id uuid not null references public.landing_sites(id) on delete cascade,
  week_start date not null,
  status text not null check (status in ('processing','sent','skipped','failed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  lease_until timestamptz,
  provider_id text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (site_id, week_start)
);
create index if not exists landing_weekly_reports_week_idx on public.landing_weekly_reports(week_start, status);
alter table public.landing_weekly_reports enable row level security;
revoke all on public.landing_weekly_reports from public, anon, authenticated;
grant all on public.landing_weekly_reports to service_role;
