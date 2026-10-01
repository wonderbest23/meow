-- 사장님 문자 알림(알리고) — 홈페이지마다 알림 받을 휴대폰과 동의 시각.
-- 공개 홈페이지 내용(draft)과 따로 둔다: 손님에게 보이는 가게 번호와 다를 수 있고, 공개되면 안 된다.
alter table public.landing_sites add column if not exists alert_phone text;
alter table public.landing_sites add column if not exists alert_phone_agreed_at timestamptz;
do $$ begin
  alter table public.landing_sites add constraint landing_sites_alert_phone_format check (alert_phone is null or alert_phone ~ '^010[0-9]{8}$');
exception when duplicate_object then null; end $$;
