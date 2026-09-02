-- Line items on an expense.
--
-- A receipt is one payment but several things bought, and the prices
-- of those things are worth watching over time. Kept as jsonb on the
-- expense rather than a separate table: they are always read with
-- their parent, never on their own, and a receipt's items have no
-- life of their own once it is filed.
--
-- Shape: [{ "name": "Chinese Rice", "qty": 2, "unit": 2100, "total": 4200 }]

alter table public.expenses
  add column if not exists items jsonb not null default '[]'::jsonb;

-- Makes "what did I last pay for rice" a lookup rather than a scan.
create index if not exists expenses_items_idx
  on public.expenses using gin (items);
