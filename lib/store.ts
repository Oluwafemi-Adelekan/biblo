import "server-only";
import {
  BUCKET,
  db,
  files,
  fromExpense,
  fromMessage,
  META_TYPE,
  metaEntry,
  toExpense,
  toMessage,
} from "./supabase";
import type { Attachment, Category, Expense, LineItem, Message } from "./schema";

/* ============================================================
   WRITES. All of them, in one place.

   Everything goes through the secret key on the server. Nothing
   here runs in the browser, and nothing here touches the local
   filesystem, which is what makes the app deployable: a Vercel
   function has no disk to write to.
   ============================================================ */

function boom(what: string, error: { message: string }): never {
  throw new Error(`Could not ${what}: ${error.message}`);
}

/** Ids stay human-readable (exp_0049) so they are easy to talk about
 *  when correcting a row by hand. Derived from the current maximum
 *  rather than a counter, so it survives a restore. */
async function nextId(table: "expenses" | "messages", prefix: string) {
  const { data, error } = await db()
    .from(table)
    .select("id")
    .order("id", { ascending: false })
    .limit(1);
  if (error) boom(`read the last ${table} id`, error);
  const last = data?.[0]?.id as string | undefined;
  const n = last ? Number(last.split("_")[1]) : 0;
  return `${prefix}_${String((Number.isFinite(n) ? n : 0) + 1).padStart(4, "0")}`;
}

/* --- expenses ------------------------------------------------- */

export async function addExpense(input: {
  date: string;
  time?: string;
  label: string;
  amount: number;
  categoryId: string;
  note?: string;
  raw?: string;
  guessed: boolean;
  check?: string;
  items?: LineItem[];
  how?: Expense["entry"]["how"];
  method?: Expense["method"];
  ai?: boolean;
}): Promise<Expense> {
  const row: Expense = {
    id: await nextId("expenses", "exp"),
    date: input.date,
    time: input.time,
    label: input.label,
    amount: -Math.abs(input.amount),
    currency: "NGN",
    amountNGN: -Math.abs(input.amount),
    categoryId: input.categoryId,
    method: input.method ?? "unknown",
    note: input.note,
    items: input.items ?? [],
    entry: {
      how: input.how ?? "typed",
      raw: input.raw,
      at: new Date().toISOString(),
      guessed: input.guessed,
      check: input.check,
      ...(input.ai ? { ai: true } : {}),
    },
  };

  const { data, error } = await db()
    .from("expenses")
    .insert(fromExpense(row))
    .select()
    .single();
  if (error) boom("save that expense", error);
  return toExpense(data);
}

/** A field-whitelisted update, used by the assistant when Femi asks
 *  for a change in the chat. Amounts keep the direction the row
 *  already had, and the row is marked aiEdited for the audit. */
export async function editExpense(
  id: string,
  set: {
    date?: string;
    time?: string;
    label?: string;
    amount?: number;
    categoryId?: string;
    note?: string;
    items?: { name: string; qty: number; unit: number; total: number }[];
  },
) {
  const { data: current, error: readErr } = await db()
    .from("expenses")
    .select("*")
    .eq("id", id)
    .single();
  if (readErr) boom(`find ${id}`, readErr);

  const patch: Record<string, unknown> = {};
  if (set.date) patch.spent_on = set.date;
  if (set.time) patch.spent_at = set.time;
  if (set.label) patch.label = set.label;
  if (set.note !== undefined) patch.note = set.note;
  if (set.categoryId) patch.category_id = set.categoryId;
  if (set.items) patch.items = set.items;
  if (set.amount !== undefined) {
    const dir = Number(current.amount_ngn) >= 0 ? 1 : -1;
    patch.amount = dir * Math.abs(set.amount);
    patch.amount_ngn = dir * Math.abs(set.amount);
  }
  patch.entry = { ...current.entry, aiEdited: true };

  const { error } = await db().from("expenses").update(patch).eq("id", id);
  if (error) boom(`edit ${id}`, error);
}

export async function deleteExpense(id: string) {
  const { error } = await db().from("expenses").delete().eq("id", id);
  if (error) boom("delete that expense", error);
}

/* --- the thread ----------------------------------------------- */

