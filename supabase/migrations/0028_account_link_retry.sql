-- Keep unfinished legacy migrations reachable after the consumed guest cookie rotates.
alter table public.plan_owner_claims
  add column if not exists legacy_completed_at timestamptz;

create index if not exists plan_owner_claims_pending_account_idx
  on public.plan_owner_claims(account_hash, claimed_at)
  where legacy_completed_at is null;

grant update (legacy_completed_at) on public.plan_owner_claims to service_role;
