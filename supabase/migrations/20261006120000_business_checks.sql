-- 사업자 확인 — 사장님이 넣은 사업자등록번호로 국세청 상태·공정위 통신판매업 신고를 조회한 마지막 결과.
-- 사업(plan)마다 한 줄. '다음 단계'가 등록·신고가 끝났는지 보고 '완료'를 붙인다. 반복 실행 안전.
create table if not exists public.business_checks (
  owner_id text not null,
  plan_id text not null,
  business_number text not null,
  business_state text,
  tax_type text not null default '',
  closed_at text not null default '',
  mail_order_state text,
  mail_order_no text not null default '',
  mail_order_reported_at text not null default '',
  checked_at timestamptz not null default now(),
  primary key (owner_id, plan_id)
);
do $$ begin
  alter table public.business_checks add constraint business_checks_number_format check (business_number ~ '^[0-9]{10}$');
exception when duplicate_object then null; end $$;
alter table public.business_checks enable row level security;
revoke all on public.business_checks from public, anon, authenticated;
