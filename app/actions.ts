"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { COOKIE, token } from "@/lib/auth";
import { getSettings, saveSettings, type Settings } from "@/lib/settings";
import { viewerId } from "@/lib/viewer";
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
    /* Anything the reader can open itself: pictures, PDFs, text
       files. Only then does the message go to it; otherwise the
       honest fallback below. */
    const readable = attachments.some(
      (a) =>
        a.type.startsWith("image/") ||
        a.type === "application/pdf" ||
        a.type.startsWith("text/") ||
        a.type === "application/json" ||
        /\.(pdf|csv|txt|json|md)$/i.test(a.name),
    );

    if (aiConfigured() && readable) {
      // No ack bubble: the thinking line opens with "Got N files,
      // opening them" - the same sentence, in the right place.
      after(() => processWithReader(msg.id));
    } else {
      // Nobody is scheduled to read what the reader cannot, so say
      // so plainly rather than promising a "shortly" that never comes.
      await completeMessage(msg.id);
      await addMessage({
        from: "app",
        text: aiConfigured()
          ? `I can't read ${what} - only photos, PDFs and CSV or text files. Tell me the figures and I'll file them.`
          : `Got ${what}. I'll go through it shortly.`,
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
  /* after() runs past the request, where there are no cookies to say
     who is asking - but the message row itself says whose work this
     is, and everything below scopes through that. */
  try {
    const { db } = await import("@/lib/supabase");
    const { runAsUser } = await import("@/lib/viewer");
    const { data: m } = await db()
      .from("messages")
      .select("user_id")
      .eq("id", messageId)
      .maybeSingle();
    if (m?.user_id) await runAsUser(m.user_id, () => processScoped(messageId));
  } catch {
    // Say nothing and leave it pending: the safe default.
  }
}

async function processScoped(messageId: string) {
  try {
    const { getMessages, getCategories } = await import("@/lib/data");
    const messages = await getMessages();
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || msg.status !== "pending") return;

    const cats = await getCategories();

    /* Images go to the model as pictures, PDFs as documents, and
       plain text files (CSV, JSON, txt) as text - it reads all three
       itself. A message used to park for a human the moment a PDF
       was attached, which with no human on a schedule meant a spinner
       that never ended. Only true spreadsheets (xlsx) and Word files
       are beyond it, and those get an honest answer, not silence. */
    const images: { type: string; base64: string }[] = [];
    const documents: { name: string; base64: string }[] = [];
    const texts: { name: string; text: string }[] = [];
    const unreadable: string[] = [];

    /* A follow-up ("just log the fuel and the offering") is about the
       receipts sent a moment ago, not about nothing. Receipts from
       the person's recent messages ride along with this one - back
       to the last message that actually produced a filing, since
       anything before that is settled. A short window, so an old
       thread does not turn every message into a pile of pictures. */
    const idx = messages.findIndex((x) => x.id === messageId);
    const carried: typeof msg.attachments = [];
    if (msg.attachments.length === 0) {
      for (let i = idx - 1; i >= 0 && i >= idx - 8; i--) {
        const prev = messages[i];
        if (prev.from !== "you") continue;
        if (prev.expenseId) break; // that turn was filed; stop there
        carried.push(...prev.attachments);
        if (carried.length >= 6) break;
      }
    }
    const carriedNote =
      carried.length > 0
        ? `(The ${carried.length === 1 ? "receipt" : `${carried.length} receipts`} attached here came with their earlier messages above - this message refers to them.)`
        : "";

    for (const a of [...msg.attachments, ...carried]) {
      const blob = await getFile(a.url.replace("/api/file/", ""));
      if (!blob) continue;
      const buf = Buffer.from(await blob.arrayBuffer());
      const lower = a.name.toLowerCase();
      if (a.type.startsWith("image/")) {
        images.push({ type: a.type, base64: buf.toString("base64") });
      } else if (a.type === "application/pdf" || lower.endsWith(".pdf")) {
        documents.push({ name: a.name, base64: buf.toString("base64") });
      } else if (
        a.type.startsWith("text/") ||
        a.type === "application/json" ||
        /\.(csv|txt|json|md)$/.test(lower)
      ) {
        texts.push({ name: a.name, text: buf.toString("utf8").slice(0, 60_000) });
      } else {
        unreadable.push(a.name);
      }
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
        .slice(-11, -1)
        .map((x) => {
          const who = x.from === "you" ? "you" : "assistant";
          const files = x.attachments.length > 0 ? ` [sent ${x.attachments.length} file${x.attachments.length === 1 ? "" : "s"}]` : "";
          const ask = x.meta?.approval ? ` [asked for a button: ${x.meta.approval.state}]` : "";
          return `${who}${files}${ask}: ${(x.text ?? "").slice(0, 240)}`;
        }),
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

    /* The assistant addresses whoever this chat belongs to. */
    const { getSettings } = await import("@/lib/settings");
    const { viewerEmail } = await import("@/lib/viewer");
    const [prefs, email] = await Promise.all([getSettings(), viewerEmail()]);
    const userName =
      prefs.name?.trim().split(/\s+/)[0] || email?.split("@")[0] || "friend";

    let reading = await readWithAI({
      text: carriedNote ? `${msg.text ?? ""}

${carriedNote}` : msg.text,
      images,
      documents,
      texts,
      unreadable,
      categories: cats,
      context,
      validIds,
      userName,
    });

    /* Femi's rule, made mechanical: some changes go through the
       approval card even when the model is sure of itself. Changing
       an amount the person typed with their own hands, or deleting
       an entry from a past day, is exactly where a wrong guess
       corrupts the books - so the button asks first, whether the
       model thought to or not. */
    if (reading.kind === "filed") {
      const byId = new Map(allExpenses.map((e) => [e.id, e] as const));
      const today = new Date().toLocaleDateString("en-CA", {
        timeZone: "Africa/Lagos",
      });
      const risky: string[] = [];
      for (const ed of reading.edits) {
        const cur = byId.get(ed.id);
        if (
          cur &&
          ed.set.amount !== undefined &&
          cur.entry.how === "typed" &&
          Math.abs(cur.amountNGN) !== Math.abs(ed.set.amount)
        ) {
          risky.push(
            `change "${cur.label}" (${cur.date}) from ${Math.abs(cur.amountNGN).toLocaleString()} to ${Math.abs(ed.set.amount).toLocaleString()}`,
          );
        }
      }
      for (const id of reading.deletes) {
        const cur = byId.get(id);
        if (cur && cur.date !== today) {
          risky.push(
            `remove "${cur.label}" (${Math.abs(cur.amountNGN).toLocaleString()}, ${cur.date})`,
          );
        }
      }
      if (risky.length > 0) {
        reading = {
          kind: "ask",
          question:
            risky.length === 1
              ? `Okay to ${risky[0]}?`
              : `Okay to make ${risky.length} changes to earlier entries?`,
          detail: risky.length > 1 ? risky.join("; ").slice(0, 280) : undefined,
          expenses: reading.expenses,
          edits: reading.edits,
          deletes: reading.deletes,
        };
      }
    }

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
      /* Card first, then close the question that raised it. The
         other order left one instant where nothing was pending and
         no card existed yet - a phone that polled at that instant
         stopped polling and sat on the thinking line forever. */
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
      await completeMessage(messageId);
      revalidatePath("/", "layout");
      return;
    }

    const touched = await applyProposal(
      reading,
      msg.text,
      images.length > 0 || documents.length > 0 ? "photo" : "typed",
    );

    await completeMessage(messageId, touched[0]);
    await addMessage({
      from: "ai",
      text: reading.reply,
      expenseId: touched[0],
      // One card per expense in the thread, not just the first.
      meta: touched.length > 1 ? { expenseIds: touched } : undefined,
    });
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
): Promise<string[]> {
  const { editExpense } = await import("@/lib/store");
  const touched: string[] = [];
  for (const ed of p.edits) {
    await editExpense(ed.id, ed.set);
    touched.push(ed.id);
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
    touched.push(row.id);
  }
  return touched;
}

/** The third way out of an approval card: say something instead of
 *  pressing a button. The held change is dropped as "answered", and
 *  the words go into the thread as a normal message, with the
 *  original question quoted so the reader knows what they refer to. */
export async function answerApproval(id: string, text: string) {
  const { getMessages } = await import("@/lib/data");
  const messages = await getMessages();
  const msg = messages.find((m) => m.id === id);
  const ap = msg?.meta?.approval;
  if (!ap || ap.state !== "open") {
    return { ok: false as const, error: "That question is no longer open." };
  }
  const said = text.trim();
  if (!said) return { ok: false as const, error: "Nothing to send." };

  await setMessageMeta(id, { approval: { ...ap, state: "denied" } });
  const m = await addMessage({ from: "you", text: said, status: "pending" });
  if (aiConfigured()) after(() => processWithReader(m.id));
  revalidatePath("/", "layout");
  return { ok: true as const };
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
  const touched = await applyProposal(p, ap.raw, "typed");
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
    expenseId: touched[0],
    meta: touched.length > 1 ? { expenseIds: touched } : undefined,
  });
  revalidatePath("/", "layout");
  return { ok: true as const };
}

