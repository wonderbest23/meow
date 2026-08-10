-- 환불 요청 접수함 — 사용자가 마이페이지에서 접수하고 어드민이 처리한다.
-- 주문 1건당 요청 1건(unique). 상태: received(접수) → done(환불 완료) | rejected(거절).

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_id text not null,
  customer_email text not null default '',
  order_id text not null unique,
  order_name text not null default '',
  amount integer not null default 0,
  reason text not null,
  status text not null default 'received',
  admin_note text not null default ''
);

create index if not exists refund_requests_status_idx on public.refund_requests(status);
create index if not exists refund_requests_owner_idx on public.refund_requests(owner_id);

-- Service-role only.
alter table public.refund_requests enable row level security;
