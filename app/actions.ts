"use server";

import { revalidatePath } from "next/cache";
import { getCategories } from "@/lib/data";
import { parseEntry } from "@/lib/parse";
import {
  addCategory,
  addExpense,
  addMessage,
  deleteExpense,
  saveBudget,
  signUpload,
} from "@/lib/store";
import { Attachment } from "@/lib/schema";
import { dayLabel, naira } from "@/lib/format";
import { z } from "zod";

/* Sending a message is the only way anything gets into Biblo.

   The app answers immediately for anything it can read on its own,
   so the thread is useful before Claude has seen it. What it cannot
   read stays marked pending, and Claude replies into the same
   thread later. */

export async function sendMessage(_prev: unknown, form: FormData) {
  const text = String(form.get("text") ?? "").trim();

  let attachments: Attachment[] = [];
  const raw = String(form.get("attachments") ?? "");
  if (raw) {
    const parsed = z.array(Attachment).safeParse(JSON.parse(raw));
    if (parsed.success) attachments = parsed.data;
  }

  if (!text && attachments.length === 0) {
    return { ok: false as const, error: "Nothing to send." };
  }

  const categories = await getCategories();

  // A file always waits for Claude: the app cannot read a photo or a PDF.
  if (attachments.length > 0) {
    await addMessage({ from: "you", text: text || undefined, attachments, status: "pending" });
    const what =
      attachments.length === 1
        ? attachments[0].name
        : `${attachments.length} files`;
    await addMessage({
      from: "app",
      text: `Got ${what}. I can't read files myself, so this is waiting for Claude. Say "/budget" in your Claude Code session and it'll go through.`,
    });
    revalidatePath("/", "layout");
    return { ok: true as const };
  }

  const p = parseEntry(text, categories);

  if (p.amount === null || p.categoryId === null) {
    await addMessage({ from: "you", text, status: "pending" });
    await addMessage({
      from: "app",
      text: p.check?.startsWith("More than one amount")
        ? "There's more than one expense in that, so I've left the whole thing for Claude rather than guess at one of them."
        : p.amount === null
          ? "I couldn't find an amount in that, so I've left it for Claude."
          : "I couldn't tell which category that belongs to, so I've left it for Claude.",
    });
    revalidatePath("/", "layout");
    return { ok: true as const };
  }

  const row = await addExpense({
    date: p.date,
    time: new Date().toTimeString().slice(0, 5),
    label: p.label,
    amount: p.amount,
    categoryId: p.categoryId,
    raw: text,
    guessed: p.guessed,
  });

  const category = categories.find((c) => c.id === p.categoryId)?.name ?? "";
  await addMessage({ from: "you", text, expenseId: row.id });
  await addMessage({
    from: "app",
    text: `${naira(p.amount, { decimals: 0 })} · ${row.label} → ${category} · ${dayLabel(row.date)}`,
    expenseId: row.id,
  });

  revalidatePath("/", "layout");
  return { ok: true as const };
}

/** Anything you might reasonably have a receipt in. */
const ALLOWED = [
  "image/",
  "application/pdf",
  "text/",
  "application/json",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "application/msword",
  "application/csv",
];

/** Supabase's own per-file ceiling. Nothing to do with Vercel now. */
const MAX = 25 * 1024 * 1024;

export async function prepareUploads(
  wanted: { name: string; type: string; size: number }[],
) {
  if (wanted.length === 0 || wanted.length > 10) {
    return { ok: false as const, error: "Send between one and ten files." };
  }

  const targets = [];
  for (const f of wanted) {
    if (f.size > MAX) {
      return {
        ok: false as const,
        error: `${f.name} is ${(f.size / 1_048_576).toFixed(1)}MB. The limit is 25MB.`,
      };
    }
    const type = f.type || "application/octet-stream";
    if (!ALLOWED.some((a) => type.startsWith(a))) {
      return { ok: false as const, error: `Cannot take ${type} yet.` };
    }
    const { key, url } = await signUpload(f.name);
    targets.push({ key, url, name: f.name, type, size: f.size });
  }

  return { ok: true as const, targets };
}

export async function removeExpense(id: string) {
  await deleteExpense(id);
  revalidatePath("/", "layout");
}

export async function updateBudget(_prev: unknown, form: FormData) {
  const month = String(form.get("month"));
  const income = Number(String(form.get("income") ?? "0").replace(/[^\d.]/g, "")) || 0;

  const caps: Record<string, number> = {};
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("cap:")) continue;
    const n = Number(String(value).replace(/[^\d.]/g, ""));
    if (Number.isFinite(n) && n > 0) caps[key.slice(4)] = n;
  }

  await saveBudget(month, income, caps);
  revalidatePath("/", "layout");
  return { ok: true as const, saved: new Date().toISOString() };
}

export async function createCategory(_prev: unknown, form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  const cap = Number(String(form.get("cap") ?? "0").replace(/[^\d.]/g, "")) || 0;
  const icon = String(form.get("icon") ?? "Tag");
  const month = String(form.get("month"));

  if (!name) return { ok: false as const, error: "Give it a name." };

  try {
    await addCategory({ name, icon, cap, month });
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }

  revalidatePath("/", "layout");
  return { ok: true as const, name };
}
