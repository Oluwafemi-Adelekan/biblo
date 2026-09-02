import "server-only";
import { z } from "zod";
import type { Category, Expense, LineItem } from "./schema";

/* ============================================================
   The resident assistant.

   An OpenAI model on Azure that lives in the chat. It files
   receipts and dictated expenses, edits entries when Femi asks,
   answers questions about the month with real figures, and holds
   a normal conversation.

   To Femi there is one assistant. The model is told nothing about
   the machinery behind it; work beyond its tools happens
   "shortly", which in practice is Claude's queue. Claude audits
   everything the model files or edits (entry.ai / entry.aiEdited)
   and can override any of it. Every failure path leaves the
   message pending, which is the Claude path.
   ============================================================ */

export function aiConfigured() {
  return Boolean(
    process.env.AZURE_OPENAI_ENDPOINT &&
      process.env.AZURE_OPENAI_KEY &&
      process.env.AZURE_OPENAI_DEPLOYMENT,
  );
}

const AiItem = z.object({
  name: z.string().min(1),
  qty: z.number().positive().default(1),
  unit: z.number().nonnegative(),
  total: z.number().nonnegative(),
});

const AiExpense = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  label: z.string().min(1).max(80),
  amount: z.number().positive(),
  categoryId: z.string(),
  method: z.enum(["card", "transfer", "cash", "ussd", "direct-debit", "unknown"]).optional(),
  note: z.string().max(300).optional(),
  items: z.array(AiItem).max(50).default([]),
});

/* A change to an entry that already exists. The id must come from
   the list the model was shown; nothing else is editable. */
const AiEdit = z
  .object({
    id: z.string().regex(/^exp_\d{3,}$/),
    set: z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        label: z.string().min(1).max(80).optional(),
        amount: z.number().positive().optional(),
        categoryId: z.string().optional(),
        note: z.string().max(300).optional(),
      })
      .refine((s) => Object.keys(s).length > 0, "empty edit"),
  })
  .strict();

/* file  - it wrote something: new expenses, edits, or both
   chat  - conversation; nothing written
   defer - background work (in truth: Claude's queue) */
const AiResult = z.object({
  verdict: z.enum(["file", "chat", "defer"]),
  reason: z.string().optional(),
  expenses: z.array(AiExpense).max(20).default([]),
  edits: z.array(AiEdit).max(10).default([]),
  reply: z.string().min(1).max(900),
});

export type AiEditT = z.infer<typeof AiEdit>;

export type AiReading =
  | {
      kind: "filed";
      expenses: z.infer<typeof AiExpense>[];
      edits: AiEditT[];
      reply: string;
    }
  | { kind: "chat"; reply: string }
  | { kind: "defer"; reason: string; reply?: string };

export type MonthContext = {
  month: string;
  spent: number;
  budgetTotal: number;
  income: number;
  earned: number;
  categoryLines: string[];
  recentLines: string[];
  threadLines: string[];
};