/* --- the profile screen ---------------------------------------- */

export async function updateSettings(patch: {
  hideIncome?: boolean;
  showTime?: boolean;
  monthStart?: number;
  avatar?: string;
  name?: string;
}) {
  const { isAvatar } = await import("@/lib/avatars");
  const clean: Partial<Settings> = {};
  if (typeof patch.hideIncome === "boolean") clean.hideIncome = patch.hideIncome;
  if (typeof patch.showTime === "boolean") clean.showTime = patch.showTime;
  if (typeof patch.avatar === "string" && isAvatar(patch.avatar))
    clean.avatar = patch.avatar;
  if (typeof patch.name === "string") {
    const name = patch.name.trim().slice(0, 40);
    if (name) clean.name = name;
  }
  if (
    Number.isInteger(patch.monthStart) &&
    patch.monthStart! >= 1 &&
    patch.monthStart! <= 28
  ) {
    clean.monthStart = patch.monthStart;
  }
  await saveSettings(clean);
  revalidatePath("/", "layout");
  return { ok: true as const };
}

const PIN_COOKIE = "biblo_pin";
const pinCookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 180,
  path: "/",
};
const pinHashFor = async (uid: string, pin: string) =>
  token(process.env.BIBLO_SESSION_SECRET ?? "biblo-pin", `pin:${uid}:${pin}`);

