-- 무료 창업 상담 보관.
--
-- 예전에는 아무 데도 저장하지 않았다. 새로고침하면 대화가 사라지고, 사업계획서로
-- 넘길 때 뽑아낸 상담 카드도 sessionStorage(탭 하나) 에만 있어서 탭을 닫거나
-- 기기를 바꾸면 통째로 없어졌다. 로그인 왕복 중에 잃는 일도 있었다.
--
-- 소유권은 다른 표와 같이 owner_hash(guest_token_hash) 로 잡는다.
create table if not exists public.consult_sessions (
  owner_hash text primary key,
  -- 상담에서 뽑아낸 조건(지역·예산·업종·경력 등) — 사업계획서로 넘어가는 값
  profile jsonb not null default '{}'::jsonb,
  -- 주고받은 말 [{role,text,at}] — 이어서 상담하려면 필요하다
  messages jsonb not null default '[]'::jsonb,
  -- 일일 사용량 제한용
  turns_today integer not null default 0 check (turns_today >= 0),
  turns_day date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists consult_sessions_updated_at_idx
  on public.consult_sessions(updated_at desc);

-- 서비스 롤만 접근(다른 표와 같은 정책). 앱에서 owner_hash 로 소유권을 검증한다.
alter table public.consult_sessions enable row level security;

comment on table public.consult_sessions is
  '무료 창업 상담: owner_hash 별 상담 카드(profile)·대화(messages)·일일 사용량.';
