import type { Category, Expense } from "./schema";

/* ============================================================
   The whole history, added up by the app rather than the model.

   The assistant used to see only the newest sixty entries and the
   current month. Asked "since I started", it added up that window
   and presented it as everything. Asked "who have I given the most",
   it added a person's lines across three categories and dropped
   one. Both are arithmetic, and arithmetic is the app's job: these
   lines arrive with every total already worked out, and the model
   only has to read them out and explain them.

   Sample rows are not the person's money and never count.
   ============================================================ */

const n = (v: number) => Math.round(v).toLocaleString();

/* Who an entry is about, from how entries are labelled here:
   "Loan to Timmy", "Eniola's ride", "Treat for Hakeem", "Timmy loan
   repaid", "Gift for Damola and Dara". Mum and Dad have several
   spellings. A label that names nobody ("Meal for a friend", "Gift
   from my sisters") is left out of the per-person totals rather
   than guessed at; it still appears in the list. */
const ALIAS: Record<string, string> = { Mom: "Mum", Mother: "Mum", Father: "Dad" };
const NOT_NAMES = new Set(["Benin", "My", "A", "The", "Your", "His", "Her"]);

export function whoIn(e: Pick<Expense, "label" | "note">): string[] {
  const label = e.label;
  const found: string[] = [];
  const add = (w?: string) => {
    if (!w) return;
    const name = ALIAS[w] ?? w;
    if (!NOT_NAMES.has(name) && !found.includes(name)) found.push(name);
  };
  for (const m of label.matchAll(/\b(?:[Ff]or|[Tt]o|[Ff]rom)\s+([A-Z][a-z]+)(?:\s+and\s+([A-Z][a-z]+))?/g)) {
    add(m[1]);
    add(m[2]);
  }
  for (const m of label.matchAll(/\b([A-Z][a-z]+)'s\b/g)) add(m[1]);
  add(/^([A-Z][a-z]+)\s+(?:loan|older|repaid)\b/.exec(label)?.[1]);
  for (const m of label.matchAll(/,\s*([A-Z][a-z]+)\s+and\s+([A-Z][a-z]+)/g)) {
    add(m[1]);
    add(m[2]);
  }
  /* "Brother's passport" names a relation, not a person; the note
     carries who it was. */
  if (found.includes("Brother")) {
    const real = /^([A-Z][a-z]+)/.exec(e.note ?? "")?.[1];
    found.splice(found.indexOf("Brother"), 1, real ? `${real} (brother)` : "Brother");
  }
  return found;
}

export function historyLines(all: Expense[], categories: Category[]): string[] {
  const kindOf = new Map(categories.map((c) => [c.id, c.kind]));
  const nameOf = new Map(categories.map((c) => [c.id, c.name]));
  const real = all
    .filter((e) => e.entry.how !== "sample")
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!real.length) return [];

  const lines: string[] = [];
  lines.push(`first real record ${real[0].date}; ${real.length} entries in all`);

  const tot = { inc: 0, out: 0, sav: 0 };
  for (const mo of [...new Set(real.map((e) => e.date.slice(0, 7)))]) {
    const rows = real.filter((e) => e.date.startsWith(mo));
    const inc = rows.filter((e) => kindOf.get(e.categoryId) === "income").reduce((s, e) => s + e.amountNGN, 0);
    const out = rows.filter((e) => kindOf.get(e.categoryId) !== "income").reduce((s, e) => s - e.amountNGN, 0);
    const sav = rows.filter((e) => e.categoryId === "savings").reduce((s, e) => s - e.amountNGN, 0);
    tot.inc += inc;
    tot.out += out;
    tot.sav += sav;
    lines.push(`${mo}: income ${n(inc)}, spent ${n(out)} (of which moved to savings ${n(sav)}), left ${n(inc - out)}`);
    /* By category within the month, so "fuel in September" has an
       answer even after September has left the recent entries. */
    const cat = new Map<string, number>();
    for (const e of rows) {
      if (kindOf.get(e.categoryId) === "income") continue;
      cat.set(e.categoryId, (cat.get(e.categoryId) ?? 0) - e.amountNGN);
    }
    lines.push(
      `  ${mo} by category: ${[...cat]
        .sort((a, b) => b[1] - a[1])
        .map(([c, v]) => `${nameOf.get(c) ?? c} ${n(v)}`)
        .join(", ")}`,
    );
  }
  lines.push(`ALL TIME: income ${n(tot.inc)}, spent ${n(tot.out)} (of which moved to savings ${n(tot.sav)}), left ${n(tot.inc - tot.out)}`);

  const byCat = new Map<string, number>();
  for (const e of real) {
    if (kindOf.get(e.categoryId) === "income") continue;
    byCat.set(e.categoryId, (byCat.get(e.categoryId) ?? 0) - e.amountNGN);
  }
  lines.push(
    `ALL TIME by category: ${[...byCat]
      .sort((a, b) => b[1] - a[1])
      .map(([c, v]) => `${nameOf.get(c) ?? c} ${n(v)}`)
      .join(", ")}`,
  );

  /* Payers: income grouped by who paid - clients and employers, not
     friends paying back or small gifts, which are under people. The
     same payer gets written several ways ("TheUXProfessionals",
     "The UX Professionals"; "Identiko Solutions", "Identiko"), so
     they are matched on the first six letters with spaces and case
     ignored, and shown under the longest spelling. */
  const payers = new Map<string, { name: string; total: number }>();
  for (const e of real.filter((e) => kindOf.get(e.categoryId) === "income")) {
    if (/repaid|gift|extra from|^from\s/i.test(e.label)) continue;
    const name = e.label
      .replace(/^(Salary|Down payment for creating AI videos for|Payment from)\s*,?\s*/i, "")
      .replace(/\s+(payment|project balance|website)$/i, "")
      .replace(/'s$/, "")
      .trim();
    const key = name.toLowerCase().replace(/[^a-z]/g, "").slice(0, 6);
    const p = payers.get(key) ?? { name, total: 0 };
    if (name.length > p.name.length) p.name = name;
    p.total += e.amountNGN;
    payers.set(key, p);
  }
  lines.push(
    `INCOME BY PAYER, all time: ${[...payers.values()]
      .sort((a, b) => b.total - a.total)
      .map((p) => `${p.name} ${n(p.total)}`)
      .join(", ")}`,
  );

  /* People: what went to each person as gifts and family support,
     what is still lent out to them, and what came back from them.
     Two names on one entry share it. */
  type P = { gave: number; lent: number; back: number };
  const people = new Map<string, P>();
  const personal = real.filter((e) => ["giving", "family", "loans", "income"].includes(e.categoryId));
  for (const e of personal) {
    const who = whoIn(e);
    if (!who.length) continue;
    const share = e.amountNGN / who.length;
    for (const w of who) {
      const p = people.get(w) ?? { gave: 0, lent: 0, back: 0 };
      if (e.categoryId === "loans") p.lent -= share;
      else if (e.categoryId === "income") p.back += share;
      else p.gave -= share;
      people.set(w, p);
    }
  }
  const ranked = [...people]
    .map(([w, p]) => ({ w, ...p, net: p.gave + p.lent - p.back }))
    .filter((p) => p.gave + p.lent > 0)
    .sort((a, b) => b.net - a.net);
  lines.push(`PEOPLE TOTALS, all time, worked out by the app - quote these, do not re-add the entries:`);
  for (const p of ranked) {
    const parts = [`given ${n(p.gave)}`];
    if (Math.round(p.lent)) parts.push(`still lent out ${n(p.lent)}`);
    if (Math.round(p.back)) parts.push(`received from them ${n(p.back)}`);
    lines.push(`  ${p.w}: ${parts.join(", ")}; net to them ${n(p.net)}`);
  }

  lines.push(`PEOPLE ENTRIES, all time, for detail (positive is money in):`);
  for (const e of personal) {
    lines.push(
      `  ${e.date} [${nameOf.get(e.categoryId) ?? e.categoryId}] ${e.label}${e.note ? ` (${e.note.slice(0, 70)})` : ""}: ${e.amountNGN > 0 ? "+" : ""}${n(e.amountNGN)}`,
    );
  }
  return lines;
}
