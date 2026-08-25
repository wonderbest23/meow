-- 메인 홈페이지 문구·섹션 숨김(어드민 편집) 저장소.
-- 운영 설정(platform_legal_settings)과 같은 단일 행 jsonb 구조다.
create table if not exists public.site_copy (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 서비스 롤만 읽고 쓴다 — 정책을 만들지 않으면 anon/authenticated 는 접근 불가.
alter table public.site_copy enable row level security;
