import type { Category } from "./schema";

/* ============================================================
   Reads a line you typed into an expense.

   This runs in the app, instantly, with no model involved. It is
   deliberately shallow: it finds an amount, matches a category on
   keywords, and gets out of the way. Anything it is unsure about
   is flagged rather than guessed at confidently, and Claude fixes
   those later.
   ============================================================ */

export type Parsed = {
  amount: number | null;
  categoryId: string | null;
  /** True when the category came from a keyword match, not certainty. */
  guessed: boolean;
  date: string;
  label: string;
  /** Set when a human should look. Shown in the app verbatim. */
  check?: string;
};

const AMOUNT =
  /(?:₦|NGN|N)?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|m)?\b/gi;

/** "5k" -> 5000, "1.5k" -> 1500, "2,000" -> 2000, "₦3500" -> 3500 */
export function readAmount(
  text: string,
): { value: number; match: string; found: number } | null {
  const found: { value: number; match: string }[] = [];
  for (const m of text.matchAll(AMOUNT)) {
    const raw = m[1].replace(/,/g, "");
    const num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) continue;
    const unit = (m[2] ?? "").toLowerCase();
    const mult = unit === "k" ? 1_000 : unit === "m" ? 1_000_000 : 1;
    // A bare 1 or 2 is almost always "1 bottle", not one naira. Anything
    // under 50 with no unit is treated as a quantity, not money.
    if (mult === 1 && num < 50 && !/[,.]/.test(m[1])) continue;
    found.push({ value: num * mult, match: m[0].trim() });
  }
  if (found.length === 0) return null;
  // The biggest figure in the line is the one being spent; smaller ones
  // are usually quantities or times. `found` carries how many there
  // were, because more than one usually means more than one expense.
  const distinct = new Set(found.map((f) => f.value)).size;
  return { ...found.sort((a, b) => b.value - a.value)[0], found: distinct };
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shift(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function readDate(text: string): { date: string; match?: string } {
  const t = text.toLowerCase();
  if (/\byesterday\b/.test(t)) return { date: shift(1), match: "yesterday" };
  if (/\bday before yesterday\b/.test(t)) return { date: shift(2), match: "day before yesterday" };
  if (/\blast night\b/.test(t)) return { date: shift(1), match: "last night" };
  if (/\btoday\b/.test(t)) return { date: today(), match: "today" };
  return { date: today() };
}

/** Longest keyword wins, so "car wash" beats "car". */
export function readCategory(text: string, categories: Category[]) {
  const t = " " + text.toLowerCase().replace(/\s+/g, " ") + " ";
  let best: { id: string; word: string } | null = null;
  for (const c of categories) {
    if (c.kind !== "spend") continue;
    for (const word of c.matches) {
      const w = word.toLowerCase();
      if (!t.includes(w)) continue;
      if (!best || w.length > best.word.length) best = { id: c.id, word: w };
    }
  }
  return best;
}

export function parseEntry(text: string, categories: Category[]): Parsed {
  const trimmed = text.trim();
  const amount = readAmount(trimmed);
  const when = readDate(trimmed);
  const cat = readCategory(trimmed, categories);

  // The label is the line with the money and the day-word taken out,
  // so "5k fuel yesterday" reads as "Fuel" in the list.
  let label = trimmed;
  if (amount) label = label.replace(amount.match, " ");
  if (when.match) label = label.replace(new RegExp(when.match, "i"), " ");

  // Currency words are noise wherever they appear. Filler verbs and
  // prepositions are stripped only from the front: removing them
  // mid-sentence turns "lunch at the place" into "lunch the place".
  label = label.replace(/\b(naira|ngn)\b/gi, " ").replace(/₦/g, " ");
  let prev = "";
  while (prev !== label) {
    prev = label;
    label = label
      .replace(/^\s*\b(on|for|at|spent|paid|bought|of|a|an|the)\b\s*/i, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  label = label ? label[0].toUpperCase() + label.slice(1) : "Unlabelled";
  // A label names the thing in a list; it is not a transcript. Long
  // dictation used to land whole paragraphs in the expense list.
  if (label.length > 60) label = label.slice(0, 57).trimEnd() + "...";

  /* Several amounts in one message almost always means several
     expenses, and picking the biggest would file one wrong row and
     throw the rest away. That is exactly what happened to a dictated
     message holding four. Hand the whole thing to Claude instead. */
  const many = (amount?.found ?? 0) > 1;

  const checks: string[] = [];
  if (!amount) checks.push("No amount found in what you typed.");
  else if (many) checks.push("More than one amount in that.");
  if (!cat) checks.push("Could not tell which category this belongs to.");

  return {
    amount: many ? null : (amount?.value ?? null),
    categoryId: cat?.id ?? null,
    guessed: Boolean(cat),
    date: when.date,
    label,
    check: checks.length ? checks.join(" ") : undefined,
  };
}
