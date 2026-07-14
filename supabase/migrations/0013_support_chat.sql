create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  guest_token_hash text not null unique,
  status text not null default 'open' check (status in ('open', 'closed')),
  last_message_preview text not null default '',
  unread_by_admin integer not null default 0 check (unread_by_admin >= 0),
  unread_by_customer integer not null default 0 check (unread_by_customer >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender text not null check (sender in ('customer', 'admin')),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists support_conversations_updated_at_idx
  on public.support_conversations(updated_at desc);

create index if not exists support_messages_conversation_created_idx
  on public.support_messages(conversation_id, created_at);

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;

comment on table public.support_conversations is
  'Private customer-to-admin support threads accessed only through server routes.';

comment on table public.support_messages is
  'Messages exchanged inside private support conversations.';
