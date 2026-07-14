alter table public.projects
  add column if not exists quality_audit jsonb;

create table if not exists public.legal_source_snapshots (
  source_id text primary key,
  fingerprint text,
  previous_fingerprint text,
  status text not null check (status in ('baseline', 'unchanged', 'changed', 'unavailable')),
  http_status integer,
  etag text,
  last_modified text,
  checked_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  error text,
  updated_at timestamptz not null default now()
);

alter table public.legal_source_snapshots enable row level security;

comment on table public.legal_source_snapshots is
  'Server-only official legal source fingerprints. Accessed with the service role.';

create index if not exists projects_quality_status_idx
  on public.projects ((quality_audit ->> 'status'));
