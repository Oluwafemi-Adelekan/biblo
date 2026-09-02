import { Band } from "@/components/ui/Band";
import { Wordmark } from "@/components/ui/Text";
import { Logo } from "@/components/ui/Logo";
import { Chat } from "@/components/Chat";
import { RefreshWhilePending } from "@/components/RefreshWhilePending";
import { getMessages, getMonth } from "@/lib/data";

export const dynamic = "force-dynamic";
/* The send action runs on this route, and the reader's work rides on
   its after() window; the Hobby default of 10s is not enough for a
   photo plus a model call. */
export const maxDuration = 60;

export default async function ChatPage() {
  const [messages, m] = await Promise.all([getMessages(), getMonth()]);
  const waiting = m.pending.length;

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
        {waiting > 0 ? (
          <span className="bg-amber px-2.5 py-1 text-label uppercase text-ink">
            {waiting} waiting on Claude
          </span>
        ) : null}
      </Band>

      <Chat messages={messages} />
      <RefreshWhilePending active={waiting > 0} />
    </div>
  );
}
