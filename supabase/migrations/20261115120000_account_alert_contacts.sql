-- 진행 단계 안내 알림(카카오 알림톡 · 안 되면 문자) — 계정마다 받을 휴대폰 하나와 수신 동의 기록.
-- 홈페이지 문의 알림 번호(landing_sites.alert_phone)와 따로 둔다: 동의 문구가 다르고, 홈페이지를 만들기 전에도 받는다.
-- 이 표는 번호 · 동의 · 끄기만 담는다(발송 기록은 발송을 붙일 때 따로). 반복 실행 안전.
create table if not exists public.account_alert_contacts (
  owner_id text primary key,
  phone text not null,
  agreed_at timestamptz not null,
  disabled_at timestamptz,
  updated_at timestamptz not null default now()
);
do $$ begin
  alter table public.account_alert_contacts add constraint account_alert_contacts_phone_format check (phone ~ '^010[0-9]{8}$');
exception when duplicate_object then null; end $$;
alter table public.account_alert_contacts enable row level security;
revoke all on public.account_alert_contacts from public, anon, authenticated;
grant all on public.account_alert_contacts to service_role;