export async function setPin(pin: string | null) {
  const uid = await viewerId();
  const jar = await cookies();
  if (pin === null) {
    await saveSettings({ pinHash: null } as unknown as Partial<Settings>);
    jar.delete(PIN_COOKIE);
  } else {
    if (!/^\d{4,8}$/.test(pin)) {
      return { ok: false as const, error: "A PIN is 4 to 8 digits." };
    }
    const hash = await pinHashFor(uid, pin);
    await saveSettings({ pinHash: hash });
    jar.set(PIN_COOKIE, hash, pinCookieOpts);
  }
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function verifyPin(_prev: unknown, form: FormData) {
  const pin = String(form.get("pin") ?? "");
  const uid = await viewerId();
  const s = await getSettings();
  if (s.pinHash) {
    const hash = await pinHashFor(uid, pin);
    if (hash !== s.pinHash) {
      return { ok: false as const, error: "That is not it. Try again." };
    }
    (await cookies()).set(PIN_COOKIE, hash, pinCookieOpts);
  }
  redirect("/");
}

export async function markToured() {
  await saveSettings({ toured: true });
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function signOutAction() {
  const jar = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (all) =>
          all.forEach(({ name, value, options }) => jar.set(name, value, options)),
      },
    },
  );
  await supabase.auth.signOut();
  // The owner's passcode cookie and any PIN go too: signing out
  // means the next person at this screen starts from the door.
  jar.delete(COOKIE);
  jar.delete(PIN_COOKIE);
  redirect("/login");
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
