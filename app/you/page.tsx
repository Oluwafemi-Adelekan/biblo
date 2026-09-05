import { Band } from "@/components/ui/Band";
import { Label } from "@/components/ui/Text";
import { ProfileCard } from "@/components/ProfileCard";
import { SettingsPanel } from "@/components/SettingsPanel";
import { getExpenses } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { viewerEmail } from "@/lib/viewer";
import { requirePin } from "@/lib/pin";

export const dynamic = "force-dynamic";

/* The person behind the numbers: a face from the pack, their name
   as Google gave it, the streak on the same line - then the
   handful of switches that make the app behave like theirs. */

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

  const name =
    settings.name?.trim() || email?.split("@")[0] || "You";

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
      <Band tone="sage" pad="none" className="px-5 pt-6 pb-5">
        <ProfileCard
          name={name}
          email={email}
          avatarId={settings.avatar ?? "1"}
          streak={streak}
        />
      </Band>

      <div className="px-5 pt-4 pb-3">
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
