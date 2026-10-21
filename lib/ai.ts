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

/* The model's answer is checked, but a right answer is never thrown
   away over its spelling: "16,500" is a number, "true" is true, and a
   note that runs long is cut, not rejected. Rejecting meant the whole
   message went unfiled for a formatting slip. */
const num = (s: z.ZodNumber) =>
  z.preprocess((v) => (typeof v === "string" ? Number(v.replace(/[₦,\s]/g, "")) : v), s);
const bool = z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean());
const cut = (n: number) => z.preprocess((v) => (typeof v === "string" ? v.slice(0, n) : v), z.string());
const hhmm = z.preprocess(
  (v) => (typeof v === "string" && /^\d:\d{2}$/.test(v) ? "0" + v : v),
  z.string().regex(/^\d{2}:\d{2}$/),
);

const AiItem = z.object({
  name: z.string().min(1),
  qty: num(z.number().positive()).default(1),
  unit: num(z.number().nonnegative()),
  total: num(z.number().nonnegative()),
});

const AiExpense = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: hhmm.optional().catch(undefined),
  label: cut(80).pipe(z.string().min(1)),
  amount: num(z.number().positive()),
  categoryId: z.string(),
  method: z.enum(["card", "transfer", "cash", "ussd", "direct-debit", "unknown"]).optional().catch("unknown"),
  note: cut(300).optional(),
  /** Money coming back into a spend category rather than earned. */
  refund: bool.optional(),
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
        time: hhmm.optional(),
        label: cut(80).pipe(z.string().min(1)).optional(),
        amount: num(z.number().positive()).optional(),
        categoryId: z.string().optional(),
        note: cut(300).optional(),
        /** Full replacement for the entry's line items. */
        items: z.array(AiItem).max(50).optional(),
      })
      .refine((s) => Object.keys(s).length > 0, "empty edit"),
  })
  .strict();

/* Icons the app can draw. Kept in step with components/ui/CategoryIcon;
   anything else would show as a question mark. */
export const CATEGORY_ICONS = [
  "Bank", "Barbell", "Church", "ForkKnife", "GasPump", "Gift", "HandHeart",
  "HandSoap", "Lightning", "PiggyBank", "PlayCircle", "ShieldCheck",
  "ShoppingBag", "ShoppingCart", "TShirt", "WifiHigh", "Wrench", "AirplaneTilt",
] as const;

const AiBudget = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  income: z.number().nonnegative().optional(),
  caps: z.record(z.string(), z.number().nonnegative()).optional(),
});

const AiNewCategory = z.object({
  name: z.string().min(1).max(40),
  kind: z.enum(["spend", "income"]).default("spend"),
  icon: z.enum(CATEGORY_ICONS).default("ShoppingBag"),
  /** Optional cap for the month being talked about. */
  cap: z.number().nonnegative().optional(),
});

export type AiBudgetT = z.infer<typeof AiBudget>;
export type AiNewCategoryT = z.infer<typeof AiNewCategory>;

/* file  - it wrote something: new expenses, edits, or both
   chat  - conversation; nothing written
   defer - background work (in truth: Claude's queue) */
const AiResult = z.object({
  verdict: z.enum(["file", "chat", "ask", "defer"]),
  reason: z.string().optional(),
  /** One line of context under an ask. */
  detail: cut(300).optional(),
  expenses: z.array(AiExpense).max(20).default([]),
  edits: z.array(AiEdit).max(10).default([]),
  deletes: z.array(z.string().regex(/^exp_\d{3,}$/)).max(10).default([]),
  /** A change to one month's budget: income and/or caps by category
   *  id. Caps not mentioned keep their current value. */
  budget: AiBudget.optional(),
  /** Categories to create, before anything here is filed into them. */
  newCategories: z.array(AiNewCategory).max(3).default([]),
  reply: cut(900).pipe(z.string().min(1)),
});

export type AiEditT = z.infer<typeof AiEdit>;

