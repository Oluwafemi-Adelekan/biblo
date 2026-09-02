"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getCategories } from "@/lib/data";
import { parseEntry } from "@/lib/parse";
import {
  addCategory,
  addExpense,
  addMessage,
  completeMessage,
  deleteExpense,
  getFile,
  saveBudget,
  signUpload,
} from "@/lib/store";
import { aiConfigured, readWithAI, type MonthContext } from "@/lib/ai";
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

  if (attachments.length > 0) {
    const msg = await addMessage({
      from: "you",
      text: text || undefined,
      attachments,
      status: "pending",
    });
    const what =
      attachments.length === 1
        ? attachments[0].name
        : `${attachments.length} files`;
    const readable = attachments.some((a) => a.type.startsWith("image/"));

    if (aiConfigured() && readable) {
      await addMessage({ from: "app", text: `Got ${what}. Reading it now.` });
      after(() => processWithReader(msg.id));
    } else {
      await addMessage({
        from: "app",
        text: aiConfigured()
          ? `Got ${what}. The reader only handles images, so this is waiting for Claude.`
          : `Got ${what}. This is waiting for Claude.`,
      });
    }
    revalidatePath("/", "layout");
    return { ok: true as const };
  }

  const p = parseEntry(text, categories);

  if (p.amount === null || p.categoryId === null) {
    const msg = await addMessage({ from: "you", text, status: "pending" });

    if (aiConfigured()) {
      // No ack for text: the assistant's reply lands in a moment and
      // an ack would just be noise above it.
      after(() => processWithReader(msg.id));
    } else {
      await addMessage({
        from: "app",
        text: p.check?.startsWith("More than one amount")
          ? "There's more than one expense in that, so I've left the whole thing for Claude rather than guess at one of them."
          : p.amount === null
            ? "I couldn't find an amount in that, so I've left it for Claude."
            : "I couldn't tell which category that belongs to, so I've left it for Claude.",
      });
    }
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

/* --- the resident reader ------------------------------------------
   Runs after the response is sent (Next's after()), so sending never
   waits on the model. Anything that goes wrong leaves the message
   pending, which is the Claude path — the reader can fail without
   anything being lost. */
async function processWithReader(messageId: string) {
  try {
    const { getMessages, getCategories } = await import("@/lib/data");
    const messages = await getMessages();
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || msg.status !== "pending") return;

    const cats = await getCategories();

    // Only images; PDFs and spreadsheets stay with Claude.
    const images: { type: string; base64: string }[] = [];
    for (const a of msg.attachments) {
      if (!a.type.startsWith("image/")) continue;
      const blob = await getFile(a.url.replace("/api/file/", ""));
      if (!blob) continue;
      images.push({
        type: a.type,
        base64: Buffer.from(await blob.arrayBuffer()).toString("base64"),
      });
    }

    const { getMonth } = await import("@/lib/data");
    const m = await getMonth();
    const context: MonthContext = {
      month: m.month,
      spent: m.spent,
      budgetTotal: m.budget.total,
      income: m.budget.income,
      earned: m.earned,
      categoryLines: m.categoryRows
        .filter((r) => r.total > 0 || r.cap > 0)
        .map(
          (r) =>
            `${r.category.name}: ${r.total.toLocaleString()} of ${r.cap.toLocaleString()}${r.over ? " OVER" : ""}`,
        ),
      recentLines: (await (await import("@/lib/data")).getExpenses())
        .slice(0, 15)
        .map(
          (e) =>
            `${e.date} ${e.label} ${Math.abs(e.amountNGN).toLocaleString()} [${e.categoryId}]`,
        ),
    };

    const reading = await readWithAI({
      text: msg.text,
      images,
      categories: cats,
      context,
    });

    // Pure conversation: reply and close it out; nothing for Claude.
    if (reading.kind === "chat") {
      await completeMessage(messageId);
      await addMessage({ from: "ai", text: reading.reply });
      revalidatePath("/", "layout");
      return;
    }

    if (reading.kind === "defer") {
      // He sees the assistant's own words; the terse reason waits in
      // the pending queue for Claude.
      await addMessage({
        from: "ai",
        text:
          reading.reply ??
          "I'll leave that one for Claude - it needs a hand I don't have.",
      });
      revalidatePath("/", "layout");
      return;
    }

    let firstId: string | undefined;
    for (const e of reading.expenses) {
      const row = await addExpense({
        date: e.date,
        time: e.time,
        label: e.label,
        amount: e.amount,
        categoryId: e.categoryId,
        note: e.note,
        raw: msg.text,
        guessed: false,
        items: e.items,
        method: e.method,
        how: images.length > 0 ? "photo" : "typed",
        ai: true,
      });
      firstId ??= row.id;
    }

    await completeMessage(messageId, firstId);
    await addMessage({ from: "ai", text: reading.reply, expenseId: firstId });
    revalidatePath("/", "layout");
  } catch {
    // Say nothing and leave it pending: silence here means Claude
    // picks it up on the next /budget, which is the safe default.
  }
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
