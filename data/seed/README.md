# Original seed

These are the files the app used before it moved to Supabase. They are
**not live** — nothing reads them at runtime. They exist so the database
can be rebuilt from scratch:

    node scripts/seed-supabase.mjs

Every write is an upsert keyed on the primary key, so it is safe to re-run.
`data/config.json` is different: it is still read at runtime, because the
wordmark, owner and FX rates are settings rather than data.
