-- AI 호출 원가를 실제 청구 기준으로 계산하려고 캐시 몫을 따로 남긴다.
-- input_tokens 는 지금처럼 캐시 읽기·쓰기를 포함한 전체 입력이다(기존 집계와 호환).
-- Opus 5.5 기준 캐시 읽기는 입력 단가의 5%, 캐시 쓰기는 1.25배라 둘을 나눠야 원가가 맞는다.
alter table public.llm_usage add column if not exists cache_read_tokens integer not null default 0;
alter table public.llm_usage add column if not exists cache_write_tokens integer not null default 0;
