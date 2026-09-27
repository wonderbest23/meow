-- Provider cost accounting only. No budgets, prices or model qualifications are seeded.
create schema if not exists ai_budget_private;
revoke all on schema ai_budget_private from public, anon, authenticated;
grant usage on schema ai_budget_private to service_role;

create table ai_budget_private.services (
  id text primary key,
  period_id text not null,
  cap_micro_usd bigint not null check (cap_micro_usd between 0 and 9007199254740991),
  halted boolean not null default false
);
-- The cap is a service lifetime ceiling. Changing the active period does not reset it.
create table ai_budget_private.prices (
  catalog text not null, provider text not null, model text not null,
  input_rate bigint not null check (input_rate between 0 and 9007199254740991),
  output_rate bigint not null check (output_rate between 0 and 9007199254740991),
  max_input bigint not null check (max_input between 0 and 9007199254740991),
  max_output bigint not null check (max_output between 0 and 9007199254740991),
  source text not null check (length(trim(source)) > 0),
  checked_at timestamptz not null, expires_at timestamptz not null,
  qualified boolean not null default false,
  primary key (catalog, provider, model), check (expires_at > checked_at)
);
create table ai_budget_private.reservations (
  id uuid primary key default gen_random_uuid(), service text not null references ai_budget_private.services(id),
  period_id text not null, job text not null, attempt integer not null check (attempt in (0,1)),
  request jsonb not null, provider text not null, model text not null,
  state text not null check (state in ('reserved','sent','uncertain','settled','released')),
  reserved bigint not null check (reserved between 0 and 9007199254740991),
  charged bigint not null check (charged between 0 and 9007199254740991),
  deadline timestamptz not null, dispatch_token uuid,
  input_bound bigint not null, output_bound bigint not null,
  input_rate bigint not null, output_rate bigint not null, price_catalog text not null,
  price_source text not null, price_checked_at timestamptz not null,
  input_tokens bigint, output_tokens bigint, actual_micro_usd numeric(40,0),
  unique (service,job,attempt),
  check ((input_tokens is null and output_tokens is null) or
    (input_tokens between 0 and 9007199254740991 and output_tokens between 0 and 9007199254740991))
);
create table ai_budget_private.events (
  id bigint generated always as identity primary key,
  service text not null, reservation uuid, operation text not null,
  state text, charged bigint, created_at timestamptz not null default clock_timestamp()
);
alter table ai_budget_private.services enable row level security;
alter table ai_budget_private.prices enable row level security;
alter table ai_budget_private.reservations enable row level security;
alter table ai_budget_private.events enable row level security;
create policy service_budget_server on ai_budget_private.services to service_role using (true) with check (true);
create policy service_prices_server on ai_budget_private.prices to service_role using (true) with check (true);
create policy service_reservations_server on ai_budget_private.reservations to service_role using (true) with check (true);
create policy service_events_server on ai_budget_private.events to service_role using (true) with check (true);
revoke all on ai_budget_private.services, ai_budget_private.prices, ai_budget_private.reservations, ai_budget_private.events from public, anon, authenticated;
grant select, update on ai_budget_private.services to service_role;
grant select on ai_budget_private.prices to service_role;
grant select, insert, update on ai_budget_private.reservations to service_role;
grant select, insert on ai_budget_private.events to service_role;
grant usage on sequence ai_budget_private.events_id_seq to service_role;

