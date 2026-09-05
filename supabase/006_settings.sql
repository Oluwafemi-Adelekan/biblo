-- Per-user preferences: hide income, show times, month start day,
-- app PIN hash, whether the tour has run. Applied live 5 Sept 2026.
alter table profiles add column if not exists settings jsonb not null default '{}'::jsonb;
