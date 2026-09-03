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
  setMessageMeta,
  signUpload,
} from "@/lib/store";
import {
  aiConfigured,
  readWithAI,
  type AiEditT,
  type AiExpenseT,
  type MonthContext,
} from "@/lib/ai";
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
      // No ack bubble: the thinking line opens with "Got N files,
      // opening them" - the same sentence, in the right place.
      after(() => processWithReader(msg.id));
    } else {
      await addMessage({
        from: "app",
        text: `Got ${what}. I'll go through it shortly.`,
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
          ? "There's more than one expense in that, so I'll go through it properly and file each one shortly."
          : p.amount === null
            ? "I couldn't find an amount in that at a glance, so I'll read it properly shortly."
            : "I'll work out where that belongs and file it shortly.",
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
      recentLines: [] as string[],
      /* The last few turns, so "move that one" means something. */
      threadLines: messages
        .slice(-9, -1)
        .map(
          (x) =>
            `${x.from === "you" ? "you" : "assistant"}: ${(x.text ?? "(files)").slice(0, 160)}`,
        ),
    };
    const allExpenses = await (await import("@/lib/data")).getExpenses();
    context.recentLines = allExpenses
      .slice(0, 25)
      .map((e) => {
        const head = `${e.id} ${e.date} ${e.label} ${Math.abs(e.amountNGN).toLocaleString()} [${e.categoryId}]`;
        if (!e.items?.length) return head;
        const items = e.items
          .map((i) => `${i.name} x${i.qty} @${i.unit}`)
          .join("; ")
          .slice(0, 600);
        return `${head}\n  items: ${items}`;
      });
    const validIds = new Set(allExpenses.map((e) => e.id));

    const reading = await readWithAI({
      text: msg.text,
      images,
      categories: cats,
      context,
      validIds,
    });

    // Pure conversation: reply and close it out; nothing for Claude.
    if (reading.kind === "chat") {
      await completeMessage(messageId);
      await addMessage({ from: "ai", text: reading.reply });
      revalidatePath("/", "layout");
      return;
    }

    if (reading.kind === "defer") {
      /* Say nothing. The message stays pending and the chat keeps
         showing its working state until the real work lands as a
         real reply. A cheerful "I'll sort it shortly" here reads as
         a finished turn, and Femi called that what it is: a lie. */
      return;
    }

    /* A question with the change attached. The composer becomes the
       card; a button applies or drops the proposal. */
    if (reading.kind === "ask") {
      await completeMessage(messageId);
      await addMessage({
        from: "ai",
        text: reading.question,
        meta: {
          approval: {
            state: "open",
            detail: reading.detail,
            proposal: {
              expenses: reading.expenses as unknown as Record<string, unknown>[],
              edits: reading.edits as unknown as Record<string, unknown>[],
              deletes: reading.deletes,
            },
            raw: msg.text,
          },
        },
      });
      revalidatePath("/", "layout");
      return;
    }

    const firstId = await applyProposal(
      reading,
      msg.text,
      images.length > 0 ? "photo" : "typed",
    );

    await completeMessage(messageId, firstId);
    await addMessage({ from: "ai", text: reading.reply, expenseId: firstId });
    revalidatePath("/", "layout");
  } catch {
    // Say nothing and leave it pending: silence here means Claude
    // picks it up on the next /budget, which is the safe default.
  }
}

/* The one way changes land, whether filed outright or held for a
   button press. Edits first: "move that to giving" should not lose
   to a new row filed in the same breath. */
async function applyProposal(
  p: { expenses: AiExpenseT[]; edits: AiEditT[]; deletes: string[] },
  raw: string | undefined,
  how: "photo" | "typed",
): Promise<string | undefined> {
  const { editExpense } = await import("@/lib/store");
  let firstId: string | undefined;
  for (const ed of p.edits) {
    await editExpense(ed.id, ed.set);
    firstId ??= ed.id;
  }
  for (const id of p.deletes) {
    await deleteExpense(id);
  }
  for (const e of p.expenses) {
    const row = await addExpense({
      date: e.date,
      time: e.time,
      label: e.label,
      amount: e.amount,
      categoryId: e.categoryId,
      note: e.note,
      raw,
      guessed: false,
      items: e.items,
      method: e.method,
      how,
      ai: true,
    });
    firstId ??= row.id;
  }
  return firstId;
}

/** The button on the approval card. Applies or drops the held
 *  change, then says what happened in the thread. */
export async function resolveApproval(id: string, approved: boolean) {
  const { getMessages } = await import("@/lib/data");
  const messages = await getMessages();
  const msg = messages.find((m) => m.id === id);
  const ap = msg?.meta?.approval;
  if (!ap || ap.state !== "open") {
    return { ok: false as const, error: "That question is no longer open." };
  }

  if (!approved) {
    await setMessageMeta(id, { approval: { ...ap, state: "denied" } });
    await addMessage({ from: "ai", text: "Okay, left it alone." });
    revalidatePath("/", "layout");
    return { ok: true as const };
  }

  const p = ap.proposal as unknown as {
    expenses: AiExpenseT[];
    edits: AiEditT[];
    deletes: string[];
  };
  const firstId = await applyProposal(p, ap.raw, "typed");
  await setMessageMeta(id, { approval: { ...ap, state: "approved" } });

  const parts: string[] = [];
  if (p.expenses.length > 0)
    parts.push(p.expenses.length === 1 ? "filed it" : `filed ${p.expenses.length} entries`);
  if (p.edits.length > 0)
    parts.push(p.edits.length === 1 ? "updated the entry" : `updated ${p.edits.length} entries`);
  if (p.deletes.length > 0)
    parts.push(p.deletes.length === 1 ? "removed it" : `removed ${p.deletes.length} entries`);
  await addMessage({
    from: "ai",
    text: `Done, ${parts.join(" and ")}.`,
    expenseId: firstId,
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