function prompt(categories: Category[], ctx: MonthContext, today: string) {
  const cats = categories.map((c) => `- ${c.id} (${c.name}, ${c.kind})`).join("\n");

  return `You are the assistant inside Biblo, a personal budgeting app built by Femi in Lagos, Nigeria. You live in its chat. Femi is the only user, and as far as this chat is concerned there are exactly two of you: Femi and you. Never mention other assistants, agents, models, or systems. Never hand work off to anyone by name. Work you cannot do this second, you do "shortly" - it goes to your own background queue and gets done. Do not explain the machinery.

Today is ${today} (Africa/Lagos). Amounts are naira.

WHO YOU ARE
Plain-spoken, warm, quick. Short sentences. No emoji, no exclamation marks, no corporate filler, never "As an AI". Talk about whatever he brings up - you are his assistant, not a form. When money comes up, use the real figures below, never generalities.

WHAT YOU CAN DO
1. Converse (verdict "chat"). Questions, thinking out loud, advice. If a request is ambiguous - you cannot tell which entry he means, or what he wants changed - ask him, as "chat", rather than guessing.
2. File money that happened (verdict "file", expenses[]): receipts, bank screenshots, dictated spending, money received. One message can hold several; file each.
3. Change entries he asks you to change (verdict "file", edits[]): recategorise, rename, redate, correct an amount, add a note. Use the exact id from RECENTLY FILED. Only edit when he clearly asked for it and you are confident which entry he means.
4. Everything else you do shortly (verdict "defer"): deleting entries, changing budgets, caps or categories, PDFs and spreadsheets, or money you cannot read with confidence. Reply naturally - "I'll sort that out in a bit" - and never claim you lack the ability.

HIS MONTH SO FAR (${ctx.month})
- spent ${ctx.spent.toLocaleString()} of a ${ctx.budgetTotal.toLocaleString()} budget; income received ${ctx.earned.toLocaleString()} of ${ctx.income.toLocaleString()} expected
${ctx.categoryLines.map((l) => `- ${l}`).join("\n")}

RECENTLY FILED (newest first; these ids are the only ones you may edit)
${ctx.recentLines.map((l) => `- ${l}`).join("\n") || "- nothing yet"}

THE CONVERSATION SO FAR (oldest first; "you" is Femi, "assistant" is you)
${ctx.threadLines.map((l) => `- ${l}`).join("\n") || "- just starting"}

CATEGORIES (use the id, never the name)
${cats}

FILING RULES
- Never invent an expense, an amount, or a date. Unreadable figure: defer.
- "5k" is 5,000. "1.5k" is 1,500. "2m" is 2,000,000. "$5,000 Naira" dictated means 5,000 naira.
- Nigerian dates are day-first: 03/04 is 3 April. If ambiguous and it matters, defer.
- No date mentioned means today; "yesterday" means the day before.
- amount is always positive; the category's kind carries direction. Money received goes to an income category.
- Receipts that list items MUST be itemised: names as printed (keep sizes - "340g" is part of the price), qty, unit, line total.
- Labels are short names, not sentences.
- If it matches something in RECENTLY FILED (same amount, day, place), do not file it again - say it is already recorded.

Respond with ONLY a JSON object, no markdown fences:
{"verdict":"file"|"chat"|"defer","reason":"background note, only when deferring","expenses":[{"date":"YYYY-MM-DD","time":"HH:MM optional","label":"...","amount":1234,"categoryId":"...","method":"transfer optional","note":"optional","items":[{"name":"...","qty":1,"unit":1234,"total":1234}]}],"edits":[{"id":"exp_0049","set":{"categoryId":"giving"}}],"reply":"what Femi sees"}`;
}

export async function readWithAI(input: {
  text?: string;
  images: { type: string; base64: string }[];
  categories: Category[];
  context: MonthContext;
  /** Every expense id that exists; edits outside this set are refused. */
  validIds: Set<string>;
}): Promise<AiReading> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

  const content: object[] = [];
  if (input.text) content.push({ type: "text", text: input.text });
  if (!input.text && input.images.length === 0) {
    return { kind: "defer", reason: "Nothing readable in the message." };
  }
  for (const img of input.images) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${img.type};base64,${img.base64}` },
    });
  }

  const res = await fetch(
    `${process.env.AZURE_OPENAI_ENDPOINT}/openai/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        "api-key": process.env.AZURE_OPENAI_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.AZURE_OPENAI_DEPLOYMENT,
        response_format: { type: "json_object" },
        max_completion_tokens: 4000,
        messages: [
          { role: "system", content: prompt(input.categories, input.context, today) },
          { role: "user", content },
        ],
      }),
    },
  );

  if (!res.ok) {
    return { kind: "defer", reason: `The assistant could not be reached (${res.status}).` };
  }

  let parsed: z.infer<typeof AiResult>;
  try {
    const body = await res.json();
    const raw = body?.choices?.[0]?.message?.content ?? "";
    parsed = AiResult.parse(JSON.parse(raw));
  } catch {
    return { kind: "defer", reason: "The assistant's answer did not parse." };
  }

  if (parsed.verdict === "chat") {
    return { kind: "chat", reply: parsed.reply };
  }

  if (
    parsed.verdict === "defer" ||
    (parsed.expenses.length === 0 && parsed.edits.length === 0)
  ) {
    return {
      kind: "defer",
      reason: parsed.reason || "The assistant was not sure.",
      reply: parsed.reply,
    };
  }

  const known = new Set(input.categories.map((c) => c.id));
  for (const e of parsed.expenses) {
    if (!known.has(e.categoryId)) {
      return {
        kind: "defer",
        reason: `Unknown category "${e.categoryId}" on a new expense.`,
        reply: parsed.reply,
      };
    }
  }
  for (const ed of parsed.edits) {
    if (!input.validIds.has(ed.id)) {
      return {
        kind: "defer",
        reason: `Tried to edit "${ed.id}", which does not exist.`,
        reply: parsed.reply,
      };
    }
    if (ed.set.categoryId && !known.has(ed.set.categoryId)) {
      return {
        kind: "defer",
        reason: `Unknown category "${ed.set.categoryId}" on an edit.`,
        reply: parsed.reply,
      };
    }
  }

  return {
    kind: "filed",
    expenses: parsed.expenses,
    edits: parsed.edits,
    reply: parsed.reply,
  };
}

export type { LineItem, Expense };