create function public.ai_budget_reserve(p_service text, p_period text, p_catalog text,
  p_job text, p_attempt integer, p_request jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  s ai_budget_private.services%rowtype;
  r ai_budget_private.reservations%rowtype;
  p ai_budget_private.prices%rowtype;
  signature jsonb; bytes bigint; output_limit bigint; input_limit bigint;
  expires timestamptz; amount numeric; used numeric;
begin
  select * into s from ai_budget_private.services where id=p_service for update;
  if not found then return jsonb_build_object('ok',false,'code','budget_not_configured'); end if;
  if s.halted then return jsonb_build_object('ok',false,'code','service_halted'); end if;
  if s.period_id<>p_period then return jsonb_build_object('ok',false,'code','budget_period_mismatch'); end if;
  if p_job is null or length(p_job) not between 1 and 128 or p_attempt not in (0,1)
    or p_request->>'requestFingerprint' !~ '^[a-f0-9]{64}$'
    or not (p_request ?& array['provider','model','inputBytes','maxOutputTokens','deadline','requestFingerprint'])
    or p_request->>'inputBytes' !~ '^[0-9]{1,16}$' or p_request->>'maxOutputTokens' !~ '^[0-9]{1,16}$'
    or p_request->>'deadline' !~ '^[0-9]{1,16}$'
    then return jsonb_build_object('ok',false,'code','invalid_budget_request'); end if;
  bytes := (p_request->>'inputBytes')::bigint; output_limit := (p_request->>'maxOutputTokens')::bigint;
  if bytes>4503599627354111 or output_limit>9007199254740991 then return jsonb_build_object('ok',false,'code','invalid_budget_request'); end if;
  expires := to_timestamp((p_request->>'deadline')::double precision/1000);
  signature := p_request - 'deadline';
  select * into r from ai_budget_private.reservations where service=p_service and job=p_job and attempt=p_attempt for update;
  if found then
    if r.request<>signature then return jsonb_build_object('ok',false,'code','reservation_conflict'); end if;
    if r.state='reserved' and r.deadline>clock_timestamp() then return jsonb_build_object('ok',true,'id',r.id,'state',r.state,'duplicate',true); end if;
    return jsonb_build_object('ok',false,'code','reservation_already_used','id',r.id,'state',r.state);
  end if;
  if expires<=clock_timestamp() then return jsonb_build_object('ok',false,'code','budget_deadline'); end if;
  select * into p from ai_budget_private.prices where catalog=p_catalog and provider=p_request->>'provider'
    and model=p_request->>'model' and qualified and checked_at<=clock_timestamp() and expires_at>=expires;
  if not found then return jsonb_build_object('ok',false,'code','model_price_unverified'); end if;
  input_limit := bytes*2+32768;
  if input_limit>p.max_input or output_limit>p.max_output then return jsonb_build_object('ok',false,'code','model_input_limit'); end if;
  amount := ceil((input_limit::numeric*p.input_rate + output_limit::numeric*p.output_rate)/1000000);
  -- Expiry releases only provably unsent reservations, never sent/uncertain usage.
  update ai_budget_private.reservations set state='released',charged=0
    where service=p_service and state='reserved' and deadline<=clock_timestamp();
  select coalesce(sum(charged),0) into used from ai_budget_private.reservations where service=p_service;
  if amount>9007199254740991 or amount>s.cap_micro_usd-used then return jsonb_build_object('ok',false,'code','budget_exhausted'); end if;
  insert into ai_budget_private.reservations(service,period_id,job,attempt,request,provider,model,state,reserved,charged,deadline,
    input_bound,output_bound,input_rate,output_rate,price_catalog,price_source,price_checked_at)
    values(p_service,p_period,p_job,p_attempt,signature,p.provider,p.model,'reserved',amount,amount,expires,
      input_limit,output_limit,p.input_rate,p.output_rate,p.catalog,p.source,p.checked_at) returning * into r;
  insert into ai_budget_private.events(service,reservation,operation,state,charged) values(p_service,r.id,'reserve',r.state,r.charged);
  return jsonb_build_object('ok',true,'id',r.id,'state',r.state,'duplicate',false);
end $$;

create function public.ai_budget_transition(p_service text, p_id uuid, p_operation text,
  p_dispatch uuid, p_usage jsonb default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare s ai_budget_private.services%rowtype; r ai_budget_private.reservations%rowtype;
  input_count bigint; output_count bigint; actual numeric; exceeded boolean;
begin
  select * into s from ai_budget_private.services where id=p_service for update;
  if not found then return jsonb_build_object('ok',false,'code','budget_not_configured'); end if;
  select * into r from ai_budget_private.reservations where id=p_id and service=p_service for update;
  if not found then return jsonb_build_object('ok',false,'code','reservation_not_found'); end if;
  if p_operation='begin' then
    if s.halted then return jsonb_build_object('ok',false,'code','service_halted'); end if;
    if r.state<>'reserved' then return jsonb_build_object('ok',false,'code','reservation_already_used'); end if;
    if p_dispatch is null then return jsonb_build_object('ok',false,'code','dispatch_required'); end if;
    if r.deadline<=clock_timestamp() then
      update ai_budget_private.reservations set state='released',charged=0 where id=r.id;
      return jsonb_build_object('ok',false,'code','budget_deadline');
    end if;
    update ai_budget_private.reservations set state='sent',dispatch_token=p_dispatch where id=r.id;
  elsif p_operation='cancel' then
    if r.state='reserved' or (r.state='sent' and r.dispatch_token=p_dispatch) then
      update ai_budget_private.reservations set state='released',charged=0 where id=r.id;
    else return jsonb_build_object('ok',true,'state',r.state,'unchanged',true); end if;
  elsif p_operation='settle' then
    if r.state not in ('sent','uncertain','settled') then return jsonb_build_object('ok',false,'code','reservation_not_sent'); end if;
    if p_usage is null or p_usage='null'::jsonb then
      if r.input_tokens is not null then return jsonb_build_object('ok',true,'state',r.state,'unchanged',true); end if;
      update ai_budget_private.reservations set state='uncertain' where id=r.id;
    else
      if not(p_usage ?& array['provider','model','inputTokens','outputTokens'])
        or p_usage->>'provider' is distinct from r.provider or p_usage->>'model' is distinct from r.model
        or coalesce(p_usage->>'inputTokens','') !~ '^[0-9]{1,16}$' or coalesce(p_usage->>'outputTokens','') !~ '^[0-9]{1,16}$'
        then return jsonb_build_object('ok',false,'code','invalid_usage'); end if;
      input_count := (p_usage->>'inputTokens')::bigint; output_count := (p_usage->>'outputTokens')::bigint;
      if input_count>9007199254740991 or output_count>9007199254740991 then return jsonb_build_object('ok',false,'code','invalid_usage'); end if;
      if r.input_tokens is not null then
        if r.input_tokens=input_count and r.output_tokens=output_count then return jsonb_build_object('ok',true,'state',r.state,'unchanged',true); end if;
        insert into ai_budget_private.events(service,reservation,operation,state,charged) values(p_service,r.id,'settlement_conflict',r.state,r.charged);
        return jsonb_build_object('ok',false,'code','settlement_conflict');
      end if;
      actual := ceil((input_count::numeric*r.input_rate+output_count::numeric*r.output_rate)/1000000);
      if actual>9007199254740991 then
        update ai_budget_private.reservations set state='uncertain', charged=9007199254740991,
          input_tokens=input_count,output_tokens=output_count,actual_micro_usd=actual where id=r.id;
        update ai_budget_private.services set halted=true where id=p_service;
        insert into ai_budget_private.events(service,reservation,operation,state,charged) values(p_service,r.id,'cost_integer_overflow','uncertain',9007199254740991);
        return jsonb_build_object('ok',false,'code','cost_integer_overflow');
      end if;
      exceeded := input_count>r.input_bound or output_count>r.output_bound or actual>r.reserved;
      update ai_budget_private.reservations set state=case when exceeded then 'uncertain' else 'settled' end,
        charged=case when exceeded then greatest(actual,r.reserved) else actual end,
        input_tokens=input_count,output_tokens=output_count,actual_micro_usd=actual where id=r.id;
      if exceeded then update ai_budget_private.services set halted=true where id=p_service; end if;
    end if;
  else return jsonb_build_object('ok',false,'code','invalid_operation'); end if;
  select * into r from ai_budget_private.reservations where id=p_id;
  insert into ai_budget_private.events(service,reservation,operation,state,charged) values(p_service,r.id,p_operation,r.state,r.charged);
  return jsonb_build_object('ok',true,'id',r.id,'state',r.state,'charged',r.charged);
end $$;

create function public.ai_budget_lookup(p_service text,p_job text,p_attempt integer) returns jsonb
language sql security invoker set search_path = '' as $$
  select jsonb_build_object('id',id,'state',state,'charged',charged,'reserved',reserved,'period',period_id,
    'inputTokens',input_tokens,'outputTokens',output_tokens)
  from ai_budget_private.reservations where service=p_service and job=p_job and attempt=p_attempt;
$$;
revoke all on function public.ai_budget_reserve(text,text,text,text,integer,jsonb),
  public.ai_budget_transition(text,uuid,text,uuid,jsonb), public.ai_budget_lookup(text,text,integer)
  from public, anon, authenticated;
grant execute on function public.ai_budget_reserve(text,text,text,text,integer,jsonb),
  public.ai_budget_transition(text,uuid,text,uuid,jsonb), public.ai_budget_lookup(text,text,integer) to service_role;
