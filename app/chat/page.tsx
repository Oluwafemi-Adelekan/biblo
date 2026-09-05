import { Band } from "@/components/ui/Band";
import { requirePin } from "@/lib/pin";
import { Wordmark } from "@/components/ui/Text";
import { Logo } from "@/components/ui/Logo";
import { Chat } from "@/components/Chat";
import { RefreshWhilePending } from "@/components/RefreshWhilePending";
import { getCategories, getExpenses, getMessages, getMonth } from "@/lib/data";

export const dynamic = "force-dynamic";
/* The send action runs on this route, and the reader's work rides on
   its after() window; the Hobby default of 10s is not enough for a
   photo plus a model call. */
export const maxDuration = 60;

export default async function ChatPage() {
  await requirePin();
  const [messages, m, all, cats] = await Promise.all([
    getMessages(),
    getMonth(),
    getExpenses(),
    getCategories(),
  ]);
  const waiting = m.pending.length;

  /* Messages that filed or changed an expense carry its id; the
     widget under them needs the substance too, so look each one up
     once here where the data lives. */
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const expenses: Record<
    string,
    { label: string; amount: number; date: string; category: string; items: number }
  > = {};
  for (const msg of messages) {
    const id = msg.expenseId;
    if (!id || expenses[id]) continue;
    const e = all.find((x) => x.id === id);
    if (e) {
      expenses[id] = {
        label: e.label,
        amount: e.amountNGN,
        date: e.date,
        category: catName.get(e.categoryId) ?? e.categoryId,
        items: e.items?.length ?? 0,
      };
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <Band
        tone="sage"
        pad="none"
        className="sticky top-0 z-10 flex items-center justify-between bg-sage px-5 py-4"
      >
        <span className="flex items-center gap-1">
          <Logo size={24} className="text-ink" />
          <Wordmark text="biblo" className="text-[1.15rem]" />
        </span>
        {/* No count tag: the thread itself shows work in motion. */}
      </Band>

      <Chat messages={messages} expenses={expenses} />
      <RefreshWhilePending active={waiting > 0} />
    </div>
  );
}
