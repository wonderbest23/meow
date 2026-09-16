-- Preserve owner-bound intake work while a guest account is being linked.
create or replace function public.claim_plan_state(
  p_guest_hash text, p_account_hash text, p_guest_at timestamptz,
  p_account_at timestamptz, p_data jsonb, p_title text, p_plan_type text
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_guest_at timestamptz; v_account_at timestamptz; v_guest jsonb; v_claim text;
begin
  if p_guest_hash = p_account_hash then return 'claimed'; end if;
  perform pg_advisory_xact_lock(hashtextextended('plan-state:' || least(p_guest_hash, p_account_hash), 0));
  perform pg_advisory_xact_lock(hashtextextended('plan-state:' || greatest(p_guest_hash, p_account_hash), 0));
  select account_hash into v_claim from public.plan_owner_claims where guest_hash = p_guest_hash;
  if v_claim is not null then
    return case when v_claim = p_account_hash then 'claimed' else 'consumed' end;
  end if;
  select updated_at, data into v_guest_at, v_guest from public.plan_states where owner_hash = p_guest_hash;
  select updated_at into v_account_at from public.plan_states where owner_hash = p_account_hash;
  if v_guest_at is distinct from p_guest_at or v_account_at is distinct from p_account_at then return 'conflict'; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(v_guest->'plans', '[]'::jsonb)) as plan
    where plan#>>'{answers,__coach_job,status}' in ('queued', 'running')
       or plan#>>'{answers,__deck_job,status}' in ('queued', 'running')
       or plan#>>'{answers,__business_intake,state,job,status}' in ('queued', 'running')
  ) then return 'busy'; end if;
  if v_guest_at is not null then
    insert into public.plan_states(owner_hash, title, plan_type, data, updated_at)
    values(p_account_hash, p_title, p_plan_type, p_data, greatest(clock_timestamp(), coalesce(v_account_at, '-infinity') + interval '1 microsecond'))
    on conflict(owner_hash) do update set title = excluded.title, plan_type = excluded.plan_type,
      data = excluded.data, updated_at = excluded.updated_at;
    delete from public.plan_states where owner_hash = p_guest_hash;
  end if;
  insert into public.plan_owner_claims(guest_hash, account_hash) values(p_guest_hash, p_account_hash);
  return 'claimed';
end;
$$;

revoke all on function public.claim_plan_state(text, text, timestamptz, timestamptz, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.claim_plan_state(text, text, timestamptz, timestamptz, jsonb, text, text) to service_role;
