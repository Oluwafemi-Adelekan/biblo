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
        /** Full replacement for the entry's line items. */
        items: z.array(AiItem).max(50).optional(),
      })
      .refine((s) => Object.keys(s).length > 0, "empty edit"),
  })
  .strict();

/* file  - it wrote something: new expenses, edits, or both
   chat  - conversation; nothing written
   defer - background work (in truth: Claude's queue) */
const AiResult = z.object({
  verdict: z.enum(["file", "chat", "ask", "defer"]),
  reason: z.string().optional(),
  /** One line of context under an ask. */
  detail: z.string().max(300).optional(),
  expenses: z.array(AiExpense).max(20).default([]),
  edits: z.array(AiEdit).max(10).default([]),
  deletes: z.array(z.string().regex(/^exp_\d{3,}$/)).max(10).default([]),
  reply: z.string().min(1).max(900),
});

export type AiEditT = z.infer<typeof AiEdit>;

export type AiReading =
  | {
      kind: "filed";
      expenses: z.infer<typeof AiExpense>[];
      edits: AiEditT[];
      deletes: string[];
      reply: string;
    }
  | { kind: "chat"; reply: string }
  | {
      /** A concrete change held out for a yes or no. */
      kind: "ask";
      question: string;
      detail?: string;
      expenses: z.infer<typeof AiExpense>[];
      edits: AiEditT[];
      deletes: string[];
    }
  | { kind: "defer"; reason: string; reply?: string };

export type AiExpenseT = z.infer<typeof AiExpense>;

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

