import { cache } from "react";
import { Budget, Category, Config, Expense, Message } from "./schema";
import { daysInMonth } from "./format";
import { db, toBudget, toCategory, toExpense, toMessage } from "./supabase";
import { ownerId, viewerId } from "./viewer";
import config from "../data/config.json";

import { getSettings } from "./settings";

/* Budget periods. A "month" is labelled by the calendar month its
   start day falls in, but where it begins is the user's choice:
   payday budgeting means the 28th through the 27th is one month.
   monthStart 1 collapses all of this into plain calendar months. */

const todayISO = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

const shiftMonth = (label: string, by: number) => {
  const [y, m] = label.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};

/** February has no 30th; a start day is clamped into the month. */
const clampStart = (label: string, startDay: number) =>
  Math.min(startDay, daysInMonth(label));

const dayStr = (label: string, d: number) =>
  `${label}-${String(d).padStart(2, "0")}`;

function periodOf(label: string, startDay: number) {
  const from = dayStr(label, clampStart(label, startDay));
  const next = shiftMonth(label, 1);
  const to = dayStr(next, clampStart(next, startDay));
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
  return { from, to, days };
}

/** Which period label a given date belongs to. */
function labelFor(date: string, startDay: number) {
  const label = date.slice(0, 7);
  return date >= dayStr(label, clampStart(label, startDay))
    ? label
    : shiftMonth(label, -1);
}

const addDays = (iso: string, n: number) =>
  new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);

/* READS. Everything comes from Supabase through the secret key, on
   the server. The browser never sees a database credential.

   config.json stays a file on purpose: the wordmark, the owner and
   the FX rates are settings, not data, and keeping them in the repo
   means the app boots the same way every time. */

function fail(what: string, error: { message: string }): never {
  throw new Error(`Could not read ${what} from Supabase: ${error.message}`);
}

/* One transient hiccup - a cold pooler, a dropped packet - was
   crashing whole pages, because a single failed read threw straight
   through the server component. Try again once before giving up;
   most of those failures are a moment, not a state. */
async function withRetry<T>(go: () => Promise<T>): Promise<T> {
  try {
    return await go();
  } catch {
    await new Promise((r) => setTimeout(r, 350));
    try {
      return await go();
    } catch {
      // A cold pooler can need more than one beat.
      await new Promise((r) => setTimeout(r, 900));
      return go();
    }
  }
}

export const getConfig = cache(async () => Config.parse(config));

export const getCategories = cache(async (): Promise<Category[]> =>
  withRetry(async () => {
    const { data, error } = await db()
      .from("categories")
      .select("*")
      .eq("user_id", await viewerId())
      .order("sort", { ascending: true });
    if (error) fail("categories", error);
    return (data ?? []).map(toCategory);
  }),
);

export const getBudgets = cache(async (): Promise<Budget[]> =>
  withRetry(async () => {
    const { data, error } = await db()
      .from("budgets")
      .select("*")
      .eq("user_id", await viewerId());
    if (error) fail("budgets", error);
    return (data ?? []).map(toBudget);
  }),
);

