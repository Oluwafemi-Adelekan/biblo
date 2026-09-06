import { z } from "zod";

/* ============================================================
   The shape of everything on disk. Validated on every read, so a
   bad write fails at the source instead of rendering as NaN.
   ============================================================ */

export const Method = z.enum([
  "card",
  "transfer",
  "cash",
  "ussd",
  "direct-debit",
  "unknown",
]);
export type Method = z.infer<typeof Method>;

/** Where an entry came from, and whether a human should look at it. */
export const Entry = z.object({
  /** typed in the app, a photo, imported from a statement, or seeded. */
  how: z.enum(["typed", "photo", "import", "sample"]),
  /** Exactly what was typed, kept verbatim so it can be re-read. */
  raw: z.string().optional(),
  photo: z.string().optional(),
  at: z.string(),
  /** The app matched the category by keyword rather than being told. */
  guessed: z.boolean().default(false),
  /** Filed by the resident OpenAI assistant rather than by Femi or
   *  Claude. What Claude audits. */
  ai: z.boolean().optional(),
  /** Later changed by the assistant on Femi's instruction. Audited
   *  the same way. */
  aiEdited: z.boolean().optional(),
  /** Set only when something needs a human. The text is shown as-is. */
  check: z.string().optional(),
});
export type Entry = z.infer<typeof Entry>;

/** One line off a receipt. Kept so prices can be compared over time:
 *  a total tells you what the shop cost, an item tells you what the
 *  rice cost. */
export const LineItem = z.object({
  name: z.string(),
  qty: z.number().default(1),
  /** Price of one, in Naira. */
  unit: z.number(),
  /** qty x unit as the receipt printed it, since shops round. */
  total: z.number(),
});
export type LineItem = z.infer<typeof LineItem>;

export const Expense = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  /** What it was. "Fuel", "Lunch at The Place", "Light bill". */
  label: z.string(),
  /** Negative = money out, positive = money in. */
  amount: z.number(),
  currency: z.enum(["NGN", "USD", "GBP", "EUR"]).default("NGN"),
  amountNGN: z.number(),
  categoryId: z.string(),
  method: Method.default("unknown"),
  note: z.string().optional(),
  /** Empty for anything that was not itemised. */
  items: z.array(LineItem).default([]),
  entry: Entry,
});
export type Expense = z.infer<typeof Expense>;

export const Category = z.object({
  id: z.string(),
  name: z.string(),
  /** Phosphor icon name. Phosphor is the only pack. */
  icon: z.string(),
  /** Optional heading two or more categories sit under. */
  group: z.string().optional(),
  /** Words the app matches typed text against to guess a category. */
  matches: z.array(z.string()).default([]),
  kind: z.enum(["spend", "income"]).default("spend"),
});
export type Category = z.infer<typeof Category>;

export const Budget = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  /** What comes in. */
  income: z.number(),
  /** Sum of caps. Kept explicit so a mismatch is visible. */
  total: z.number(),
  caps: z.record(z.string(), z.number()),
});
export type Budget = z.infer<typeof Budget>;

/** Anything sent along with a message: a receipt photo, a screenshot,
 *  a PDF statement, a CSV. The app stores all of them; which ones it
 *  can read on its own is a separate question. */
export const Attachment = z.object({
  name: z.string(),
  /** MIME type as reported by the browser. */
  type: z.string(),
  size: z.number(),
  /** Path under /public, or a Supabase Storage URL once hosted. */
  url: z.string(),
});
export type Attachment = z.infer<typeof Attachment>;

/** One line in the thread. This is the whole input surface of the app:
 *  you send a message, the app answers what it can, and anything it
 *  cannot answer waits for Claude to reply in the same thread. */
export const Message = z.object({
  id: z.string(),
  at: z.string(),
  from: z.enum(["you", "app", "claude", "ai"]),
  text: z.string().optional(),
  attachments: z.array(Attachment).default([]),
  /** Set when this message produced an expense. */
  expenseId: z.string().optional(),
  /** pending = still waiting on Claude. Only ever set on "you". */
  status: z.enum(["done", "pending"]).default("done"),
  /** Structured state riding on an assistant message. An approval is
   *  a question with the exact change attached: the composer becomes
   *  the card, a button answers it, and the proposal is applied or
   *  dropped. Stored inside the attachments jsonb (no new column)
   *  and lifted out by the row mappers. */
  meta: z
    .object({
      /** Every expense this message filed or changed, when there was
       *  more than one - expenseId alone only holds the first. */
      expenseIds: z.array(z.string()).optional(),
      approval: z
        .object({
          state: z.enum(["open", "approved", "denied"]),
          detail: z.string().optional(),
          proposal: z.object({
            expenses: z.array(z.record(z.string(), z.unknown())).default([]),
            edits: z.array(z.record(z.string(), z.unknown())).default([]),
            deletes: z.array(z.string()).default([]),
          }),
          /** The original message text, kept for entry.raw on filing. */
          raw: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});
export type Message = z.infer<typeof Message>;

export const Config = z.object({
  wordmark: z.string(),
  currency: z.literal("NGN"),
  locale: z.string(),
  activeMonth: z.string().regex(/^\d{4}-\d{2}$/),
  owner: z.object({ name: z.string(), initials: z.string() }),
  rates: z.record(z.string(), z.number()),
  /** A completed month kept viewable as an example. */
  demoMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});
export type Config = z.infer<typeof Config>;
