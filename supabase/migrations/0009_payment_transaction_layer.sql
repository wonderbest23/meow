create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique check (char_length(order_id) between 6 and 64),
  guest_token_hash text not null,
  amount integer not null check (amount > 0),
  currency text not null default 'KRW' check (currency = 'KRW'),
  order_name text not null,
  method text not null check (method in ('CARD', 'TOSSPAY', 'TRANSFER')),
  status text not null default 'created'
    check (status in ('created', 'confirming', 'done', 'canceled', 'partial_canceled', 'aborted', 'expired', 'failed')),
  provider_status text,
  payment_key text unique,
  project_id uuid unique references public.projects(id) on delete set null,
  opportunity jsonb not null,
  founder_profile jsonb not null default '{}'::jsonb,
  terms_version text not null,
  terms_agreed_at timestamptz not null,
  raw_response jsonb,
  failure_code text,
  failure_message text,
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  transmission_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create index if not exists payment_orders_guest_idx
  on public.payment_orders (guest_token_hash, created_at desc);
create index if not exists payment_orders_status_idx
  on public.payment_orders (status, updated_at desc);

drop trigger if exists payment_orders_touch_updated_at on public.payment_orders;
create trigger payment_orders_touch_updated_at before update on public.payment_orders
for each row execute function public.touch_updated_at();

alter table public.payment_orders enable row level security;
alter table public.payment_events enable row level security;

comment on table public.payment_orders is
  'Server-only payment authority. Browser payment state is never trusted.';
comment on table public.payment_events is
  'Idempotent Toss webhook receipt log; provider state is re-queried before synchronization.';

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

  if v_order.status in ('canceled', 'partial_canceled', 'aborted', 'expired') then
    raise exception 'PAYMENT_ORDER_NOT_PAYABLE';
  end if;

  insert into public.projects (
    title,
    opportunity,
    founder_profile,
    payment_status,
    package_price,
    guest_token_hash,
    status
  ) values (
    v_order.opportunity ->> 'title',
    v_order.opportunity,
    v_order.founder_profile,
    case when p_test_paid then 'test_paid' else 'paid' end,
    v_order.amount,
    v_order.guest_token_hash,
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
