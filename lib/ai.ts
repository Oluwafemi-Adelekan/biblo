import "server-only";
import { z } from "zod";
import type { Category, Expense, LineItem } from "./schema";

/* ============================================================
   The resident reader.

   An OpenAI model on Azure reads what Femi sends the moment it
   arrives — receipt photos, rambling dictations with four expenses
   in them — and files what it is sure about. Claude stays the
   source of truth: every row the model files is marked ai:true so
   it can be audited and overridden, and anything the model is not
   sure about is left for Claude instead of guessed at.

   The key is a friend's Azure resource. Server-side only, never
   NEXT_PUBLIC_, and every call is one message in, one JSON out.
   ============================================================ */

export function aiConfigured() {
  return Boolean(
    process.env.AZURE_OPENAI_ENDPOINT &&
      process.env.AZURE_OPENAI_KEY &&
      process.env.AZURE_OPENAI_DEPLOYMENT,
  );
}

/* What the model is allowed to hand back. Anything that does not
   parse against this is treated as "defer to Claude", never patched
   up: a half-valid expense is worse than a waiting one. */
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

const AiResult = z.object({
  verdict: z.enum(["file", "defer"]),
  reason: z.string().optional(),
  expenses: z.array(AiExpense).max(20).default([]),
  reply: z.string().min(1).max(600),
});

export type AiReading =
  | { kind: "filed"; expenses: z.infer<typeof AiExpense>[]; reply: string }
  | { kind: "defer"; reason: string };

function prompt(categories: Category[], recent: Expense[], today: string) {
  const cats = categories
    .map((c) => `- ${c.id} (${c.name}, ${c.kind})`)
    .join("\n");
  const seen = recent
    .map(
      (e) =>
        `- ${e.date} ${e.label} ${Math.abs(e.amountNGN)} [${e.categoryId}]`,
    )
    .join("\n");

  return `You read expense messages for Biblo, a personal budgeting app used by Femi in Lagos, Nigeria. He sends receipt photos, bank app screenshots, and free-form or dictated text. Turn what he sent into expenses.

Today is ${today} (Africa/Lagos).

CATEGORIES (use the id, never the name):
${cats}

RECENTLY FILED (for spotting duplicates):
${seen || "- nothing yet"}

RULES
- Never invent an expense, an amount, or a date. If a figure is unreadable, defer.
- "5k" means 5,000 naira. "1.5k" is 1,500. "2m" is 2,000,000. "$5,000 Naira" in a dictation means 5,000 naira.
- Nigerian dates are day-first: 03/04 is 3 April. But cross-check against printed times and context; some POS systems print month-first. If the date is ambiguous and matters, defer.
- No date mentioned means today. "Yesterday" means the day before today.
- amount is always positive; the category's kind decides direction. Money received (salary, gifts in) goes to an income category.
- One message can hold several expenses. File each separately. A dictation listing four things is four expenses.
- Every receipt that lists items MUST be itemised: name as printed (keep sizes like "340g" - the size is part of the price), qty, unit price, line total. The expense amount is what was actually paid.
- Labels are short names ("Fuel, full tank"), never sentences.
- If something he sent matches a recently filed expense (same amount, same day, same merchant), defer and say it looks like a duplicate.
- If you cannot tell which category fits, or the image is not a financial document at all, defer.
- reply is 1-2 short sentences in plain English: what you filed with amounts and categories, or why you deferred. No emoji, no exclamation marks, no preamble.

Respond with ONLY a JSON object, no markdown fences:
{"verdict":"file"|"defer","reason":"only when deferring","expenses":[{"date":"YYYY-MM-DD","time":"HH:MM optional","label":"...","amount":1234,"categoryId":"...","method":"transfer optional","note":"optional","items":[{"name":"...","qty":1,"unit":1234,"total":1234}]}],"reply":"..."}`;
}

export async function readWithAI(input: {
  text?: string;
  images: { type: string; base64: string }[];
  categories: Category[];
  recent: Expense[];
}): Promise<AiReading> {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Africa/Lagos",
  });

  const content: object[] = [];
  if (input.text) content.push({ type: "text", text: `He wrote: ${input.text}` });
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
          { role: "system", content: prompt(input.categories, input.recent, today) },
          { role: "user", content },
        ],
      }),
    },
  );

  if (!res.ok) {
    return {
      kind: "defer",
      reason: `The reader could not be reached (${res.status}).`,
    };
  }

  let parsed: z.infer<typeof AiResult>;
  try {
    const body = await res.json();
    const raw = body?.choices?.[0]?.message?.content ?? "";
    parsed = AiResult.parse(JSON.parse(raw));
  } catch {
    return { kind: "defer", reason: "The reader's answer did not parse." };
  }

  if (parsed.verdict === "defer" || parsed.expenses.length === 0) {
    return {
      kind: "defer",
      reason: parsed.reason || parsed.reply || "The reader was not sure.",
    };
  }

  // The model only gets to use categories that exist.
  const known = new Set(input.categories.map((c) => c.id));
  for (const e of parsed.expenses) {
    if (!known.has(e.categoryId)) {
      return {
        kind: "defer",
        reason: `The reader used an unknown category "${e.categoryId}".`,
      };
    }
  }

  return { kind: "filed", expenses: parsed.expenses, reply: parsed.reply };
}

export type { LineItem };
