/* Pushes the local JSON into Supabase, once. Safe to re-run: every
   write is an upsert keyed on the primary key. */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const read = (f) =>
  JSON.parse(readFileSync(new URL(`../data/seed/${f}`, import.meta.url), "utf8"));

const categories = read("categories.json");
const budgets = read("budgets.json");
const expenses = read("expenses.json");
const messages = read("messages.json");

async function push(label, table, rows) {
  if (rows.length === 0) return console.log(`${label.padEnd(11)} nothing to send`);
  const { error } = await db.from(table).upsert(rows);
  if (error) {
    console.error(`${label.padEnd(11)} FAILED: ${error.message}`);
    process.exitCode = 1;
  } else {
    console.log(`${label.padEnd(11)} ${rows.length} rows`);
  }
}

// Categories first: expenses reference them.
await push(
  "categories",
  "categories",
  categories.map((c, i) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    group: c.group ?? null,
    matches: c.matches ?? [],
    kind: c.kind ?? "spend",
    sort: i,
  })),
);

await push(
  "budgets",
  "budgets",
  budgets.map((b) => ({
    month: b.month,
    income: b.income,
    total: b.total,
    caps: b.caps,
  })),
);

await push(
  "expenses",
  "expenses",
  expenses.map((e) => ({
    id: e.id,
    spent_on: e.date,
    spent_at: e.time ?? null,
    label: e.label,
    amount: e.amount,
    currency: e.currency ?? "NGN",
    amount_ngn: e.amountNGN,
    category_id: e.categoryId,
    method: e.method ?? "unknown",
    note: e.note ?? null,
    entry: e.entry,
  })),
);

await push(
  "messages",
  "messages",
  messages.map((m) => ({
    id: m.id,
    sent_at: m.at,
    sender: m.from,
    body: m.text ?? null,
    attachments: m.attachments ?? [],
    expense_id: m.expenseId ?? null,
    status: m.status ?? "done",
  })),
);

for (const [label, table] of [
  ["categories", "categories"],
  ["budgets", "budgets"],
  ["expenses", "expenses"],
  ["messages", "messages"],
]) {
  const { count } = await db.from(table).select("*", { count: "exact", head: true });
  console.log(`  in supabase: ${label.padEnd(11)} ${count}`);
}
