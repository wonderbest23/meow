-- 플랜 빌더 상태 저장 (챕터/섹션 답변·생성본문). 소유권은 guest_token_hash(앱 레벨).
create table if not exists public.plan_states (
  owner_hash text primary key,
  title text not null default '새 플랜',
  plan_type text not null default '창업 초기 · 사업계획서',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 서비스 롤만 접근(다른 테이블과 동일 정책). 앱 레벨에서 owner_hash로 소유권 검증.
alter table public.plan_states enable row level security;

comment on table public.plan_states is '플랜 빌더 상태: owner_hash별 title/plan_type/섹션 데이터(jsonb).';
