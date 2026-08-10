-- LLM API 호출 사용량 로그 — 어드민 대시보드의 'API 사용량' 지표 원천.
-- 호출 1건당 1행. 집계는 created_at 범위 count로 충분하다.

create table if not exists public.llm_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  -- 어떤 기능이 호출했는지 (generate/deck/suggest/idea/delivery/etc)
  kind text not null default 'etc',
  provider text not null default '',
  ok boolean not null default true
);

create index if not exists llm_usage_created_idx on public.llm_usage(created_at);

-- Service-role only.
alter table public.llm_usage enable row level security;
