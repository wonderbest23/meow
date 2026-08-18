-- 섹션 '다시 생성' 사용량 — 문서 1부에 포함된 횟수를 넘었는지 서버가 판정하는 근거.
--
-- 세는 것은 '이미 쓰인 섹션을 AI 로 다시 만든 것'뿐이다. 첫 생성과, 손님이
-- 직접 글을 고쳐 쓰는 것은 비용이 들지 않으므로 세지 않는다.
--
-- 한 행이 1회다. 집계는 plan_id 로 count 하면 되고, 취소·환불 시에는
-- 행을 지우지 않고 그대로 둔다 — 실제로 쓴 기록이기 때문이다.

create table if not exists public.plan_regenerations (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  -- 어느 플랜의 몇 번째 재생성인지
  plan_id text not null,
  -- 소유 검사에 쓴다. 남의 플랜 사용량을 조회하지 못하게 한다
  owner_hash text not null default '',
  -- 어느 섹션이었는지 (분쟁 시 확인용)
  section_key text not null default '',
  -- 실패한 호출은 횟수에서 빼 준다
  ok boolean not null default true
);

create index if not exists plan_regenerations_plan_idx
  on public.plan_regenerations(plan_id, created_at);

-- 추가로 구매한 '다시 생성' 묶음. 한 행이 한 번의 결제다.
create table if not exists public.plan_regen_packs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  plan_id text not null,
  owner_hash text not null default '',
  -- 이 결제로 늘어난 횟수
  granted integer not null,
  -- 나이스페이 주문번호 — 같은 결제가 두 번 반영되지 않게 한다
  order_id text not null unique,
  amount integer not null
);

create index if not exists plan_regen_packs_plan_idx
  on public.plan_regen_packs(plan_id);

-- 서버(service-role)만 읽고 쓴다. 화면에서 직접 건드리지 못하게 한다.
alter table public.plan_regenerations enable row level security;
alter table public.plan_regen_packs enable row level security;
