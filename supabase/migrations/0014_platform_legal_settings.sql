create table if not exists public.platform_legal_settings (
  id text primary key check (id = 'primary'),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.platform_legal_settings enable row level security;

revoke all on table public.platform_legal_settings from public, anon, authenticated;
grant all on table public.platform_legal_settings to service_role;

comment on table public.platform_legal_settings is
  'Server-only seller identity, privacy, AI processing, terms and refund settings.';

create table if not exists public.account_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  policy_version text not null,
  terms_agreed boolean not null,
  privacy_agreed boolean not null,
  ai_notice_confirmed boolean not null,
  agreed_at timestamptz not null default now()
);

alter table public.account_consents enable row level security;
revoke all on table public.account_consents from public, anon, authenticated;
grant all on table public.account_consents to service_role;

comment on table public.account_consents is
  'Server-side evidence of required account terms, privacy and AI notice acceptance.';
