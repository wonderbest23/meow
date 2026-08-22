-- 홈페이지 AI 수정 토큰 차감의 원천 — llm_usage 에 누가(플랜)·얼마나(토큰) 썼는지 남긴다.
-- 잔액 = 산 팩 × 200,000 − sum(input_tokens + output_tokens where kind='landing-ai-edit' and ok)
-- (lib/landing/ai-tokens.ts). 기존 행은 0 으로 남는다 — 집계에 영향 없다.

alter table public.llm_usage
  add column if not exists plan_id text,
  add column if not exists owner_hash text,
  add column if not exists input_tokens integer not null default 0,
  add column if not exists output_tokens integer not null default 0;

create index if not exists llm_usage_plan_kind_idx on public.llm_usage(plan_id, kind) where plan_id is not null;
