-- '다음 단계' 서비스 신청 — 사업자등록·통신판매업 신고·블로그 배포 같은 대행 상담 신청.
-- 사장님이 유지보수 화면에서 신청하고, 운영자가 /admin/services 에서 연락·처리한다.
-- service_id 는 lib/services/catalog.ts 의 id. 상태: received(접수) → contacted(연락함) → done(완료) | canceled(취소).
-- 반복 실행 안전.

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  plan_id text not null,
  plan_title text not null default '',
  customer_email text not null default '',
  service_id text not null,
  phone text not null,
  memo text not null default '',
  preferred_time text not null default '',
  status text not null default 'received',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table public.service_requests add constraint service_requests_status_check check (status in ('received', 'contacted', 'done', 'canceled'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.service_requests add constraint service_requests_phone_format check (phone ~ '^01[016789][0-9]{7,8}$');
exception when duplicate_object then null; end $$;

create index if not exists service_requests_owner_plan_idx on public.service_requests(owner_id, plan_id, created_at desc);
create index if not exists service_requests_created_idx on public.service_requests(created_at desc);
-- 같은 사업·같은 서비스의 진행 중 신청은 하나만 — 두 번 눌러도 한 건
create unique index if not exists service_requests_open_unique on public.service_requests(owner_id, plan_id, service_id) where status in ('received', 'contacted');

drop trigger if exists service_requests_touch_updated_at on public.service_requests;
create trigger service_requests_touch_updated_at before update on public.service_requests
for each row execute function public.touch_updated_at();

-- Service-role only (refund_requests 와 같다 — 읽기·쓰기는 서버 API 가 주인을 확인한 뒤에만).
alter table public.service_requests enable row level security;
revoke all on public.service_requests from public, anon, authenticated;
grant all on public.service_requests to service_role;