export const getExpenses = cache(async (): Promise<Expense[]> =>
  withRetry(async () => {
    const { data, error } = await db()
      .from("expenses")
      .select("*")
      .eq("user_id", await viewerId())
      .order("spent_on", { ascending: false })
      .order("spent_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false });
    if (error) fail("expenses", error);
    return (data ?? []).map(toExpense);
  }),
);

export const getMessages = cache(async (): Promise<Message[]> =>
  withRetry(async () => {
    const { data, error } = await db()
      .from("messages")
      .select("*")
      .eq("user_id", await viewerId())
      .order("sent_at", { ascending: true });
    if (error) fail("messages", error);
    return (data ?? []).map(toMessage);
  }),
);

/* --- derived -------------------------------------------------- */

export type Month = Awaited<ReturnType<typeof getMonth>>;

export const getMonth = cache(async (month?: string) => {
  const [cfg, categories, budgets, all, messages] = await Promise.all([
    getConfig(),
    getCategories(),
    getBudgets(),
    getExpenses(),
    getMessages(),
  ]);

  /* A month that is missing or malformed falls back rather than
     rendering a page full of NaN. */
  const { monthStart } = await getSettings();
  const activeMonth =
    month && /^\d{4}-\d{2}$/.test(month)
      ? month
      : labelFor(todayISO(), monthStart);
  const period = periodOf(activeMonth, monthStart);
  const rows = all.filter((e) => e.date >= period.from && e.date < period.to);
  const budget =
    budgets.find((b) => b.month === activeMonth) ??
    ({ month: activeMonth, income: 0, total: 0, caps: {} } satisfies Budget);

  const byId = new Map(categories.map((c) => [c.id, c]));
  const spendRows = rows.filter((e) => byId.get(e.categoryId)?.kind !== "income");
  const incomeRows = rows.filter((e) => byId.get(e.categoryId)?.kind === "income");

  const spent = spendRows.reduce((s, e) => s + Math.abs(e.amountNGN), 0);
  const earned = incomeRows.reduce((s, e) => s + Math.abs(e.amountNGN), 0);
  const left = budget.total - spent;

  const categoryRows = categories
    .filter((c) => c.kind === "spend")
    .map((c) => {
      const items = spendRows.filter((e) => e.categoryId === c.id);
      const total = items.reduce((s, e) => s + Math.abs(e.amountNGN), 0);
      const cap = budget.caps[c.id] ?? 0;
      return {
        category: c,
        total,
        cap,
        count: items.length,
        over: cap > 0 && total > cap,
        overBy: cap > 0 ? Math.max(total - cap, 0) : 0,
        leftInCap: cap > 0 ? Math.max(cap - total, 0) : 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  /* Day by day across the period, zero-filled, plus a running total.
     The running total is what the pace chart plots against an
     even-spend reference. */
  const days = period.days;
  let running = 0;
  const daily = Array.from({ length: days }, (_, i) => {
    const date = addDays(period.from, i);
    const total = spendRows
      .filter((e) => e.date === date)
      .reduce((s, e) => s + Math.abs(e.amountNGN), 0);
    running += total;
    return { date, day: i + 1, total, running };
  });

  /* Only days that have happened count as elapsed. For a past period
     that is all of it; for the current one it is up to today. */
  const today = todayISO();
  const elapsed =
    today < period.from
      ? 0
      : today >= period.to
        ? days
        : Math.round((Date.parse(today) - Date.parse(period.from)) / 86400000) + 1;

  const needsCheck = rows.filter((e) => e.entry.check);
  const pending = messages.filter((x) => x.from === "you" && x.status === "pending");

  return {
    config: cfg,
    month: activeMonth,
    isDemo: activeMonth === cfg.demoMonth,
    budget,
    categories,
    categoryById: byId,
    expenses: rows,
    spent,
    earned,
    left,
    over: spent > budget.total,
    overBy: Math.max(spent - budget.total, 0),
    pctUsed: budget.total > 0 ? spent / budget.total : 0,
    categoryRows,
    daily,
    days,
    elapsed,
    /* Where an even spender would be by now: the pace reference. */
    onPace: budget.total > 0 ? (budget.total / days) * elapsed : 0,
    needsCheck,
    pending,
  };
});

export const getExpense = cache(async (id: string) => {
  const [rows, categories] = await Promise.all([getExpenses(), getCategories()]);
  const expense = rows.find((e) => e.id === id);
  if (!expense) return null;
  return {
    expense,
    category: categories.find((c) => c.id === expense.categoryId) ?? null,
  };
});

/** Every month the app knows about, so the calendar can mark which
 *  ones actually have anything in them. */
export const getMonthIndex = cache(async () => {
  const [cfg, budgets, expenses] = await Promise.all([
    getConfig(),
    getBudgets(),
    getExpenses(),
  ]);

  const { monthStart } = await getSettings();
  const counts = new Map<string, number>();
  for (const e of expenses) {
    const m = labelFor(e.date, monthStart);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }

  /* The demo month is the owner's showpiece; a tenant's calendar
     should not advertise it. */
  const isOwner = (await viewerId()) === (await ownerId());
  const nowLabel = labelFor(todayISO(), monthStart);
  const known = new Set<string>([
    ...counts.keys(),
    ...budgets.map((b) => b.month),
    nowLabel,
    ...(isOwner && cfg.demoMonth ? [cfg.demoMonth] : []),
  ]);

  return {
    counts: Object.fromEntries(counts),
    hasBudget: new Set(budgets.map((b) => b.month)),
    known: [...known].sort(),
    activeMonth: nowLabel,
    demoMonth: isOwner ? cfg.demoMonth : undefined,
  };
});
