import { Flame } from "@phosphor-icons/react/ssr";
import { Band } from "@/components/ui/Band";
import { Label } from "@/components/ui/Text";
import { SettingsPanel } from "@/components/SettingsPanel";
import { getExpenses } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { viewerEmail } from "@/lib/viewer";
import { requirePin } from "@/lib/pin";

export const dynamic = "force-dynamic";

/* The person behind the numbers. No names asked for, no forms to
   fill: an email, a streak, and the handful of switches that make
   the app behave like yours. */

const todayISO = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);

export default async function You() {
  await requirePin();
  const [settings, email, expenses] = await Promise.all([
    getSettings(),
    viewerEmail(),
    getExpenses(),
  ]);

  /* Days in a row with at least one entry. Today counts if you have
     logged something; if not yet, yesterday still carries it. */
  const dates = new Set(expenses.map((e) => e.date));
  let streak = 0;
  let d = todayISO();
  if (!dates.has(d)) d = addDays(d, -1);
  while (dates.has(d)) {
    streak++;
    d = addDays(d, -1);
  }

  return (
    <div className="pb-8">
      <Band
        tone="sage"
        pad="none"
        className="sticky top-0 z-10 bg-sage px-5 pt-6 pb-4"
      >
        <p className="text-title">You</p>
        {email ? <p className="mt-1 text-meta text-ink/60">{email}</p> : null}
      </Band>

      <div className="flex items-center gap-4 bg-bone px-5 py-5">
        <Flame size={28} weight={streak > 0 ? "fill" : "regular"} className="text-ember" />
        <div>
          <p className="text-headline text-ink">
            {streak} {streak === 1 ? "day" : "days"}
          </p>
          <p className="mt-0.5 text-meta text-ink/60">
            {streak > 0
              ? "in a row with something logged. One entry a day keeps it alive."
              : "Log anything today to start a streak."}
          </p>
        </div>
      </div>

      <div className="px-5 pt-6 pb-3">
        <Label>Settings</Label>
      </div>
      <SettingsPanel
        initial={{
          hideIncome: settings.hideIncome,
          showTime: settings.showTime,
          monthStart: settings.monthStart,
        }}
        hasPin={Boolean(settings.pinHash)}
      />
    </div>
  );
}
