create table if not exists public.opportunity_preferences (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  guest_token_hash text not null,
  opportunity_key text not null,
  preference text not null check (preference in ('saved', 'excluded')),
  opportunity jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guest_token_hash, opportunity_key)
);

create index if not exists opportunity_preferences_owner_idx
  on public.opportunity_preferences(owner_id, updated_at desc);
create index if not exists opportunity_preferences_guest_idx
  on public.opportunity_preferences(guest_token_hash, updated_at desc);

drop trigger if exists opportunity_preferences_touch_updated_at
  on public.opportunity_preferences;
create trigger opportunity_preferences_touch_updated_at
before update on public.opportunity_preferences
for each row execute function public.touch_updated_at();

alter table public.opportunity_preferences enable row level security;
revoke all on table public.opportunity_preferences from public, anon, authenticated;
grant all on table public.opportunity_preferences to service_role;

comment on table public.opportunity_preferences is
  'Server-managed saved and excluded opportunity preferences for guests and accounts.';
