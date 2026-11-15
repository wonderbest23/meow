-- 진행 단계 안내 발송 기록 — (계정, 사업, 단계)마다 한 줄. 같은 사업의 같은 단계는 평생 한 번만 보낸다.
-- plan_id = '' · stage = 'baseline' 줄은 "이 계정은 처음 켠 날의 단계를 이미 지난 것으로 적어 두었다"는 표시다.
-- status: processing(보내는 중) · sent(보냄) · failed(거절) · skipped(보내지 않기로 함). 반복 실행 안전.
create table if not exists public.journey_notifications (
  owner_id text not null,
  plan_id text not null,
  stage text not null,
  status text not null,
  error_code text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (owner_id, plan_id, stage)
);
do $$ begin
  alter table public.journey_notifications add constraint journey_notifications_status check (status in ('processing', 'sent', 'failed', 'skipped'));
exception when duplicate_object then null; end $$;
create index if not exists journey_notifications_owner_sent on public.journey_notifications (owner_id, sent_at);
alter table public.journey_notifications enable row level security;
revoke all on public.journey_notifications from public, anon, authenticated;
grant all on public.journey_notifications to service_role;
