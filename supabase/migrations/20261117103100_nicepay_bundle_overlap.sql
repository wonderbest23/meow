-- 카드 승인 직전 '이미 산 것' 검사에 묶음(bundle)을 넣는다.
--
-- 0031 의 claim_nicepay_plan_order 는 같은 상품끼리만, 그리고 완료(done) 주문은 계획서·홈페이지만 막았다.
-- 그래서 묶음 결제창을 두 탭에 열면 둘 다 승인됐고(59,000원 두 번), 계획서를 이미 산 사람이 묶음을 사거나
-- 묶음을 산 사람이 계획서를 또 사는 것도 승인 단계에서는 막히지 않았다(결제 전 화면 검사만 있었다).
--
-- 바뀐 규칙(계획서·홈페이지·묶음, 같은 계정·같은 사업):
--   계획서 결제   ← 계획서·묶음이 승인 중이거나 완료면 막는다
--   홈페이지 결제 ← 홈페이지·묶음이 승인 중이거나 완료면 막는다(묶음에서 홈페이지만 환불한 주문은 빼고)
--   묶음 결제     ← 계획서·홈페이지·묶음이 승인 중이거나 완료면 막는다
-- 세 상품은 같은 잠금 키를 써서, 두 탭이 동시에 승인해도 하나만 지나간다.
-- 다시 생성·도메인 등 나머지 상품은 예전과 같다(같은 상품이 승인 중일 때만 막고, 완료는 다시 살 수 있다).
--
-- 앱 결제(IAP) 주문도 같은 표(payment_orders)에 done 으로 남으므로, 앱에서 산 것도 카드 승인 때 함께 막힌다.
-- 운영 DB 에 이 파일을 적용해야 효과가 난다(0031 의 함수 하나를 다시 정의할 뿐, 표·데이터는 바꾸지 않는다).

create or replace function public.claim_nicepay_plan_order(p_order_id text, p_tid text, p_environment text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v public.payment_orders%rowtype;
  v_product text;
  v_lock_group text;
  v_overlaps text[];
begin
  if p_environment not in ('production','sandbox') or p_environment is null
    or p_tid is null or length(p_tid) not between 1 and 128 then
    raise exception 'PAYMENT_INPUT_INVALID';
  end if;
  select * into v from public.payment_orders where order_id=p_order_id for update;
  if not found or v.order_id not like 'PB-%' or v.method <> 'CARD' then
    raise exception 'PAYMENT_ORDER_NOT_FOUND';
  end if;
  if v.status <> 'created' then return false; end if;
  if v.expires_at <= now() or v.payment_key is not null or v.provider_status is not null then
    raise exception 'PAYMENT_STATE_CONFLICT';
  end if;
  v_product := coalesce(v.opportunity->>'product','plan');
  -- 계획서·홈페이지·묶음은 서로 겹치므로 한 잠금을 함께 쓴다
  v_lock_group := case when v_product in ('plan','homepage','bundle') then 'document' else v_product end;
  v_overlaps := case v_product
    when 'plan' then array['plan','bundle']
    when 'homepage' then array['homepage','bundle']
    when 'bundle' then array['plan','homepage','bundle']
    else array[]::text[] end;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(v.owner_id::text,'') || ':' || coalesce(v.opportunity->>'planId','') || ':' || v_lock_group,0));
  if exists(select 1 from public.payment_orders other where other.id<>v.id
    and other.owner_id=v.owner_id and other.opportunity->>'planId'=v.opportunity->>'planId'
    and (
      -- 같은 상품이 이미 승인 중(모든 상품 공통, 예전 규칙)
      (other.status='confirming' and coalesce(other.opportunity->>'product','plan')=v_product)
      -- 겹치는 상품이 승인 중이거나 이미 완료(계획서·홈페이지·묶음)
      or (other.status in ('confirming','done')
        and coalesce(other.opportunity->>'product','plan') = any(v_overlaps)
        -- 묶음에서 홈페이지만 환불한 주문은 홈페이지를 열지 않는다 — 홈페이지 단독 구매는 막지 않는다
        and not (v_product='homepage' and coalesce(other.opportunity->>'product','plan')='bundle'
          and coalesce(other.opportunity->>'homepageRefunded','false')='true'))
    )) then
    raise exception 'PAYMENT_ALREADY_IN_PROGRESS';
  end if;
  update public.payment_orders set status='confirming', payment_key=p_tid,
    provider_status='NICEPAY_' || p_environment, updated_at=now() where id=v.id;
  return true;
end;
$$;

revoke all on function public.claim_nicepay_plan_order(text,text,text) from public, anon, authenticated;
grant execute on function public.claim_nicepay_plan_order(text,text,text) to service_role;
