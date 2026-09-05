-- Biblo goes multi-user. The server stays the only door (service key,
-- RLS on with no policies), and every row learns whose it is.
--
-- Existing single-user data is stamped with the zero sentinel and is
-- claimed by the owner's real auth id the first time they sign in.

-- The old FK tied expenses to a globally-unique category id; with
-- per-user categories that uniqueness is gone, and the app joins by
-- hand anyway.
alter table expenses drop constraint if exists expenses_category_id_fkey;

create table if not exists profiles (
  id uuid primary key,
  email text unique not null,
  owner boolean not null default false,
  created_at timestamptz not null default now()
);

alter table expenses
  add column if not exists user_id uuid not null
  default '00000000-0000-0000-0000-000000000000';
create index if not exists expenses_user on expenses (user_id, spent_on);

alter table messages
  add column if not exists user_id uuid not null
  default '00000000-0000-0000-0000-000000000000';
create index if not exists messages_user on messages (user_id, sent_at);

alter table categories
  add column if not exists user_id uuid not null
  default '00000000-0000-0000-0000-000000000000';
alter table categories drop constraint if exists categories_pkey;
alter table categories add primary key (user_id, id);

alter table budgets
  add column if not exists user_id uuid not null
  default '00000000-0000-0000-0000-000000000000';
alter table budgets drop constraint if exists budgets_pkey;
alter table budgets add primary key (user_id, month);