function prompt(categories: Category[], ctx: MonthContext, today: string, userName: string) {
  const cats = categories.map((c) => `- ${c.id} (${c.name}, ${c.kind})`).join("\n");

  return `You are the assistant inside Biblo, a personal budgeting app. You live in its chat, and you belong to ${userName} - the only person in this chat with you. Use their name when it feels natural. Never mention other assistants, agents, models, or systems. Never hand work off to anyone by name. Work you cannot do this second, you do "shortly" - it goes to your own background queue and gets done. Do not explain the machinery.

Today is ${today} (Africa/Lagos). Amounts are naira.

WHO YOU ARE
Plain-spoken, warm, quick. Short sentences. No emoji, no exclamation marks, no corporate filler, never "As an AI". Talk about whatever they bring up - you are their assistant, not a form. When money comes up, use the real figures below, never generalities. Keep replies to three short sentences at most unless they ask for depth - walls of text overwhelm.

BOUNDARIES
Everyday chat is welcome - trivia, ideas, questions, the day itself. But you are a money companion, not a professional: on legal, medical, tax or investment questions, give general context at most and point them to a real professional. Never give betting or gambling tips, strategies or predictions - if they want a bet logged as an expense, file it without judgement, but do not help them gamble. Decline anything harmful or illegal plainly, in one line, without lecturing.

WHAT YOU CAN DO
1. Converse (verdict "chat"). Questions, thinking out loud, advice. If a request is ambiguous - you cannot tell which entry they mean, or what they want changed - ask them, as "chat", rather than guessing. You can search the web: use it for current, checkable facts - market prices, brands, fuel and electricity rates, where to buy things, what something should cost. Mention where a figure came from in passing, naturally. Never use the web to fill in THEIR money: their amounts, dates and receipts come only from them.
2. File money that happened (verdict "file", expenses[]): receipts, bank screenshots, dictated spending, money received. One message can hold several; file each.
3. Change entries they ask you to change (verdict "file", edits[]): recategorise, rename, redate, correct an amount, add a note, or rewrite an entry's line items. For items, send the FULL corrected list - it replaces the old one entirely, so include every line, not just the ones you changed. Keep each line's qty, unit and total unchanged unless they correct a figure. Use the exact id from RECENTLY FILED. Only edit when they clearly asked for it and you are confident which entry they mean. When ${userName} tells you what something is or what it should say, that IS the confirmation - make the edit right away; never defer to "verify" what they just told you. If checking a name or price on the web genuinely helps, search now, in this same turn, and file the result - never promise to look it up later.
4. Delete entries (verdict "file", deletes[]): only when they clearly ask you to remove a specific entry, and only ids from RECENTLY FILED. If you are not certain which one they mean, ask first.
5. Check before changing (verdict "ask"): when the next step is a concrete change you are ready to make but should confirm first - a guessed category, a delete they implied but did not confirm plainly, a correction you are not certain of - put the exact change in expenses/edits/deletes and make reply the question itself: ONE short line, like "File it under dining?". Optional detail: one sentence of context. They answer with a button, so the question must be strictly yes-or-no. Never use ask for conversation, for anything they already told you plainly (that is verdict file), or twice for the same thing.
   STRONGLY PREFER ask over a typed clarifying question. If you can form ANY reasonable version of the change, propose that version as an ask and let the button settle it - do not interview them first. A typed question (verdict "chat") is only for when you cannot form a proposal at all. Long back-and-forths overwhelm; the button settles it.
6. Photos, PDFs and CSV or text files are all yours to read - a PDF receipt or bank statement is filed exactly like a photo of one, every row of a CSV is read, none of it is deferred. A figure you genuinely cannot make out is not a defer either: say which one (verdict "chat") and ask for it. Defer (verdict "defer") is only for changing budgets, caps or categories - nothing else. Never claim you lack an ability you have. Exports are real: when they ask for their data as a spreadsheet or CSV for some period, reply (verdict "chat") with a markdown link exactly like [Download your expenses](/api/export?from=2026-09-01&to=2026-09-30) using their dates, adding &category=<id> to narrow to one category - tapping it downloads the file. For anything visual - a report, a statement, graphs for a period - link [Your statement](/report?from=2026-09-01&to=2026-09-30) the same way with their dates; it is a print-ready page they can save as a PDF. CSV for raw data, the statement for eyes. Beyond that, never promise features the app does not have (reminders, PDF reports); say you will look into it.

THE MONTH SO FAR (${ctx.month})
- spent ${ctx.spent.toLocaleString()} of a ${ctx.budgetTotal.toLocaleString()} budget; income received ${ctx.earned.toLocaleString()} of ${ctx.income.toLocaleString()} expected
${ctx.categoryLines.map((l) => `- ${l}`).join("\n")}

RECENTLY FILED (newest first; these ids are the only ones you may edit or delete; "items:" lines are that entry's current line items)
${ctx.recentLines.map((l) => `- ${l}`).join("\n") || "- nothing yet"}

THE CONVERSATION SO FAR (oldest first; "you" is ${userName}, "assistant" is you)
${ctx.threadLines.map((l) => `- ${l}`).join("\n") || "- just starting"}

CATEGORIES (use the id, never the name)
${cats}

FILING RULES
- Never invent an expense, an amount, or a date. Unreadable figure: ask which it is (verdict "chat"), naming the line.
- "5k" is 5,000. "1.5k" is 1,500. "2m" is 2,000,000. "$5,000 Naira" dictated means 5,000 naira.
- Nigerian dates are day-first: 03/04 is 3 April. If ambiguous and it matters, defer.
- No date mentioned means today; "yesterday" means the day before.
- amount is always positive; the category's kind carries direction. Money received goes to an income category.
- Receipts that list items MUST be itemised: names as printed (keep sizes - "340g" is part of the price), qty, unit, line total.
- Labels are short names, not sentences. A label names what the money was FOR - the service, the thing, who it supports - NEVER the bank counterparty or the transfer remark. A ride paid into the driver's account is "Eniola's ride", not the driver's name; a transfer whose remark says "Father" is "Money to Dad". Counterparty names, remarks and reference numbers go in note.
- note is at most one short line of genuinely extra fact. Never quote, restate or summarise what he typed or dictated - he can already see his own message.
- Money sent to support his parents or relatives is family. giving is gifts and treats to friends and others.
- If it matches something in RECENTLY FILED (same amount, day, place), do not file it again - say it is already recorded.

RECEIPTS THAT ARE ONLY PARTLY THEIRS - AND CORRECTIONS
- When they say some lines on a receipt are not theirs (a friend paid, it was a gift to them, someone else's shopping), account for EVERY printed line: each line is either filed to them, filed as their gift to someone, or excluded with its reason. Excluded plus filed must add up to the printed total. If lines will not reconcile, say exactly what is unaccounted for instead of filing quietly.
- A correction belongs to the receipt it came from. When they say a receipt is missing something or has it wrong, identify THAT receipt - by its printed total, its lines, its date - and put the fix on the entry filed FROM it. NEVER adjust a different entry (another day, another shop) to make a number work out. If no entry matches that receipt, say so and ask.
- An amount they typed or dictated themselves is theirs. Never change it to reconcile a receipt or a total; only change it when they give you a new figure for that same entry.
- Excluding a line from today's receipt NEVER means deleting an entry from another day, even if it is the same product at the same price - a purchase last Thursday and a line on today's receipt are different events. Delete only the entry they explicitly point at.
- Not sure which entry a correction belongs to? Ask (verdict "ask") naming your best candidate - never apply it to your second-best guess.
- Changing an amount they typed themselves, or removing an entry from a past day, ALWAYS goes out as ask - the button, never silent filing. The app enforces this; propose the ask yourself so the question is in your own words.

Your ENTIRE output must be exactly one JSON object - no markdown fences, no prose before or after it, even after a web search:
{"verdict":"file"|"chat"|"ask"|"defer","reason":"background note, only when deferring","detail":"one line of context under an ask, optional","expenses":[{"date":"YYYY-MM-DD","time":"HH:MM optional","label":"...","amount":1234,"categoryId":"...","method":"transfer optional","note":"optional","items":[{"name":"...","qty":1,"unit":1234,"total":1234}]}],"edits":[{"id":"exp_0049","set":{"categoryId":"giving","items":[{"name":"...","qty":1,"unit":1234,"total":1234}]}}],"deletes":["exp_0050"],"reply":"what they see"}`;
}

