#!/usr/bin/env node
/* The command line onto Biblo's data, for Claude to use.

   Reading and writing rows by hand through curl is easy to get
   subtly wrong (the DB uses snake_case and calls "from" "sender"),
   so every operation Claude needs is a subcommand here instead.

     node scripts/db.mjs pending
     node scripts/db.mjs add '{"date":"2026-09-02","label":"Fuel","amount":5000,"categoryId":"transport"}'
     node scripts/db.mjs reply msg_0003 "Filed 3 expenses from that receipt."
     node scripts/db.mjs done msg_0003 exp_0051
     node scripts/db.mjs fix exp_0051 '{"categoryId":"dining","label":"Lunch"}'
     node scripts/db.mjs month 2026-09
*/
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
const storage = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_JWT,
  { auth: { persistSession: false } },
);

const die = (m) => {
  console.error(m);
  process.exit(1);
};

async function nextId(table, prefix) {
  const { data } = await db
    .from(table)
    .select("id")
    .order("id", { ascending: false })
    .limit(1);
  const n = data?.[0]?.id ? Number(data[0].id.split("_")[1]) : 0;
  return `${prefix}_${String((Number.isFinite(n) ? n : 0) + 1).padStart(4, "0")}`;
}

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  /* Everything waiting on Claude, in one place. */
  case "pending": {
    const { data: msgs } = await db
      .from("messages")
      .select("*")
      .eq("status", "pending")
      .eq("sender", "you")
      .order("sent_at");

    const { data: flagged } = await db
      .from("expenses")
      .select("*")
      .not("entry->>check", "is", null);

    console.log(`MESSAGES WAITING (${msgs?.length ?? 0})`);
    for (const m of msgs ?? []) {
      console.log(`  ${m.id}  ${m.sent_at.slice(0, 16).replace("T", " ")}`);
      if (m.body) console.log(`     text: ${m.body}`);
      for (const a of m.attachments ?? []) {
        // The url is /api/file/<key>; the key is what storage knows.
        const key = String(a.url).replace("/api/file/", "");
        console.log(`     file: ${a.name} (${a.type}, ${a.size} bytes) key=${key}`);
      }
    }

    console.log(`\nEXPENSES FLAGGED (${flagged?.length ?? 0})`);
    for (const e of flagged ?? [])
      console.log(`  ${e.id}  ${e.spent_on}  ${e.label}  ${e.amount_ngn}  ${e.entry.check}`);

    if ((msgs?.length ?? 0) + (flagged?.length ?? 0) === 0) console.log("\nNothing waiting.");
    break;
  }

  /* Pull an attachment down so it can be read. */
  case "file": {
    const [key, out] = args;
    if (!key) die("usage: db.mjs file <key> [outpath]");
    const { data, error } = await storage.storage.from("attachments").download(key);
    if (error) die(`could not download ${key}: ${error.message}`);
    const path = out ?? key;
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path, Buffer.from(await data.arrayBuffer()));
    console.log(`saved ${path}`);
    break;
  }

  case "add": {
    const input = JSON.parse(args[0] ?? die("usage: db.mjs add '<json>'"));
    for (const f of ["date", "label", "amount", "categoryId"])
      if (input[f] === undefined) die(`missing "${f}"`);

    const row = {
      id: await nextId("expenses", "exp"),
      spent_on: input.date,
      spent_at: input.time ?? null,
      label: input.label,
      amount: -Math.abs(input.amount),
      currency: input.currency ?? "NGN",
      amount_ngn: -Math.abs(input.amountNGN ?? input.amount),
      category_id: input.categoryId,
      method: input.method ?? "unknown",
      note: input.note ?? null,
      entry: {
        how: input.how ?? "photo",
        raw: input.raw,
        at: new Date().toISOString(),
        guessed: false,
        ...(input.check ? { check: input.check } : {}),
      },
    };
    const { error } = await db.from("expenses").insert(row);
    if (error) die(error.message);
    console.log(`added ${row.id}  ${row.label}  ${row.amount_ngn}  ${row.category_id}`);
    break;
  }

  case "reply": {
    const [id, ...rest] = args;
    const text = rest.join(" ");
    if (!text) die('usage: db.mjs reply <msg_id|-> "text"');
    const row = {
      id: await nextId("messages", "msg"),
      sent_at: new Date().toISOString(),
      sender: "claude",
      body: text,
      attachments: [],
      expense_id: null,
      status: "done",
    };
    const { error } = await db.from("messages").insert(row);
    if (error) die(error.message);
    console.log(`replied as ${row.id}${id && id !== "-" ? ` (re ${id})` : ""}`);
    break;
  }

  case "done": {
    const [msgId, expenseId] = args;
    if (!msgId) die("usage: db.mjs done <msg_id> [expense_id]");
    const patch = { status: "done" };
    if (expenseId) patch.expense_id = expenseId;
    const { error } = await db.from("messages").update(patch).eq("id", msgId);
    if (error) die(error.message);
    console.log(`${msgId} marked done`);
    break;
  }

  /* Correct a row and clear its check flag. */
  case "fix": {
    const [id, json] = args;
    if (!id || !json) die("usage: db.mjs fix <exp_id> '<json>'");
    const patch = JSON.parse(json);

    const { data: current, error: readErr } = await db
      .from("expenses").select("*").eq("id", id).single();
    if (readErr) die(readErr.message);

    const row = {};
    if (patch.label) row.label = patch.label;
    if (patch.categoryId) row.category_id = patch.categoryId;
    if (patch.date) row.spent_on = patch.date;
    if (patch.time !== undefined) row.spent_at = patch.time;
    if (patch.note !== undefined) row.note = patch.note;
    if (patch.amount !== undefined) {
      row.amount = -Math.abs(patch.amount);
      row.amount_ngn = -Math.abs(patch.amount);
    }
    // Correcting a row is what clears "needs a look".
    const entry = { ...current.entry };
    delete entry.check;
    row.entry = entry;

    const { error } = await db.from("expenses").update(row).eq("id", id);
    if (error) die(error.message);
    console.log(`${id} corrected, check cleared`);
    break;
  }

  case "month": {
    const month = args[0] ?? new Date().toISOString().slice(0, 7);
    // spent_on is a date column, so LIKE does not apply; bound it.
    const [yy, mm] = month.split("-").map(Number);
    const from = `${month}-01`;
    const to = `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}-01`;
    const { data: rows } = await db
      .from("expenses").select("*").gte("spent_on", from).lt("spent_on", to);
    const { data: b } = await db
      .from("budgets").select("*").eq("month", month).maybeSingle();
    const { data: cats } = await db.from("categories").select("*");

    const kind = Object.fromEntries((cats ?? []).map((c) => [c.id, c.kind]));
    const name = Object.fromEntries((cats ?? []).map((c) => [c.id, c.name]));
    const spend = (rows ?? []).filter((r) => kind[r.category_id] !== "income");
    const total = spend.reduce((a, r) => a + Math.abs(Number(r.amount_ngn)), 0);

    const by = {};
    for (const r of spend)
      by[r.category_id] = (by[r.category_id] ?? 0) + Math.abs(Number(r.amount_ngn));

    console.log(`${month}: ${spend.length} expenses, ${total.toLocaleString()} spent`);
    if (b) {
      const diff = total - Number(b.total);
      console.log(
        `budget ${Number(b.total).toLocaleString()}, income ${Number(b.income).toLocaleString()}, ` +
          `${diff > 0 ? `OVER by ${diff.toLocaleString()}` : `${(-diff).toLocaleString()} left`}`,
      );
      console.log("");
      for (const [id, v] of Object.entries(by).sort((a, c) => c[1] - a[1])) {
        const cap = b.caps[id] ?? 0;
        const over = cap > 0 && v > cap;
        console.log(
          `  ${(name[id] ?? id).padEnd(26)} ${String(v).padStart(9)}` +
            (cap ? ` / ${String(cap).padStart(8)}${over ? "  OVER" : ""}` : "  (no cap)"),
        );
      }
    }
    break;
  }

  default:
    console.log(readFileSync(new URL(import.meta.url)).toString().split("*/")[0]);
}