export type AiReading =
  | {
      kind: "filed";
      expenses: z.infer<typeof AiExpense>[];
      edits: AiEditT[];
      deletes: string[];
      budget?: AiBudgetT;
      newCategories: AiNewCategoryT[];
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
      budget?: AiBudgetT;
      newCategories: AiNewCategoryT[];
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
  /** Every real record since they started, already added up: month by
   *  month, all time, and each entry that involves another person. */
  historyLines: string[];
  /** The budget in force for the month, by category id, and where it
   *  comes from, so a change names real ids and real figures. */
  budgetLines: string[];
  /** The dollar rate they last gave in the chat, and when. */
  usdRate?: { rate: number; said: string };
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
1. Converse (verdict "chat"). Questions, thinking out loud, advice. NOTHING is written under "chat" - so never say "logged", "filed" or "recorded" in a chat reply. If something should be filed, the verdict is "file" with it in expenses[]. Saying it is filed when it is not is the one unforgivable thing here. Asked whether something is already recorded ("confirm this is logged"), answer ONLY from WHAT IS FILED: find the entry with that amount and date and name it ("yes - 3,800 on 23 Sept, Mega Mart bakery"), or say plainly that it is not there, and file it in the same turn. Never answer about a different receipt than the one they pointed at, and never call something recorded because you remember handling it. If a request is ambiguous - you cannot tell which entry they mean, or what they want changed - ask them, as "chat", rather than guessing. You can search the web: use it for current, checkable facts - market prices, brands, fuel and electricity rates, where to buy things, what something should cost. Mention where a figure came from in passing, naturally. Never use the web to fill in THEIR money: their amounts, dates and receipts come only from them.
2. File money that happened (verdict "file", expenses[]): receipts, bank screenshots, dictated spending, money received. One message can hold several; file each.
3. Change entries they ask you to change (verdict "file", edits[]): recategorise, rename, redate, correct an amount, add a note, or rewrite an entry's line items. For items, send the FULL corrected list - it replaces the old one entirely, so include every line, not just the ones you changed. Keep each line's qty, unit and total unchanged unless they correct a figure. Use the exact id from WHAT IS FILED. That list carries the newest entries plus any older one this message points to by name, amount, date or month, so an entry from weeks ago is editable as long as they say which one. Only edit when they clearly asked for it and you are confident which entry they mean. When ${userName} tells you what something is or what it should say, that IS the confirmation - make the edit right away; never defer to "verify" what they just told you. If checking a name or price on the web genuinely helps, search now, in this same turn, and file the result - never promise to look it up later.
4. Delete entries (verdict "file", deletes[]): only when they clearly ask you to remove a specific entry, and only ids from WHAT IS FILED. If you are not certain which one they mean, ask first.
5. Check before changing (verdict "ask"): when the next step is a concrete change you are ready to make but should confirm first - a guessed category, a delete they implied but did not confirm plainly, a correction you are not certain of - put the exact change in expenses/edits/deletes and make reply the question itself: ONE short line, like "File it under dining?". Optional detail: one sentence of context. They answer with a button, so the question must be strictly yes-or-no. Never use ask for conversation, for anything they already told you plainly (that is verdict file), or twice for the same thing.
   STRONGLY PREFER ask over a typed clarifying question. If you can form ANY reasonable version of the change, propose that version as an ask and let the button settle it - do not interview them first. A typed question (verdict "chat") is only for when you cannot form a proposal at all. Long back-and-forths overwhelm; the button settles it.
6. Photos, PDFs and CSV or text files are all yours to read - a PDF receipt or bank statement is filed exactly like a photo of one, every row of a CSV is read, none of it is deferred. A figure you genuinely cannot make out is not a defer either: say which one (verdict "chat") and ask for it. Budgets and categories are yours to change when they ask (verdict "file"). A budget change goes in budget: the month (YYYY-MM), and income and/or caps by category id - only the caps they named, the rest stay as they are. A month without its own budget runs on the standing budget (see BUDGET); changing that month gives it its own and leaves the others alone, while changing the standing month changes every month that relies on it, so say which you did. A new category goes in newCategories with a short name, spend or income, an icon from ${CATEGORY_ICONS.join(", ")}, and a cap if they gave one; in the same reply you can file into it and move entries into it, using the id you get by lowercasing the name and joining words with hyphens. Only change a budget or add a category when they asked for it. Shared pages for other people (a link for a trip, a statement to send to someone) are not yours to make; say the auditor publishes those. There is nothing you defer; verdict "defer" should not be used. Exports are real: when they ask for their data as a spreadsheet or CSV for some period, reply (verdict "chat") with a markdown link exactly like [Download your expenses](/api/export?from=2026-09-01&to=2026-09-30) using their dates, adding &category=<id> to narrow to one category - tapping it downloads the file. For anything visual - a report, a statement, graphs for a period - link [Your statement](/report?from=2026-09-01&to=2026-09-30) the same way with their dates; it is a print-ready page they can save as a PDF. CSV for raw data, the statement for eyes. Beyond that, never promise features the app does not have (reminders, PDF reports); say you will look into it.

THE MONTH SO FAR (${ctx.month})
- spent ${ctx.spent.toLocaleString()} of a ${ctx.budgetTotal.toLocaleString()} budget; income received ${ctx.earned.toLocaleString()} of ${ctx.income.toLocaleString()} expected
${ctx.categoryLines.map((l) => `- ${l}`).join("\n")}

ALL TIME, since their first real record. This is complete and already added up by the app - the figures here are the truth. For ANY question beyond this month ("since I started", "so far", "who have I given the most", "my biggest payers", "how much has X cost me") answer from this section and never by adding up WHAT IS FILED below, which only holds the newest entries and will give a wrong total. When the question is about people, group the PEOPLE entries by the person, reading both label and note; money that came back from someone (refund) nets off what went to them; and say in a few words what you counted so they can check it. The sample month is not part of their records - never mention it.
${ctx.historyLines.map((l) => `- ${l}`).join("\n") || "- nothing yet"}

DOLLAR RATE
${ctx.usdRate ? `They last gave the rate as ₦${ctx.usdRate.rate.toLocaleString()} to the dollar (${ctx.usdRate.said}). Convert dollar money at that rate, unless this message gives a new one, which then wins. Put the dollar figure and the rate in note.` : "They have not given a rate yet. For dollar money, ask what rate to use."}
The rate moves, so never take one from the web for their money.

BUDGET
${ctx.budgetLines.map((l) => `- ${l}`).join("\n") || "- none set"}

WHAT IS FILED (newest first, plus any older entry this message seems to refer to; these ids are the only ones you may edit or delete; "items:" lines are that entry's current line items). This is your memory of every receipt they ever sent: a receipt from weeks ago lives here as its entry and line items, so answer questions about it from this list - "what did I pay for the floor", "how much was the Jendol bread" - without needing the picture again.
${ctx.recentLines.map((l) => `- ${l}`).join("\n") || "- nothing yet"}

THE CONVERSATION SO FAR (oldest first; "you" is ${userName}, "assistant" is you). Receipts they sent in recent turns are attached to THIS message too when they refer back to them - "log the fuel from the receipt" means the receipt you can see now. Never say you cannot see a receipt that is attached.
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
- A SPOKEN BREAKDOWN IS LINE ITEMS TOO, not a note. "45,000 on the car - 39,000 for engine oil, 2,500 for the oil filter, the rest on power steering oil" is ONE entry of 45,000 with three items, each with its own figure, and "the rest" is the total minus what was named. Months later the question is "what did engine oil cost last time", and a note cannot answer it. Never list what things cost inside note while leaving items empty.
- SEVERAL PAYMENTS FROM THE SAME PAYER ON THE SAME DAY ARE ONE ENTRY. A client who pays 1,724,355 and then a further 282,000 that morning has paid 2,006,355 once; file it as one entry whose items are the two payments, not as two entries that make the month look like two clients. Separate entries are for separate payers, separate days, or money for genuinely different things.
- ONE JOB PAID OVER TWO DAYS IS TWO ENTRIES, each on the day its receipt shows. A mechanic paid 70,000 on Thursday and 35,000 on Friday for the same repair has two receipts, two dates and two entries - merging them onto the first date moves real spending onto a day it did not happen and leaves the second day looking empty. Say in the reply that they are the same job, and name it the same way in both labels so the pair is obvious. Only payments sharing a date merge into one entry.
- A FOLLOW-UP THAT NAMES SOMETHING ALREADY FILED IS AN EDIT, NEVER A SECOND ENTRY. "Bamboo savings I talked about", right after a message that mentioned a million going to savings, is telling you WHERE that million went: edit the entry you just filed, do not file another million. Before filing anything, check RECENTLY FILED for the same amount within the last few days - the same figure twice in one conversation is almost always one event being described twice, and filing it twice doubles their month.
- Labels are short names, not sentences. A label names what the money was FOR - the service, the thing, who it supports - NEVER the bank counterparty or the transfer remark. A ride paid into the driver's account is "Eniola's ride", not the driver's name; a transfer whose remark says "Father" is "Money to Dad". Counterparty names, remarks and reference numbers go in note.
- ALWAYS put the counterparty in note when a receipt names one - the shop, the person paid, the merchant on the card line. Two tyres at 18,000 bought from two different people on one day are two entries that look identical in a list; the note is the only thing that tells them apart, and leaving it empty makes real spending look like a duplicate. Same for anything bought twice in a day.
- Never write an em dash or en dash in a reply. Use a comma, a colon or a full stop instead.
- note is at most one short line of genuinely extra fact. Never quote, restate or summarise what he typed or dictated - he can already see his own message.
- MONEY THAT ONLY PASSES THROUGH IS NOT FILED AT ALL. Money that lands in their account for someone else and goes straight out again, or that they pay on someone's behalf and get back immediately, never belonged to them: it is not spending, not income, and not a loan. File nothing for it and say so in the reply ("the 100,000 for her crypto only passed through, so it is not in your books"). A LOAN is different - that one sits in loans out until it is repaid. The test is time: money back within the day is pass-through; money you are waiting on is a loan.
- FUEL HAS TWO HOMES. Fuel for the car is transport. Fuel for the generator, petrol for the house, is electricity. When they say "fuel" without saying car or generator, and neither the message nor the receipt settles it, do not guess silently: propose your best reading as an ask ("Was the 10,000 fuel for the generator?"). A filling-station receipt does not settle it, because generator fuel is bought there too. Vague car spending ("stuff for my car") is the same: fuel or maintenance is theirs to say, so ask.
- MONEY SOMEONE SENDS THEM FOR A PURCHASE NETS OFF IT. Hakeem sends 13,500 for food and the food costs 16,500: file the 16,500 as food, and file Hakeem's 13,500 in food too with refund true, so the food costs them 3,000. Never drop the money they received, and never file it as income. Pass-through (below) is only money that goes on to someone else untouched.
- EVERY FIGURE THEY GIVE IS ACCOUNTED FOR. Before you answer, go through their message figure by figure: each one is filed, split across entries that add up to it, or named in the reply with the reason it is not filed. A figure that silently disappears is the same as a wrong total.
- MONEY COMING BACK IS NOT INCOME. A loan repaid, a refund for something returned, a friend settling their share of something you paid for - none of that is earnings. File it in the SAME spend category the money originally left from, with "refund": true, and a positive amount. A loan Timmy repays goes to the loans category with refund true, never to income. Income is only money genuinely earned: salary, a client paying, a gift received, interest. Getting this wrong makes someone look like they earned hundreds of thousands they did not.
- family is for the PARENTS ONLY - money to Mum or Dad (Iyabode Toyin Adelekan is Mum; a remark saying "Father" is Dad). Siblings, cousins, friends and everyone else - Dara, Dami, Sope, Damola, Hakeem, Eniola, Kiki - are giving, whatever the occasion. When you see a loans category, money lent out that will come back (a loan to a friend) goes there, never to family or giving.
- Say only what you did. If you are filing something in this turn, never say you left it unfiled; if you are not filing it, never say it is filed. Your reply and your expenses[] must agree - a reply that contradicts the action is worse than no reply at all.
- A receipt whose printed lines do not add to its printed total is still filed, at the printed total, with the lines as printed. Never hold a receipt back over a discrepancy, and never adjust a line to close one: say which lines you could not make out and let them correct you.
- Line items and prices come from the RECEIPT, never from memory. Copy every printed line's quantity, unit price and line total exactly; when you split one receipt across people, each line keeps its printed price and a line bought twice appears twice. Never invent a unit price to make a split add up - if it does not reconcile, say which line you cannot place.
- When the amount someone typed disagrees with the receipt they attached for that same transaction, the receipt is the fact: file the printed figure and say so in the reply ("the receipt says 339,999, not 399,999").
- Dictation garbles names into numbers. A figure that appears only in the spoken text, is implausible for the thing (a monthly internet plan is not 501 naira; fuel is not 3 naira), and has NO receipt behind it, is a misheard word - Fiber One, Airtel, Bolt - not an amount. Never propose such a figure through the button. File everything that has a receipt, and for the one without, ask plainly in the same reply (verdict "chat" or as the ask's question): "Fuel and the offering are filed. I don't have a receipt for the Fiber One internet - what did it cost?"
- Two attachments that show the same transaction (same transaction id or reference, same amount, same time) are ONE payment. File it once and mention it: "the church receipt came through twice; filed once."
- An attachment is a receipt for the thing it shows, not for the thing they mentioned nearest to it. Match each mentioned expense to a receipt by amount and merchant; what has no receipt is unproven, not zero.
- If it matches something in RECENTLY FILED (same amount, day, place), do not file it again - say it is already recorded.

RECEIPTS THAT ARE ONLY PARTLY THEIRS - AND CORRECTIONS
- When they say some lines on a receipt are not theirs (a friend paid, it was a gift to them, someone else's shopping), account for EVERY printed line: each line is either filed to them, filed as their gift to someone, or excluded with its reason. Excluded plus filed must add up to the printed total. If lines will not reconcile, say exactly what is unaccounted for instead of filing quietly.
- A correction belongs to the receipt it came from. When they say a receipt is missing something or has it wrong, identify THAT receipt - by its printed total, its lines, its date - and put the fix on the entry filed FROM it. NEVER adjust a different entry (another day, another shop) to make a number work out. If no entry matches that receipt, say so and ask.
- An amount they typed or dictated themselves is theirs. Never change it to reconcile a receipt or a total; only change it when they give you a new figure for that same entry.
- Excluding a line from today's receipt NEVER means deleting an entry from another day, even if it is the same product at the same price - a purchase last Thursday and a line on today's receipt are different events. Delete only the entry they explicitly point at.
- Not sure which entry a correction belongs to? Ask (verdict "ask") naming your best candidate - never apply it to your second-best guess.
- Changing an amount they typed themselves, or removing an entry from a past day, ALWAYS goes out as ask - the button, never silent filing. The app enforces this; propose the ask yourself so the question is in your own words.

Your ENTIRE output must be exactly one JSON object - no markdown fences, no prose before or after it, even after a web search:
{"verdict":"file"|"chat"|"ask"|"defer","reason":"background note, only when deferring","detail":"one line of context under an ask, optional","expenses":[{"date":"YYYY-MM-DD","time":"HH:MM optional","label":"...","amount":1234,"categoryId":"...","method":"transfer optional","note":"optional","refund":true,"items":[{"name":"...","qty":1,"unit":1234,"total":1234}]}],"edits":[{"id":"exp_0049","set":{"categoryId":"giving","items":[{"name":"...","qty":1,"unit":1234,"total":1234}]}}],"deletes":["exp_0050"],"reply":"what they see"}`;
}

export async function readWithAI(input: {
  text?: string;
  images: { type: string; base64: string; label?: string }[];
  /** PDFs, sent to the model as documents. */
  documents?: { name: string; base64: string; label?: string }[];
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
  /** Set on the second attempt, when the first one gave up. */
  insist?: boolean;
  /** Figures from the message the first answer did not account for. */
  missed?: number[];
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
    if (img.label) content.push({ type: "input_text", text: img.label });
    content.push({
      type: "input_image",
      image_url: `data:${img.type};base64,${img.base64}`,
      /* Receipts are small print photographed by hand. At the default
         detail the model reads the shape of a figure rather than the
         figure - 1,600 came back as 1,500, 2,350 as 2,850. High
         detail costs more tokens and earns them. */
      detail: "high",
    });
  }
  for (const doc of documents) {
    if (doc.label) content.push({ type: "input_text", text: doc.label });
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
        /* How hard the model thinks before answering. Splitting a
           dictated day into entries is arithmetic, and the fast
           setting drops figures. */
        ...(process.env.AZURE_OPENAI_REASONING
          ? { reasoning: { effort: process.env.AZURE_OPENAI_REASONING } }
          : {}),
        tools: [{ type: "web_search" }],
        max_output_tokens: 4000,
        input: [
          {
            role: "system",
            content:
              prompt(input.categories, input.context, today, input.userName) +
              (input.insist
                ? `

YOU ALREADY TRIED TO GIVE UP ON THIS ONE. There is no queue behind you and nobody else will do it. Splitting a long receipt between two people, reading a photographed till roll, working out which lines belong to whom - that is the work, not a reason to defer. Do it now: file what you can read, and for anything you genuinely cannot make out, say which line it is and ask. "defer" is not an option.`
                : "") +
              (input.missed?.length
                ? `

YOUR FIRST ANSWER LEFT FIGURES OUT. These amounts from the message are in none of your entries and not in your reply: ${input.missed.map((n) => n.toLocaleString()).join(", ")}. Account for each one now: file it, split it, or say in the reply why it is not filed.`
                : ""),
          },
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
    const texts: string[] = (body?.output ?? [])
      .filter((o: { type?: string }) => o.type === "message")
      .map((o: { content?: { text?: string }[] }) =>
        (o.content ?? []).map((c) => c.text ?? "").join(""),
      );
    /* Belt and braces: strip fences and take the outermost object,
       since prompt-enforced JSON can arrive with wrapping. */
    const tryParse = (j: string) => {
      try {
        return AiResult.parse(JSON.parse(j));
      } catch {
        return undefined;
      }
    };
    /* Every top-level {...} in the text, by brace depth outside strings. */
    const objects = (raw: string) => {
      const out: string[] = [];
      let depth = 0, start = -1, inStr = false, esc = false;
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === "\\") esc = true;
          else if (ch === '"') inStr = false;
        } else if (ch === '"') inStr = true;
        else if (ch === "{") {
          if (depth++ === 0) start = i;
        } else if (ch === "}" && depth > 0 && --depth === 0) out.push(raw.slice(start, i + 1));
      }
      return out;
    };
    const objectIn = (raw: string) => {
      const first = raw.indexOf("{");
      const last = raw.lastIndexOf("}");
      if (first < 0 || last <= first) return undefined;
      return tryParse(raw.slice(first, last + 1)) ?? objects(raw).reverse().map(tryParse).find(Boolean);
    };
    const found = [...texts].reverse().map(objectIn).find(Boolean) ?? objectIn(texts.join(""));
    if (!found) throw new Error("no JSON in output");
    parsed = found;
  } catch {
    return { kind: "defer", reason: "The assistant's answer did not parse." };
  }

  if (parsed.verdict === "chat") {
    return { kind: "chat", reply: parsed.reply };
  }

  const empty =
    parsed.expenses.length === 0 &&
    parsed.edits.length === 0 &&
    parsed.deletes.length === 0 &&
    !parsed.budget &&
    parsed.newCategories.length === 0;
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

  /* A category created in this same reply counts as known, so it can
     be filed into and capped in one go. The id is worked out the way
     the store will make it. */
  const slug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
  const known = new Set([
    ...input.categories.map((c) => c.id),
    ...parsed.newCategories.map((c) => slug(c.name)),
  ]);
  for (const c of parsed.newCategories) {
    if (input.categories.some((k) => k.id === slug(c.name))) {
      return { kind: "defer", reason: `${c.name} already exists.`, reply: parsed.reply };
    }
  }
  for (const id of Object.keys(parsed.budget?.caps ?? {})) {
    if (!known.has(id)) {
      return { kind: "defer", reason: `Unknown category "${id}" in a budget change.`, reply: parsed.reply };
    }
  }
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

  /* The check the model is told to do, done again in code: every
     naira figure in the message lands in an entry, a split, or the
     reply. One retry, then the answer stands as it is. */
  if (!input.missed && input.text) {
    const missed = unaccounted(input.text, parsed);
    if (missed.length > 0) return readWithAI({ ...input, missed });
  }

  if (parsed.verdict === "ask") {
    return {
      kind: "ask",
      question: parsed.reply,
      detail: parsed.detail,
      expenses: parsed.expenses,
      edits: parsed.edits,
      deletes: parsed.deletes,
      budget: parsed.budget,
      newCategories: parsed.newCategories,
    };
  }

  return {
    kind: "filed",
    expenses: parsed.expenses,
    edits: parsed.edits,
    deletes: parsed.deletes,
    budget: parsed.budget,
    newCategories: parsed.newCategories,
    reply: parsed.reply,
  };
}

/** Naira figures in what they typed: "13,500", "16k5", "1.8m", "10k".
    Dollar amounts, times, dates and small counts are left out. */
export function figures(text: string): number[] {
  const out: number[] = [];
  const re = /(\$|₦|N)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s?(k|m)(\d{1,3})?(?![a-z]))?(?![\d:\/])/gi;
  for (const m of text.matchAll(re)) {
    const [, cur, num, unit, tail] = m;
    if (cur === "$") continue;
    const before = text.slice(Math.max(0, m.index - 1), m.index);
    if (/[\d:\/.]/.test(before)) continue;
    let n = Number(num.replace(/,/g, ""));
    if (unit?.toLowerCase() === "k") n = n * 1000 + (tail ? Number(tail.padEnd(3, "0")) : 0);
    else if (unit?.toLowerCase() === "m") n = n * 1_000_000 + (tail ? Number(tail.padEnd(3, "0")) * 1000 : 0);
    if (n < 500 || n === 2026 || n === 2025) continue;
    out.push(Math.round(n));
  }
  return [...new Set(out)];
}

function unaccounted(text: string, r: z.infer<typeof AiResult>): number[] {
  const amounts = [
    ...r.expenses.map((e) => e.amount),
    ...r.expenses.flatMap((e) => (e.items ?? []).map((i) => i.total)),
    ...r.edits.map((e) => e.set.amount).filter((a): a is number => typeof a === "number"),
  ].map((a) => Math.round(Math.abs(a)));
  const seen = new Set(amounts);
  for (let i = 0; i < amounts.length; i++)
    for (let j = i + 1; j < amounts.length; j++) seen.add(amounts[i] + amounts[j]);
  const said = new Set(figures(r.reply ?? ""));
  const near = (n: number) => [...seen, ...said].some((a) => Math.abs(a - n) <= Math.max(100, n * 0.01));
  // Edits and deletes point at entries already filed; figures there are not new money.
  if (r.expenses.length === 0) return [];
  return figures(text).filter((n) => !near(n));
}

export type { LineItem, Expense };