export async function addMessage(input: {
  from: Message["from"];
  text?: string;
  attachments?: Attachment[];
  expenseId?: string;
  status?: Message["status"];
  meta?: Message["meta"];
}): Promise<Message> {
  const row: Message = {
    id: await nextId("messages", "msg"),
    at: new Date().toISOString(),
    from: input.from,
    text: input.text,
    attachments: input.attachments ?? [],
    expenseId: input.expenseId,
    status: input.status ?? "done",
    meta: input.meta,
  };

  let { data, error } = await db()
    .from("messages")
    .insert(fromMessage(row))
    .select()
    .single();

  /* Until the 003 migration runs, the database only knows you, app
     and claude. The reader's replies fall back to the app's name
     rather than failing, so the feature works either way. */
  if (error && input.from === "ai") {
    ({ data, error } = await db()
      .from("messages")
      .insert(fromMessage({ ...row, from: "app" }))
      .select()
      .single());
  }
  if (error) boom("send that message", error);
  return toMessage(data);
}

/** Rewrites the structured state riding on a message - an approval
 *  moving from open to approved or denied. */
export async function setMessageMeta(
  id: string,
  meta: NonNullable<Message["meta"]>,
) {
  const { data, error: readErr } = await db()
    .from("messages")
    .select("attachments")
    .eq("id", id)
    .single();
  if (readErr) boom(`find ${id}`, readErr);
  const rest = ((data.attachments ?? []) as Attachment[]).filter(
    (a) => a.type !== META_TYPE,
  );
  const { error } = await db()
    .from("messages")
    .update({ attachments: [...rest, metaEntry(meta)] })
    .eq("id", id);
  if (error) boom(`update ${id}`, error);
}

/** Takes a message off the pending list once handled. */
export async function completeMessage(id: string, expenseId?: string) {
  const patch: Record<string, unknown> = { status: "done" };
  if (expenseId) patch.expense_id = expenseId;
  const { error } = await db().from("messages").update(patch).eq("id", id);
  if (error) boom("mark that message handled", error);
}

/* --- files ----------------------------------------------------- */

/** A one-time URL the browser can PUT a file straight to.
 *
 *  Files do not pass through this app any more. A Vercel function
 *  caps its request body at 4.5MB, which is smaller than most photos
 *  a phone takes, so routing uploads through it failed for exactly
 *  the files most worth sending. The browser now talks to Supabase
 *  Storage directly; the bucket stays private, and reads still come
 *  back through /api/file. */
export async function signUpload(name: string) {
  const ext = (/\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1] ?? "bin").toLowerCase();
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { data, error } = await files()
    .storage.from(BUCKET)
    .createSignedUploadUrl(key);
  if (error) boom("prepare that upload", error);

  return { key, url: data.signedUrl };
}

export async function getFile(key: string) {
  const { data, error } = await files().storage.from(BUCKET).download(key);
  if (error) return null;
  return data;
}

/* --- budget ---------------------------------------------------- */

export async function saveBudget(
  month: string,
  income: number,
  caps: Record<string, number>,
) {
  const total = Object.values(caps).reduce((a, c) => a + c, 0);
  const { error } = await db()
    .from("budgets")
    .upsert({ month, income, total, caps, updated_at: new Date().toISOString() });
  if (error) boom("save that budget", error);
  return { month, income, total, caps };
}

/* --- categories ------------------------------------------------ */

/** Adds a category and, if given a cap, writes it into that month's
 *  budget in the same pass so the two never drift apart. */
export async function addCategory(input: {
  name: string;
  icon: string;
  cap: number;
  month: string;
}): Promise<Category> {
  const id = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);

  if (!id) throw new Error("That name has no letters in it.");

  const existing = await db().from("categories").select("id").eq("id", id).maybeSingle();
  if (existing.data) throw new Error(`${input.name} already exists.`);

  // Income sorts last, so a new spend category slots in just before it.
  const { data: top } = await db()
    .from("categories")
    .select("sort")
    .eq("kind", "spend")
    .order("sort", { ascending: false })
    .limit(1);

  const { data, error } = await db()
    .from("categories")
    .insert({
      id,
      name: input.name,
      icon: input.icon,
      group: null,
      // Its own name is the first thing to match on; Claude adds more.
      matches: [input.name.toLowerCase()],
      kind: "spend",
      sort: (top?.[0]?.sort ?? 0) + 1,
    })
    .select()
    .single();
  if (error) boom("add that category", error);

  if (input.cap > 0) {
    const { data: b } = await db()
      .from("budgets")
      .select("*")
      .eq("month", input.month)
      .maybeSingle();
    if (b) {
      const caps = { ...(b.caps as Record<string, number>), [id]: input.cap };
      await saveBudget(input.month, Number(b.income), caps);
    }
  }

  return {
    id: data.id,
    name: data.name,
    icon: data.icon,
    group: data.group ?? undefined,
    matches: data.matches ?? [],
    kind: data.kind,
  };
}