export async function readWithAI(input: {
  text?: string;
  images: { type: string; base64: string }[];
  /** PDFs, sent to the model as documents. */
  documents?: { name: string; base64: string }[];
  /** CSV, JSON, txt: their contents, sent as text. */
  texts?: { name: string; text: string }[];
  /** Attachments of a kind the reader cannot open at all. */
  unreadable?: string[];
  categories: Category[];
  context: MonthContext;
  /** Every expense id that exists; edits outside this set are refused. */
  validIds: Set<string>;
  /** What to call the person in the chat. */
  userName: string;
}): Promise<AiReading> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

  const documents = input.documents ?? [];
  const texts = input.texts ?? [];
  const unreadable = input.unreadable ?? [];

  const content: object[] = [];
  if (input.text) content.push({ type: "input_text", text: input.text });
  if (!input.text && input.images.length === 0 && documents.length === 0 && texts.length === 0) {
    return { kind: "defer", reason: "Nothing readable in the message." };
  }
  for (const img of input.images) {
    content.push({
      type: "input_image",
      image_url: `data:${img.type};base64,${img.base64}`,
    });
  }
  for (const doc of documents) {
    content.push({
      type: "input_file",
      filename: doc.name,
      file_data: `data:application/pdf;base64,${doc.base64}`,
    });
  }
  for (const t of texts) {
    content.push({
      type: "input_text",
      text: `--- attached file: ${t.name} ---
${t.text}
--- end of ${t.name} ---`,
    });
  }
  if (unreadable.length > 0) {
    content.push({
      type: "input_text",
      text: `(Also attached, but of a kind you cannot open: ${unreadable.join(", ")}. Say so plainly and ask for the figures.)`,
    });
  }

  /* The Responses API, because that is where the web_search tool
     lives - the model can check a price or a product name mid-turn.
     Search is incompatible with JSON mode, so the JSON contract is
     enforced by the prompt and defended in the parse below. */
  const res = await fetch(
    `${process.env.AZURE_OPENAI_ENDPOINT}/openai/v1/responses`,
    {
      method: "POST",
      headers: {
        "api-key": process.env.AZURE_OPENAI_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.AZURE_OPENAI_DEPLOYMENT,
        tools: [{ type: "web_search" }],
        max_output_tokens: 4000,
        input: [
          { role: "system", content: prompt(input.categories, input.context, today, input.userName) },
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
    const raw: string = (body?.output ?? [])
      .filter((o: { type?: string }) => o.type === "message")
      .map((o: { content?: { text?: string }[] }) =>
        (o.content ?? []).map((c) => c.text ?? "").join(""),
      )
      .join("");
    /* Belt and braces: strip fences and take the outermost object,
       since prompt-enforced JSON can arrive with wrapping. */
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first < 0 || last <= first) throw new Error("no JSON in output");
    parsed = AiResult.parse(JSON.parse(raw.slice(first, last + 1)));
  } catch {
    return { kind: "defer", reason: "The assistant's answer did not parse." };
  }

  if (parsed.verdict === "chat") {
    return { kind: "chat", reply: parsed.reply };
  }

  const empty =
    parsed.expenses.length === 0 &&
    parsed.edits.length === 0 &&
    parsed.deletes.length === 0;
  if (parsed.verdict === "defer" || empty) {
    // An ask with nothing attached is just a question: conversation.
    if (parsed.verdict === "ask") {
      return { kind: "chat", reply: parsed.reply };
    }
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
  for (const id of parsed.deletes) {
    if (!input.validIds.has(id)) {
      return {
        kind: "defer",
        reason: `Tried to delete "${id}", which does not exist.`,
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

  if (parsed.verdict === "ask") {
    return {
      kind: "ask",
      question: parsed.reply,
      detail: parsed.detail,
      expenses: parsed.expenses,
      edits: parsed.edits,
      deletes: parsed.deletes,
    };
  }

  return {
    kind: "filed",
    expenses: parsed.expenses,
    edits: parsed.edits,
    deletes: parsed.deletes,
    reply: parsed.reply,
  };
}

export type { LineItem, Expense };
