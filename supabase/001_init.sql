-- Biblo schema.
--
-- Run this once in the Supabase SQL Editor:
--   Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- Row Level Security is on for every table with NO policies, which
-- means the publishable key can read nothing. That is deliberate:
-- the browser never talks to Supabase directly. Every read and write
-- goes through the Next.js server, which holds the secret key and
-- bypasses RLS. The app itself is gated by your passcode.

-- ---------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------
create table if not exists public.categories (
  id          text primary key,
  name        text        not null,
  icon        text        not null default 'Tag',
  "group"     text,
  matches     text[]      not null default '{}',
  kind        text        not null default 'spend'
                check (kind in ('spend', 'income')),
  sort        integer     not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- budgets: one row per month
-- ---------------------------------------------------------------
create table if not exists public.budgets (
  month       text primary key check (month ~ '^\d{4}-\d{2}$'),
  income      numeric(14,2) not null default 0,
  total       numeric(14,2) not null default 0,
  caps        jsonb         not null default '{}'::jsonb,
  updated_at  timestamptz   not null default now()
);

-- ---------------------------------------------------------------
-- expenses
-- ---------------------------------------------------------------
create table if not exists public.expenses (
  id           text primary key,
  spent_on     date          not null,
  spent_at     time,
  label        text          not null,
  amount       numeric(14,2) not null,
  currency     text          not null default 'NGN',
  amount_ngn   numeric(14,2) not null,
  category_id  text          not null references public.categories(id) on delete restrict,
  method       text          not null default 'unknown',
  note         text,
  -- how it arrived, whether the category was guessed, what needs a look
  entry        jsonb         not null default '{}'::jsonb,
  created_at   timestamptz   not null default now()
);

create index if not exists expenses_spent_on_idx  on public.expenses (spent_on desc);
create index if not exists expenses_category_idx  on public.expenses (category_id);
-- The "needs a look" filter, without scanning the table.
create index if not exists expenses_check_idx
  on public.expenses ((entry ->> 'check'))
  where entry ->> 'check' is not null;

-- ---------------------------------------------------------------
-- messages: the chat thread
-- ---------------------------------------------------------------
create table if not exists public.messages (
  id           text primary key,
  sent_at      timestamptz not null default now(),
  -- "from" is a reserved word in SQL, hence sender
  sender       text        not null check (sender in ('you', 'app', 'claude')),
  body         text,
  attachments  jsonb       not null default '[]'::jsonb,
  expense_id   text        references public.expenses(id) on delete set null,
  status       text        not null default 'done'
                 check (status in ('pending', 'done'))
);

create index if not exists messages_sent_at_idx on public.messages (sent_at);
-- What the worker polls for.
create index if not exists messages_pending_idx
  on public.messages (sent_at)
  where status = 'pending' and sender = 'you';

-- ---------------------------------------------------------------
-- lock everything down
-- ---------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.budgets    enable row level security;
alter table public.expenses   enable row level security;
alter table public.messages   enable row level security;

-- No policies on purpose. anon and authenticated get nothing; the
-- service role bypasses RLS and is only ever used server-side.
revoke all on public.categories from anon, authenticated;
revoke all on public.budgets    from anon, authenticated;
revoke all on public.expenses   from anon, authenticated;
revoke all on public.messages   from anon, authenticated;

-- ---------------------------------------------------------------
-- attachments bucket, private
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- keep-alive: free projects pause after 7 idle days, so a scheduled
-- ping writes here to keep the database looking busy.
-- ---------------------------------------------------------------
create table if not exists public.heartbeat (
  id         integer primary key default 1 check (id = 1),
  pinged_at  timestamptz not null default now()
);

insert into public.heartbeat (id) values (1) on conflict (id) do nothing;

alter table public.heartbeat enable row level security;
revoke all on public.heartbeat from anon, authenticated;
