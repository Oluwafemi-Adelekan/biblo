import "server-only";
import { createClient } from "@supabase/supabase-js";
import type {
  Attachment,
  Budget,
  Category,
  Expense,
  LineItem,
  Message,
} from "./schema";

/* ============================================================
   Server-only Supabase access.

   Every table has RLS on with no policies, so the publishable key
   can read nothing at all. The browser never talks to Supabase;
   it talks to this app, and this app talks to Supabase with the
   secret key. A leaked publishable key is therefore worthless.

   Two keys, because they are not interchangeable on this project:
   PostgREST accepts the new sb_secret_ key, and Storage does not
   — it still wants the legacy service_role JWT.
   ============================================================ */

function required(name: string) {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is missing. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return v;
}

export const SUPABASE_URL = () => required("NEXT_PUBLIC_SUPABASE_URL");

/** Rows. Bypasses RLS; never expose this client to the browser. */
export const db = () =>
  createClient(SUPABASE_URL(), required("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** Files. Separate client because Storage rejects the sb_secret_ key. */
export const files = () =>
  createClient(SUPABASE_URL(), required("SUPABASE_SERVICE_ROLE_JWT"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export const BUCKET = "attachments";

/* --- row <-> app shape ----------------------------------------
   The database uses snake_case and avoids reserved words ("from"
   became "sender"), so the translation lives here rather than
   leaking those names into every component. */

type ExpenseRow = {
  id: string;
  spent_on: string;
  spent_at: string | null;
  label: string;
  amount: string | number;
  currency: string;
  amount_ngn: string | number;
  category_id: string;
  method: string;
  note: string | null;
  items: LineItem[] | null;
  entry: Expense["entry"];
};

const n = (v: string | number) => (typeof v === "number" ? v : Number(v));

export const toExpense = (r: ExpenseRow): Expense => ({
  id: r.id,
  date: r.spent_on,
  time: r.spent_at ? r.spent_at.slice(0, 5) : undefined,
  label: r.label,
  amount: n(r.amount),
  currency: r.currency as Expense["currency"],
  amountNGN: n(r.amount_ngn),
  categoryId: r.category_id,
  method: r.method as Expense["method"],
  note: r.note ?? undefined,
  items: r.items ?? [],
  entry: r.entry,
});

export const fromExpense = (e: Expense) => ({
  id: e.id,
  spent_on: e.date,
  spent_at: e.time ?? null,
  label: e.label,
  amount: e.amount,
  currency: e.currency,
  amount_ngn: e.amountNGN,
  category_id: e.categoryId,
  method: e.method,
  note: e.note ?? null,
  items: e.items ?? [],
  entry: e.entry,
});

type MessageRow = {
  id: string;
  sent_at: string;
  sender: Message["from"];
  body: string | null;
  attachments: Attachment[];
  expense_id: string | null;
  status: Message["status"];
};

export const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  at: r.sent_at,
  from: r.sender,
  text: r.body ?? undefined,
  attachments: r.attachments ?? [],
  expenseId: r.expense_id ?? undefined,
  status: r.status,
});

export const fromMessage = (m: Message) => ({
  id: m.id,
  sent_at: m.at,
  sender: m.from,
  body: m.text ?? null,
  attachments: m.attachments,
  expense_id: m.expenseId ?? null,
  status: m.status,
});

type CategoryRow = {
  id: string;
  name: string;
  icon: string;
  group: string | null;
  matches: string[];
  kind: Category["kind"];
  sort: number;
};

export const toCategory = (r: CategoryRow): Category => ({
  id: r.id,
  name: r.name,
  icon: r.icon,
  group: r.group ?? undefined,
  matches: r.matches ?? [],
  kind: r.kind,
});

export const fromCategory = (c: Category, sort: number) => ({
  id: c.id,
  name: c.name,
  icon: c.icon,
  group: c.group ?? null,
  matches: c.matches,
  kind: c.kind,
  sort,
});

type BudgetRow = {
  month: string;
  income: string | number;
  total: string | number;
  caps: Record<string, number>;
};

export const toBudget = (r: BudgetRow): Budget => ({
  month: r.month,
  income: n(r.income),
  total: n(r.total),
  caps: r.caps ?? {},
});
