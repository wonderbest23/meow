-- 챗봇 → 결제 깔때기 측정.
--
-- 상담 위젯의 CTA 를 손보면서도 효과를 잴 자리가 없었다 — 노출·클릭·인계 도착이
-- 어디에도 남지 않아, 문구를 바꿔도 좋아졌는지 알 수 없었다. 여기 한 표에
-- 이벤트 이름과 부가 정보(jsonb)만 쌓는다. 개인정보는 담지 않는다 —
-- owner_hash 는 다른 표와 같은 익명 식별자다.
create table if not exists public.funnel_events (
  id uuid primary key default gen_random_uuid(),
  owner_hash text not null,
  -- 이벤트 이름은 앱(lib/funnel/domain.ts)의 목록으로 검증한 것만 들어온다
  event text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists funnel_events_event_created_idx
  on public.funnel_events(event, created_at desc);
create index if not exists funnel_events_created_at_idx
  on public.funnel_events(created_at desc);

-- 서비스 롤만 접근(다른 표와 같은 정책).
alter table public.funnel_events enable row level security;

comment on table public.funnel_events is
  '챗봇 상담 → 사업계획서 깔때기 이벤트: CTA 노출·클릭·인계 도착.';
