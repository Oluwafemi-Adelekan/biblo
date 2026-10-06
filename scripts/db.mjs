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
     node scripts/db.mjs items exp_0049 '[{"name":"Chinese Rice","qty":2,"unit":2100,"total":4200}]'
     node scripts/db.mjs prices rice
     node scripts/db.mjs ai 20             # audit what the reader filed
     node scripts/db.mjs redate 2026-09-01 exp_0053 exp_0054
     node scripts/db.mjs month 2026-09
     node scripts/db.mjs share doc.json "Benin, what everyone owes"
     node scripts/db.mjs shares            # links already out there
     node scripts/db.mjs unshare <token>   # stop one working
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

/* Biblo is multi-user now. This CLI reads and writes the OWNER's rows
   only - other people's books are not its business. Before the owner
   first signs in, their rows still carry the zero sentinel. */
const ZERO = "00000000-0000-0000-0000-000000000000";
const UID = await (async () => {
  const { data } = await db
    .from("profiles")
    .select("id")
    .eq("owner", true)
    .limit(1)
    .maybeSingle();
  return data?.id ?? ZERO;
})();

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
      .eq("user_id", UID)
      .eq("status", "pending")
      .eq("sender", "you")
      .order("sent_at");

    const { data: flagged } = await db
      .from("expenses")
      .select("*")
      .eq("user_id", UID)
      .not("entry->>check", "is", null);

    console.log(`MESSAGES WAITING (${msgs?.length ?? 0})`);
    for (const m of msgs ?? []) {
      console.log(`  ${m.id}  ${m.sent_at.slice(0, 16).replace("T", " ")}`);
      if (m.body) console.log(`     text: ${m.body}`);
      for (const a of (m.attachments ?? []).filter((x) => x.type !== "application/x-biblo-meta")) {
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

    /* The sign follows the category, not the caller. Money coming in
       is positive; everything else is an outflow. Forcing it negative
       here made it impossible to record a salary. */
    const { data: cat } = await db
      .from("categories").select("kind").eq("user_id", UID).eq("id", input.categoryId).maybeSingle();
    if (!cat) die(`no such category: ${input.categoryId}`);
    /* Money coming BACK into a spend category (a loan repaid, a
       refund) is positive there: it nets off the outgoing instead of
       pretending to be income. */
    const sign = cat.kind === "income" || input.refund ? 1 : -1;

    const row = {
      id: await nextId("expenses", "exp"),
      spent_on: input.date,
      spent_at: input.time ?? null,
      label: input.label,
      amount: sign * Math.abs(input.amount),
      currency: input.currency ?? "NGN",
      amount_ngn: sign * Math.abs(input.amountNGN ?? input.amount),
      category_id: input.categoryId,
      method: input.method ?? "unknown",
      note: input.note ?? null,
      // Receipts get lined out so prices can be compared later.
      items: Array.isArray(input.items) ? input.items : [],
      entry: {
        how: input.how ?? "photo",
        raw: input.raw,
        at: new Date().toISOString(),
        guessed: false,
        ...(input.check ? { check: input.check } : {}),
      },
    };
    const { error } = await db.from("expenses").insert({ ...row, user_id: UID });
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
    const { error } = await db.from("messages").insert({ ...row, user_id: UID });
    if (error) die(error.message);
    console.log(`replied as ${row.id}${id && id !== "-" ? ` (re ${id})` : ""}`);
    break;
  }

  case "done": {
    const [msgId, expenseId] = args;
    if (!msgId) die("usage: db.mjs done <msg_id> [expense_id]");
    const patch = { status: "done" };
    if (expenseId) patch.expense_id = expenseId;
    const { error } = await db.from("messages").update(patch).eq("user_id", UID).eq("id", msgId);
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
      .from("expenses").select("*").eq("user_id", UID).eq("id", id).single();
    if (readErr) die(readErr.message);

    const row = {};
    if (patch.label) row.label = patch.label;
    if (patch.categoryId) row.category_id = patch.categoryId;
    if (patch.date) row.spent_on = patch.date;
    if (patch.time !== undefined) row.spent_at = patch.time;
    if (patch.note !== undefined) row.note = patch.note;
    if (patch.amount !== undefined) {
      // Keep the direction the row already had.
      const dir = Number(current.amount_ngn) >= 0 ? 1 : -1;
      row.amount = dir * Math.abs(patch.amount);
      row.amount_ngn = dir * Math.abs(patch.amount);
    }
    // Correcting a row is what clears "needs a look".
    const entry = { ...current.entry };
    delete entry.check;
    row.entry = entry;

    const { error } = await db.from("expenses").update(row).eq("user_id", UID).eq("id", id);
    if (error) die(error.message);
    console.log(`${id} corrected, check cleared`);
    break;
  }

  /* Move rows to another day without touching anything else. `fix`
     clears the needs-a-look flag by design; this does not, because a
     wrong date says nothing about whether the rest was right. */
  case "redate": {
    const [to, ...ids] = args;
    if (!to || ids.length === 0) die("usage: db.mjs redate <YYYY-MM-DD> <id> [id...]");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) die(`not a date: ${to}`);
    const { error } = await db.from("expenses").update({ spent_on: to }).eq("user_id", UID).in("id", ids);
    if (error) die(error.message);
    console.log(`moved ${ids.length} row(s) to ${to}: ${ids.join(", ")}`);
    break;
  }

  /* Attach or replace a receipt's line items. */
  case "items": {
    const [id, json] = args;
    if (!id || !json) die(`usage: db.mjs items <exp_id> '[{"name":"Rice","qty":2,"unit":2100,"total":4200}]'`);
    const items = JSON.parse(json);
    if (!Array.isArray(items)) die("items must be an array");
    for (const it of items) {
      for (const f of ["name", "unit", "total"])
        if (it[f] === undefined) die(`each item needs "${f}"`);
      if (it.qty === undefined) it.qty = 1;
    }

    const { data: row, error: readErr } = await db
      .from("expenses").select("amount_ngn").eq("user_id", UID).eq("id", id).single();
    if (readErr) die(readErr.message);

    const sum = items.reduce((a, i) => a + Number(i.total), 0);
    const total = Math.abs(Number(row.amount_ngn));
    // Not fatal: service charges and rounding are real. Just say so.
    if (Math.abs(sum - total) > 0.5)
      console.log(`note: items sum to ${sum.toLocaleString()}, the expense is ${total.toLocaleString()}`);

    const { error } = await db.from("expenses").update({ items }).eq("user_id", UID).eq("id", id);
    if (error) die(error.message);
    console.log(`${id}: ${items.length} item(s) attached`);
    break;
  }

  /* What has this thing cost over time. */
  case "prices": {
    const q = (args[0] ?? "").toLowerCase();
    if (!q) die("usage: db.mjs prices <part of an item name>");
    const { data } = await db
      .from("expenses").select("*").eq("user_id", UID).neq("items", "[]").order("spent_on");

    const hits = [];
    for (const e of data ?? [])
      for (const it of e.items ?? [])
        if (String(it.name).toLowerCase().includes(q))
          hits.push({ date: e.spent_on, where: e.label, ...it });

    if (hits.length === 0) {
      console.log(`nothing matching "${q}"`);
      break;
    }
    console.log(`"${q}" - ${hits.length} time(s)
`);
    for (const h of hits)
      console.log(
        `  ${h.date}  ${String(h.name).slice(0, 28).padEnd(30)} ` +
          `${String(h.qty).padStart(3)} x ${String(h.unit).padStart(9)} = ${String(h.total).padStart(9)}   ${h.where}`,
      );
    const units = hits.map((h) => Number(h.unit));
    const lo = Math.min(...units), hi = Math.max(...units);
    if (hi !== lo)
      console.log(`
  unit price ${lo.toLocaleString()} to ${hi.toLocaleString()}, ${(((hi - lo) / lo) * 100).toFixed(0)}% apart`);
    break;
  }

  /* What the reader has filed lately, for auditing. */
  case "ai": {
    const limit = Number(args[0] ?? 20);
    const { data } = await db
      .from("expenses")
      .select("*")
      .eq("user_id", UID)
      .or("entry->>ai.eq.true,entry->>aiEdited.eq.true")
      .order("id", { ascending: false })
      .limit(limit);
    if (!data?.length) {
      console.log("the assistant has not touched anything yet");
      break;
    }
    console.log(`last ${data.length} the assistant filed or edited:`);
    for (const e of data)
      console.log(
        `  ${e.id}  ${e.entry?.ai ? "filed " : "edited"}  ${e.spent_on}  ` +
          `${String(e.amount_ngn).padStart(9)}  ${e.category_id.padEnd(14)} ${e.label}` +
          ((e.items?.length ?? 0) > 0 ? `  (${e.items.length} items)` : ""),
      );
    break;
  }

  case "month": {
    const month = args[0] ?? new Date().toISOString().slice(0, 7);
    // spent_on is a date column, so LIKE does not apply; bound it.
    const [yy, mm] = month.split("-").map(Number);
    const from = `${month}-01`;
    const to = `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}-01`;
    const { data: rows } = await db
      .from("expenses").select("*").eq("user_id", UID).gte("spent_on", from).lt("spent_on", to);
    const { data: b } = await db
      .from("budgets").select("*").eq("user_id", UID).eq("month", month).maybeSingle();
    const { data: cats } = await db.from("categories").select("*").eq("user_id", UID);

    const kind = Object.fromEntries((cats ?? []).map((c) => [c.id, c.kind]));
    const name = Object.fromEntries((cats ?? []).map((c) => [c.id, c.name]));
    const spend = (rows ?? []).filter((r) => kind[r.category_id] !== "income");
    /* Signed, like the app: a refund or repayment sits in its spend
       category as a positive row and subtracts from that category. */
    const total = spend.reduce((a, r) => a - Number(r.amount_ngn), 0);

    const by = {};
    for (const r of spend)
      by[r.category_id] = (by[r.category_id] ?? 0) - Number(r.amount_ngn);

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

  /* Who has signed up, newest first - Femi's growth check. */
  case "users": {
    const { data, error } = await db
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) die(error.message);
    console.log(`${data?.length ?? 0} account(s)`);
    for (const p of data ?? [])
      console.log(
        `  ${p.created_at.slice(0, 10)}  ${p.owner ? "OWNER " : "      "} ${p.email}`,
      );
    break;
  }

  /* Publish a page anyone with the link can read, and list or
     revoke the ones already out there. The document is a JSON file
     in the shape lib/share describes; it is copied into storage as
     a snapshot and never re-read from the books. */
  case "share": {
    const [file, ...rest] = args;
    if (!file) die('usage: db.mjs share <doc.json> "Title" ["note"]');
    const [title, note] = rest;
    if (!title) die("Give the page a title.");

    const doc = JSON.parse(readFileSync(file, "utf8"));
    if (doc.kind !== "ledger" && doc.kind !== "period") {
      die(`Unknown document kind: ${doc.kind}`);
    }

    const { data: owner, error: oerr } = await db
      .from("profiles")
      .select("id, email, settings")
      .eq("owner", true)
      .limit(1)
      .maybeSingle();
    if (oerr) die(oerr.message);
    if (!owner) die("No owner profile.");

    const ALPHA =
      "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const token = Array.from(
      crypto.getRandomValues(new Uint8Array(22)),
      (b) => ALPHA[b % ALPHA.length],
    ).join("");

    const payload = {
      v: 1,
      token,
      owner: owner.id,
      by: owner.settings?.name || owner.email?.split("@")[0] || "Biblo",
      title,
      note: note || undefined,
      createdAt: new Date().toISOString(),
      doc,
    };

    const { error: uerr } = await storage.storage
      .from("attachments")
      .upload(`share--${token}.json`, JSON.stringify(payload), {
        contentType: "application/json",
        upsert: true,
      });
    if (uerr) die(uerr.message);

    const index = [
      { token, title, kind: doc.kind, createdAt: payload.createdAt },
      ...(owner.settings?.shares ?? []),
    ].slice(0, 50);
    const { error: serr } = await db
      .from("profiles")
      .update({ settings: { ...owner.settings, shares: index } })
      .eq("id", owner.id);
    if (serr) die(serr.message);

    console.log(`https://biblo-eight.vercel.app/s/${token}`);
    break;
  }

  /* Replace what a link already published, keeping the link itself
     working. The people holding it see the corrected page. */
  case "reshare": {
    const [token, file] = args;
    if (!token || !file) die("usage: db.mjs reshare <token> <doc.json>");

    const { data: blob } = await storage.storage
      .from("attachments")
      .download(`share--${token}.json`);
    if (!blob) die("No such page.");
    const payload = JSON.parse(await blob.text());

    const doc = JSON.parse(readFileSync(file, "utf8"));
    if (doc.kind !== payload.doc.kind) {
      die(`That page is a ${payload.doc.kind}; the file is a ${doc.kind}.`);
    }

    const { error } = await storage.storage
      .from("attachments")
      .upload(
        `share--${token}.json`,
        JSON.stringify({ ...payload, doc, updatedAt: new Date().toISOString() }),
        { contentType: "application/json", upsert: true },
      );
    if (error) die(error.message);
    console.log(`https://biblo-eight.vercel.app/s/${token} updated`);
    break;
  }

  case "shares": {
    const { data } = await db
      .from("profiles")
      .select("settings")
      .eq("owner", true)
      .limit(1)
      .maybeSingle();
    const list = data?.settings?.shares ?? [];
    console.log(`${list.length} shared page(s)`);
    for (const s of list)
      console.log(
        `  ${s.createdAt.slice(0, 10)}  ${s.revoked ? "REVOKED" : "live   "}  ${s.token}  ${s.title}`,
      );
    break;
  }

  case "unshare": {
    const [token] = args;
    if (!token) die("usage: db.mjs unshare <token>");

    const { data: blob } = await storage.storage
      .from("attachments")
      .download(`share--${token}.json`);
    if (!blob) die("No such page.");
    const payload = JSON.parse(await blob.text());

    const { error } = await storage.storage
      .from("attachments")
      .upload(
        `share--${token}.json`,
        JSON.stringify({ ...payload, revoked: true }),
        { contentType: "application/json", upsert: true },
      );
    if (error) die(error.message);

    const { data: owner } = await db
      .from("profiles")
      .select("id, settings")
      .eq("id", payload.owner)
      .maybeSingle();
    if (owner) {
      await db
        .from("profiles")
        .update({
          settings: {
            ...owner.settings,
            shares: (owner.settings?.shares ?? []).map((s) =>
              s.token === token ? { ...s, revoked: true } : s,
            ),
          },
        })
        .eq("id", owner.id);
    }
    console.log(`${token} is no longer readable.`);
    break;
  }

  default:
    console.log(readFileSync(new URL(import.meta.url)).toString().split("*/")[0]);
}
