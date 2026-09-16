-- A durable outbox is created in the same transaction as the contact record.
create table if not exists public.landing_lead_notifications (
  lead_id uuid primary key references public.landing_leads(id) on delete cascade,
  site_id uuid not null references public.landing_sites(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','sent','retry','blocked','failed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz default now(),
  lease_token uuid,
  lease_until timestamptz,
  payload jsonb,
  first_attempt_at timestamptz,
  delivery_uncertain boolean not null default false,
  provider_id text,
  accepted_at timestamptz,
  error_code text check (error_code in ('missing_email_config','recipient_missing','provider_rejected','provider_unavailable','delivery_unknown','attempt_limit')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists landing_lead_notifications_due_idx
  on public.landing_lead_notifications(next_attempt_at) where status in ('pending','retry','processing');
alter table public.landing_lead_notifications enable row level security;
revoke all on public.landing_lead_notifications from public, anon, authenticated;
grant all on public.landing_lead_notifications to service_role;

create or replace function public.enqueue_landing_lead_notification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.landing_lead_notifications(lead_id, site_id) values(new.id, new.site_id)
    on conflict(lead_id) do nothing;
  return new;
end;
$$;
revoke all on function public.enqueue_landing_lead_notification() from public, anon, authenticated;
drop trigger if exists landing_lead_notify_insert on public.landing_leads;
create trigger landing_lead_notify_insert after insert on public.landing_leads
for each row execute function public.enqueue_landing_lead_notification();

-- Historical contacts are not silently emailed when this migration is installed.
create or replace function public.claim_landing_lead_notification(p_lead_id uuid, p_token uuid, p_force boolean default false)
returns setof public.landing_lead_notifications language plpgsql security definer set search_path = public as $$
begin
  update public.landing_lead_notifications set status = 'failed', error_code = 'delivery_unknown',
    lease_token = null, lease_until = null, next_attempt_at = null, updated_at = now()
    where lead_id = p_lead_id and status = 'processing' and attempts >= 5 and lease_until < now();
  return query update public.landing_lead_notifications
    set status = 'processing', lease_token = p_token, lease_until = now() + interval '90 seconds', next_attempt_at = now(), updated_at = now()
    where lead_id = p_lead_id and status <> 'sent' and attempts < 5
      and (lease_until is null or lease_until < now())
      and (status in ('pending','retry','processing') or (p_force and status = 'blocked'))
      and (p_force or coalesce(next_attempt_at, now()) <= now())
    returning *;
end;
$$;
revoke all on function public.claim_landing_lead_notification(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_landing_lead_notification(uuid, uuid, boolean) to service_role;
