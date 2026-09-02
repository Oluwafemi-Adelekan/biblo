-- Approval flow: an assistant message can carry structured state
-- (the question's proposal and where it landed) without new tables.
alter table messages add column if not exists meta jsonb;
