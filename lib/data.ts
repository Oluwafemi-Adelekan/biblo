import { cache } from "react";
import { Budget, Category, Config, Expense, Message } from "./schema";
import { daysInMonth } from "./format";
import { db, toBudget, toCategory, toExpense, toMessage } from "./supabase";
import config from "../data/config.json";

/* READS. Everything comes from Supabase through the secret key, on
   the server. The browser never sees a database credential.

   config.json stays a file on purpose: the wordmark, the owner and
   the FX rates are settings, not data, and keeping them in the repo
   means the app boots the same way every time. */

function fail(what: string, error: { message: string }): never {
  throw new Error(`Could not read ${what} from Supabase: ${error.message}`);
}

export const getConfig = cache(async () => Config.parse(config));

export const getCategories = cache(async (): Promise<Category[]> => {
  const { data, error } = await db()
    .from("categories")
    .select("*")
    .order("sort", { ascending: true });
  if (error) fail("categories", error);
  return (data ?? []).map(toCategory);
});

export const getBudgets = cache(async (): Promise<Budget[]> => {
  const { data, error } = await db().from("budgets").select("*");
  if (error) fail("budgets", error);
  return (data ?? []).map(toBudget);
});

export const getExpenses = cache(async (): Promise<Expense[]> => {
  const { data, error } = await db()
    .from("expenses")
    .select("*")
    .order("spent_on", { ascending: false })
    .order("spent_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false });
  if (error) fail("expenses", error);
  return (data ?? []).map(toExpense);
});

export const getMessages = cache(async (): Promise<Message[]> => {
  const { data, error } = await db()
    .from("messages")
    .select("*")
    .order("sent_at", { ascending: true });
  if (error) fail("messages", error);
  return (data ?? []).map(toMessage);
});

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
  const activeMonth =
    month && /^\d{4}-\d{2}$/.test(month) ? month : cfg.activeMonth;
  const rows = all.filter((e) => e.date.startsWith(activeMonth));
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

  /* Day by day, zero-filled, plus a running total. The running total
     is what the pace chart plots against an even-spend reference. */
  const days = daysInMonth(activeMonth);
  let running = 0;
  const daily = Array.from({ length: days }, (_, i) => {
    const date = `${activeMonth}-${String(i + 1).padStart(2, "0")}`;
    const total = spendRows
      .filter((e) => e.date === date)
      .reduce((s, e) => s + Math.abs(e.amountNGN), 0);
    running += total;
    return { date, day: i + 1, total, running };
  });

  /* Only days that have happened count as elapsed. For a past month
     that is all of it; for the current one it is up to today. */
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const elapsed =
    activeMonth > thisMonth ? 0 : activeMonth < thisMonth ? days : now.getDate();

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

  const counts = new Map<string, number>();
  for (const e of expenses) {
    const m = e.date.slice(0, 7);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }

  const known = new Set<string>([
    ...counts.keys(),
    ...budgets.map((b) => b.month),
    cfg.activeMonth,
    ...(cfg.demoMonth ? [cfg.demoMonth] : []),
  ]);

  return {
    counts: Object.fromEntries(counts),
    hasBudget: new Set(budgets.map((b) => b.month)),
    known: [...known].sort(),
    activeMonth: cfg.activeMonth,
    demoMonth: cfg.demoMonth,
  };
});
