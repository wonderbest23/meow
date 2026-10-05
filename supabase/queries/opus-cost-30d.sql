-- 최근 30일 Opus 5.5 호출 비용을 kind별로 본다. 조회 전용 — 마이그레이션이 아니다.
-- 단가: 입력 $4 / 출력 $20 (100만 토큰당). 성공한 호출(ok)만 센다.
select kind, model,
  count(*) as calls,
  round(avg(input_tokens)) as avg_in,
  round(avg(output_tokens)) as avg_out,
  round(avg(input_tokens * 4 + output_tokens * 20) / 1e6::numeric, 4) as avg_usd,
  round(sum(input_tokens * 4 + output_tokens * 20) / 1e6::numeric, 2) as total_usd
from public.llm_usage
where ok and model ilike '%opus-5-5%'
  and created_at > now() - interval '30 days'
group by kind, model
order by total_usd desc;
