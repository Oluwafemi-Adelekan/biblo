---
name: budget
description: Sort out Biblo's expenses. Use when Femi says "sort my expenses", "check my budget", asks about a receipt or file he sent in the chat, wants an expense recategorised or corrected, or asks what his spending looks like. Triggers on "sort my expenses", "what's waiting", "fix that entry", "what did I spend on", "/budget".
---

# Biblo

Femi sends expenses through a chat in the app, on his phone. Three readers,
in order: the app parses plain typed amounts instantly; an OpenAI model (the
"reader", an Azure deployment of his friend's) handles receipt photos and
messy dictations the moment they arrive; and you are the source of truth
over both. PDFs, spreadsheets, and anything the reader defers or gets wrong
come to you.

**Audit the reader every time you run.** `db.mjs ai` lists what it filed
(marked `entry.ai`). Check its work against the attachments like you would
your own: dates day-first, receipts itemised, categories sensible, no
duplicates, no invented figures. Fix mistakes with `db.mjs fix` and say so
in the thread. You can override anything it did.

**The data is in Supabase, not in files.** `data/seed/*.json` is the original
seed and is not live. Everything goes through one CLI, because the database
uses snake_case and calls `from` `sender`, which is easy to get wrong by hand:

```
npm run pending                     # everything waiting on you
node scripts/db.mjs ai 20           # audit what the reader filed
node scripts/db.mjs month 2026-09   # totals, caps, what is over
node scripts/db.mjs file <key> out.png
node scripts/db.mjs add '{"date":"2026-09-02","label":"Fuel","amount":5000,"categoryId":"transport"}'
node scripts/db.mjs items exp_0049 '[{"name":"Chinese Rice","qty":2,"unit":2100,"total":4200}]'
node scripts/db.mjs prices rice          # what it has cost over time
node scripts/db.mjs fix exp_0051 '{"categoryId":"dining","amount":12000}'
node scripts/db.mjs done msg_0003 exp_0051
node scripts/db.mjs reply msg_0003 "Filed 3 expenses from that receipt."
```

Read `lib/schema.ts` before your first write of a session. It is the contract.

## Clearing what is waiting

1. `npm run pending`. It lists pending messages, with attachment keys, plus
   any expense flagged as needing a look.
2. For each attachment, `node scripts/db.mjs file <key> <out>` to pull it
   down, then read it. Images: look at them. PDFs: read every page. CSVs and
   spreadsheets: parse every row, do not sample.
3. Pull out what it was, how much, what day. Match a category against the
   `matches` column in `categories`. One message can produce many expenses —
   a statement usually does.
4. `db.mjs add` for each expense.
5. **Line out every receipt that lists items.** `db.mjs items <id>` with
   one entry per line on the slip: `name`, `qty`, `unit`, `total`. This is
   not optional for an itemised receipt — Femi checks what individual
   things cost over time, and a lump total cannot answer that.
   - Copy the item names as printed. "ALFA KETCHUP 340G" stays
     "Alfa Ketchup 340g", not "ketchup": the size is part of the price.
   - `unit` is the price of one, `total` is what the receipt charged for
     the line. Where they disagree, the receipt wins.
   - The command warns if the lines do not reach the expense total.
     That is often correct — service charge, delivery, rounding — so
     read it rather than forcing the numbers to match.
   - The expense itself keeps the amount actually paid. Items explain
     it, they do not replace it.
6. `db.mjs done <msg_id> [expense_id]` to take it off the pending list.
7. **`db.mjs reply <msg_id> "..."`.** This is the only thing he sees. Say what
   you filed and anything you were unsure about, in a line or two. No preamble.
8. `npm run check` afterwards.

## Fixing flagged expenses

Rows with `entry.check` set are ones the app saved but was unsure about.
`db.mjs fix` corrects the row and clears the flag in one step. Leave
`entry.guessed` alone: it records how the row arrived, not whether it is
right now.

## Prices over time

`db.mjs prices <name>` searches every line item and shows what a thing
has cost each time it was bought, with the spread between cheapest and
dearest. Use it when he asks whether something has gone up, and when a
receipt makes you suspect it has.

## Reading amounts

- `5k` is 5,000. `1.5k` is 1,500. `2m` is 2,000,000.
- A bare number under 50 with no separator is a quantity, not money.
- Dates on Nigerian receipts are day-first. Never read `03/04` as March 4th.

## Rules that do not bend

- **Never invent an expense.** If asked to fill a gap or make a month look
  complete, say no. A made-up ledger is worse than an incomplete one.
- **Never change a figure Femi gave you** because it looks wrong. Flag it and ask.
- **Never delete a row to fix a total.** Correct the specific row.
- Sample rows have `entry.how = "sample"`. If asked to start clean, delete
  exactly those and say how many you removed.

## Changing the budget

He edits income and caps himself on the Budget screen, and adds categories
there too. Only touch `budgets` if he asks. `total` must equal the sum of
`caps`; `npm run check` fails if it drifts.

## When he asks how the month is going

`db.mjs month` gives you the arithmetic. Answer with it: which categories are
over and by how much, whether he is ahead of pace, what is driving it. No
encouragement, no scolding, no emoji. He can see the charts; tell him what the
charts do not say.
