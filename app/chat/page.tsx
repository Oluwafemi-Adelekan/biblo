import { Band } from "@/components/ui/Band";
import { Label } from "@/components/ui/Text";
import { Logo } from "@/components/ui/Logo";
import { Chat } from "@/components/Chat";
import { getMessages, getMonth } from "@/lib/data";

export const dynamic = "force-dynamic";

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
        <span className="flex items-center gap-2">
          <Logo size={16} className="text-ink/60" />
          <Label as="h1" tone="dim">
            Biblo
          </Label>
        </span>
        {waiting > 0 ? (
          <span className="bg-amber px-2.5 py-1 text-label uppercase text-ink">
            {waiting} waiting on Claude
          </span>
        ) : null}
      </Band>

      <Chat messages={messages} />
    </div>
  );
}
