-- Reserve each approval once, then settle from a verified provider response.
create or replace function public.claim_nicepay_plan_order(p_order_id text, p_tid text, p_environment text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v public.payment_orders%rowtype;
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
  perform pg_advisory_xact_lock(hashtextextended(coalesce(v.owner_id::text,'') || ':' || coalesce(v.opportunity->>'planId','') || ':' || coalesce(v.opportunity->>'product','plan'),0));
  if exists(select 1 from public.payment_orders other where other.id<>v.id
    and other.owner_id=v.owner_id and other.opportunity->>'planId'=v.opportunity->>'planId'
    and coalesce(other.opportunity->>'product','plan')=coalesce(v.opportunity->>'product','plan')
    and (other.status='confirming' or (other.status='done' and coalesce(v.opportunity->>'product','plan') in ('plan','homepage')))) then
    raise exception 'PAYMENT_ALREADY_IN_PROGRESS';
  end if;
  update public.payment_orders set status='confirming', payment_key=p_tid,
    provider_status='NICEPAY_' || p_environment, updated_at=now() where id=v.id;
  return true;
end;
$$;

create or replace function public.settle_nicepay_plan_order(p_order_id text, p_tid text, p_environment text, p_raw jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v public.payment_orders%rowtype; next_status text; pack public.plan_regen_packs%rowtype;
begin
  if p_environment not in ('production','sandbox') or p_environment is null
    or p_raw->>'resultCode' is distinct from '0000'
    or p_raw->>'tid' is distinct from p_tid
    or p_raw->>'orderId' is distinct from p_order_id then
    raise exception 'PAYMENT_PROVIDER_MISMATCH';
  end if;
  select * into v from public.payment_orders where order_id=p_order_id for update;
  if not found or v.order_id not like 'PB-%' or v.method <> 'CARD'
    or v.payment_key is distinct from p_tid
    or v.provider_status is distinct from 'NICEPAY_' || p_environment then
    raise exception 'PAYMENT_STATE_CONFLICT';
  end if;
  if jsonb_typeof(p_raw->'amount') is distinct from 'number'
    or (p_raw->>'amount')::numeric <> v.amount or p_raw->>'currency' is distinct from v.currency then
    raise exception 'PAYMENT_AMOUNT_MISMATCH';
  end if;
  next_status := case p_raw->>'status' when 'paid' then 'done' when 'failed' then 'failed'
    when 'cancelled' then 'canceled' when 'partialCancelled' then 'partial_canceled'
    when 'expired' then 'expired' else null end;
  if next_status is null then raise exception 'PAYMENT_NOT_FINAL'; end if;
  if v.status = next_status then return v.status; end if;
  if v.status <> 'confirming' then raise exception 'PAYMENT_STATE_CONFLICT'; end if;
  -- Entitlement and the order commit together; a lost HTTP reply can be retried.
  if next_status='done' and v.opportunity->>'product'='regen' then
    if nullif(v.opportunity->>'planId','') is null or v.owner_id is null then
      raise exception 'PAYMENT_REGEN_TARGET_REQUIRED';
    end if;
    insert into public.plan_regen_packs(plan_id,owner_hash,order_id,granted,amount)
      values(v.opportunity->>'planId',v.owner_id::text,p_order_id,10,v.amount)
      on conflict(order_id) do nothing;
    select * into pack from public.plan_regen_packs where order_id=p_order_id;
    if pack.plan_id is distinct from v.opportunity->>'planId'
      or pack.owner_hash is distinct from v.owner_id::text or pack.amount <> v.amount or pack.granted <> 10 then
      raise exception 'PAYMENT_REGEN_CONFLICT';
    end if;
  end if;
  update public.payment_orders set status=next_status, raw_response=p_raw,
    confirmed_at=case when next_status='done' then now() else confirmed_at end,
    failure_code=case when next_status='done' then null else 'PROVIDER_' || upper(p_raw->>'status') end,
    failure_message=null, updated_at=now() where id=v.id;
  return next_status;
end;
$$;

revoke all on function public.claim_nicepay_plan_order(text,text,text) from public, anon, authenticated;
revoke all on function public.settle_nicepay_plan_order(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.claim_nicepay_plan_order(text,text,text) to service_role;
grant execute on function public.settle_nicepay_plan_order(text,text,text,jsonb) to service_role;
