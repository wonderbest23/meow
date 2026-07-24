alter table public.payment_orders
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists customer_email text,
  add column if not exists depositor_name text,
  add column if not exists customer_phone text,
  add column if not exists cash_receipt_type text,
  add column if not exists cash_receipt_identifier text,
  add column if not exists cash_receipt_status text not null default 'not_requested',
  add column if not exists cash_receipt_issued_at timestamptz,
  add column if not exists deposit_reported_at timestamptz,
  add column if not exists admin_note text;

alter table public.payment_orders drop constraint if exists payment_orders_status_check;
alter table public.payment_orders add constraint payment_orders_status_check
  check (status in ('created', 'awaiting_deposit', 'deposit_reported', 'confirming', 'done', 'refunded', 'canceled', 'partial_canceled', 'aborted', 'expired', 'failed'));

alter table public.payment_orders drop constraint if exists payment_orders_cash_receipt_type_check;
alter table public.payment_orders add constraint payment_orders_cash_receipt_type_check
  check (cash_receipt_type is null or cash_receipt_type in ('PERSONAL', 'BUSINESS', 'NONE'));

alter table public.payment_orders drop constraint if exists payment_orders_cash_receipt_status_check;
alter table public.payment_orders add constraint payment_orders_cash_receipt_status_check
  check (cash_receipt_status in ('not_requested', 'requested', 'issued'));

create index if not exists payment_orders_owner_idx
  on public.payment_orders (owner_id, created_at desc);
create index if not exists payment_orders_manual_queue_idx
  on public.payment_orders (method, status, created_at desc);

comment on column public.payment_orders.depositor_name is
  'Manual transfer sender name supplied by the purchaser.';
comment on column public.payment_orders.cash_receipt_identifier is
  'Server-only cash receipt issuance identifier. Never returned outside the owner or admin API.';

create or replace function public.complete_payment_order(
  p_order_id text,
  p_guest_token_hash text,
  p_payment_key text,
  p_provider_status text,
  p_raw_response jsonb,
  p_test_paid boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.payment_orders%rowtype;
  v_project_id uuid;
begin
  select * into v_order
  from public.payment_orders
  where order_id = p_order_id
    and guest_token_hash = p_guest_token_hash
  for update;

  if not found then
    raise exception 'PAYMENT_ORDER_NOT_FOUND';
  end if;

  if v_order.project_id is not null then
    return v_order.project_id;
  end if;

  if v_order.amount <> 990000 or v_order.currency <> 'KRW' then
    raise exception 'PAYMENT_AMOUNT_MISMATCH';
  end if;

  if v_order.expires_at < now() then
    raise exception 'PAYMENT_ORDER_EXPIRED';
  end if;

  if v_order.status in ('refunded', 'canceled', 'partial_canceled', 'aborted', 'expired') then
    raise exception 'PAYMENT_ORDER_NOT_PAYABLE';
  end if;

  insert into public.projects (
    title,
    opportunity,
    founder_profile,
    payment_status,
    package_price,
    guest_token_hash,
    owner_id,
    status
  ) values (
    v_order.opportunity ->> 'title',
    v_order.opportunity,
    v_order.founder_profile,
    case when p_test_paid then 'test_paid' else 'paid' end,
    v_order.amount,
    v_order.guest_token_hash,
    v_order.owner_id,
    'active'
  )
  returning id into v_project_id;

  insert into public.project_stages (project_id, stage_index, status)
  select
    v_project_id,
    stage_index,
    case when stage_index = 0 then 'collecting_input' else 'not_started' end
  from generate_series(0, 5) as stage_index;

  update public.payment_orders
  set status = 'done',
      provider_status = p_provider_status,
      payment_key = p_payment_key,
      raw_response = p_raw_response,
      project_id = v_project_id,
      confirmed_at = now(),
      failure_code = null,
      failure_message = null
  where id = v_order.id;

  return v_project_id;
end;
$$;

revoke all on function public.complete_payment_order(text, text, text, text, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.complete_payment_order(text, text, text, text, jsonb, boolean)
  to service_role;
