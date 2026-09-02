import "server-only";
import { z } from "zod";
import type { Category, Expense, LineItem } from "./schema";

/* ============================================================
   The resident assistant.

   An OpenAI model on Azure that lives in the chat. It files
   receipts and dictated expenses the moment they arrive, answers
   questions about the month with real figures, and holds a normal
   conversation - it is not a form with a personality bolted on.

   Claude stays the source of truth: rows the model files are
   marked ai:true for audit, anything needing an edit to existing
   data is deferred to Claude, and every failure path leaves the
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

/* file  - money happened, here are the rows
   chat  - conversation; nothing to write
   defer - needs Claude (an edit, or money it could not read safely) */
const AiResult = z.object({
  verdict: z.enum(["file", "chat", "defer"]),
  reason: z.string().optional(),
  expenses: z.array(AiExpense).max(20).default([]),
  reply: z.string().min(1).max(900),
});

export type AiReading =
  | { kind: "filed"; expenses: z.infer<typeof AiExpense>[]; reply: string }
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
};

function prompt(categories: Category[], ctx: MonthContext, today: string) {
  const cats = categories.map((c) => `- ${c.id} (${c.name}, ${c.kind})`).join("\n");

  return `You are the assistant inside Biblo, a personal budgeting app built by Femi in Lagos, Nigeria. You live in its chat. Femi is the only user. He talks to you the way he would talk to a person, and you answer the same way.

Today is ${today} (Africa/Lagos). Amounts are naira.

WHO YOU ARE
Plain-spoken, warm, quick. Short sentences. No emoji, no exclamation marks, no corporate filler, never "As an AI". You can talk about anything he brings up - you are not restricted to money talk. When the conversation touches his spending, use the real figures below rather than generalities.

WHAT YOU CAN DO
1. Converse (verdict "chat"). Questions, thinking out loud, banter, advice.
2. File money that happened (verdict "file"): receipts, bank screenshots, dictated spending, money received. One message can hold several expenses; file each.
3. Hand things to Claude (verdict "defer"): edits to entries that already exist, budget or category changes, deleting things, PDFs or spreadsheets, or money you cannot read with confidence. Claude is the senior partner who audits everything you file and handles what you cannot. Deferring is normal, not failure - say naturally that Claude will pick it up.

HIS MONTH SO FAR (${ctx.month})
- spent ${ctx.spent.toLocaleString()} of a ${ctx.budgetTotal.toLocaleString()} budget; income received ${ctx.earned.toLocaleString()} of ${ctx.income.toLocaleString()} expected
${ctx.categoryLines.map((l) => `- ${l}`).join("\n")}

RECENTLY FILED (newest first - also your duplicate check)
${ctx.recentLines.map((l) => `- ${l}`).join("\n") || "- nothing yet"}

CATEGORIES (use the id, never the name)
${cats}

FILING RULES
- Never invent an expense, an amount, or a date. Unreadable figure: defer.
- "5k" is 5,000. "1.5k" is 1,500. "2m" is 2,000,000. "$5,000 Naira" dictated means 5,000 naira.
- Nigerian dates are day-first: 03/04 is 3 April. Cross-check against context; if ambiguous and it matters, defer.
- No date mentioned means today; "yesterday" means the day before.
- amount is always positive; the category's kind carries direction. Money received goes to an income category.
- Receipts that list items MUST be itemised: names as printed (keep sizes - "340g" is part of the price), qty, unit, line total. The expense amount is what was paid.
- Labels are short names, not sentences.
- If it matches something recently filed (same amount, day, place), defer and say it looks already recorded.

Respond with ONLY a JSON object, no markdown fences:
{"verdict":"file"|"chat"|"defer","reason":"for Claude, only when deferring","expenses":[{"date":"YYYY-MM-DD","time":"HH:MM optional","label":"...","amount":1234,"categoryId":"...","method":"transfer optional","note":"optional","items":[{"name":"...","qty":1,"unit":1234,"total":1234}]}],"reply":"what Femi sees"}`;
}

export async function readWithAI(input: {
  text?: string;
  images: { type: string; base64: string }[];
  categories: Category[];
  context: MonthContext;
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

  if (parsed.verdict === "defer" || parsed.expenses.length === 0) {
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
        reason: `The assistant used an unknown category "${e.categoryId}".`,
        reply: parsed.reply,
      };
    }
  }

  return { kind: "filed", expenses: parsed.expenses, reply: parsed.reply };
}

export type { LineItem, Expense };
