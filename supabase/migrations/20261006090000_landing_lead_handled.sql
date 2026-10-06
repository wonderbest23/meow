-- 접수된 문의 '처리 완료' 표시 — 사장님이 연락을 마친 문의를 구분한다.
-- null 이면 아직 처리 전. 화면은 이 칸이 없으면(마이그레이션 전) 처리 완료 단추를 숨긴다.
-- 추가만 한다(기존 문의는 모두 처리 전으로 보인다). 반복 실행 안전.
alter table public.landing_leads add column if not exists handled_at timestamptz;
