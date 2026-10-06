-- 출시 전 알림(lib/payments/paid-notifications.ts, lib/operations/tax-reminders.ts).
-- 1) 결제 완료 알림을 주문마다 한 번만 — 결제 복귀(return)와 결과 확인(reconcile) 어느 쪽이 먼저 와도
--    paid_notified_at 이 비어 있을 때만 맡는다(조건부 update). 칸이 없으면 앱은 '이번 요청에서 처음 완료된 주문'만 알린다.
alter table public.payment_orders add column if not exists paid_notified_at timestamptz;

-- 2) 세금 신고 마감 문자 — 받는 번호(해시)·마감일·며칠 전 한 줄이 '보냈다/맡았다' 표시. 같은 번호에는 한 번만.
--    번호 원문은 두지 않는다(landing_sites.alert_phone 에 이미 있다). 표가 없으면 앱은 아무것도 보내지 않는다.
create table if not exists public.tax_reminder_sends (
  recipient_key text not null check (recipient_key ~ '^[0-9a-f]{64}$'),
  deadline date not null,
  days_before integer not null check (days_before in (1, 7)),
  kind text not null check (kind in ('income', 'vat')),
  status text not null check (status in ('processing', 'sent', 'failed')),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (recipient_key, deadline, days_before)
);
alter table public.tax_reminder_sends enable row level security;
revoke all on public.tax_reminder_sends from public, anon, authenticated;
grant all on public.tax_reminder_sends to service_role;
