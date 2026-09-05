"use client";

import { useState, useTransition } from "react";
import { CaretDown, SignOut, X } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/Sheet";
import { setPin, signOutAction, updateSettings } from "@/app/actions";
import { INCOME_CHANGED, INCOME_KEY } from "@/lib/useIncomeVisible";
import { cn } from "@/lib/cn";
import { feel } from "@/lib/feedback";

/* Every control writes straight to the account, so a choice made on
   the phone holds on the laptop. Nothing here needs a save button. */

type Prefs = { hideIncome: boolean; showTime: boolean; monthStart: number };

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

export function SettingsPanel({
  initial,
  hasPin,
}: {
  initial: Prefs;
  hasPin: boolean;
}) {
  const [prefs, setPrefs] = useState(initial);
  const [pinState, setPinState] = useState<"idle" | "editing" | "busy">("idle");
  const [pinValue, setPinValue] = useState("");
  const [pinSet, setPinSet] = useState(hasPin);
  const [error, setError] = useState("");
  const [, start] = useTransition();

  function save(patch: Partial<Prefs>) {
    feel();
    const next = { ...prefs, ...patch };
    setPrefs(next);
    if (patch.hideIncome !== undefined) {
      // Clear any device-level peek so the account choice shows now.
      try {
        localStorage.removeItem(INCOME_KEY);
        window.dispatchEvent(new Event(INCOME_CHANGED));
      } catch {}
    }
    start(async () => {
      await updateSettings(patch);
    });
  }

  async function savePin(value: string | null) {
    setPinState("busy");
    setError("");
    const r = await setPin(value);
    if (!r.ok) {
      setError(r.error);
      setPinState("editing");
      return;
    }
    setPinSet(value !== null);
    setPinValue("");
    setPinState("idle");
  }

  return (
    <div className="bg-bone">
      <Row
        title="Hide income"
        detail="Blur the money coming in until you tap the eye."
        control={
          <Switch on={prefs.hideIncome} onToggle={() => save({ hideIncome: !prefs.hideIncome })} label="Hide income" />
        }
      />
      <Row
        title="Show times"
        detail="The time of day on each expense, not just the date."
        control={
          <Switch on={prefs.showTime} onToggle={() => save({ showTime: !prefs.showTime })} label="Show times" />
        }
      />
      <Row
        title="Month starts on the"
        detail={
          prefs.monthStart === 1
            ? "Calendar months, the 1st to the end."
            : `Your month runs from the ${ordinal(prefs.monthStart)} to the day before the next ${ordinal(prefs.monthStart)}. Payday budgeting.`
        }
        control={
          <MonthStartControl
            value={prefs.monthStart}
            onPick={(d) => save({ monthStart: d })}
          />
        }
      />
      <Row
        title="App PIN"
        detail={
          pinSet
            ? "Asked for whenever this app is opened."
            : "A second lock for whoever is holding your unlocked phone."
        }
        control={
          <button
            type="button"
            onClick={() => setPinState("editing")}
            className="shrink-0 border border-ink/30 px-3 py-1.5 text-label uppercase text-ink transition-[background-color] duration-press hover:bg-ink/5"
          >
            {pinSet ? "Change" : "Set"}
          </button>
        }
      />

      {/* The PIN gets the same sheet treatment as the month picker:
          the row is just a door, the work happens in the house style. */}
      <Sheet
        open={pinState !== "idle"}
        onClose={() => {
          setPinState("idle");
          setPinValue("");
          setError("");
        }}
        label="App PIN"
      >
        <div className="bg-bone">
          <div className="flex items-center justify-between border-b border-rule px-5 py-4">
            <p className="text-title text-ink">App PIN</p>
            <button
              type="button"
              onClick={() => {
                setPinState("idle");
                setPinValue("");
                setError("");
              }}
              aria-label="Close"
              className="inline-flex size-9 items-center justify-center rounded-full text-ink/70 transition-transform duration-press ease-out-strong active:scale-[0.92]"
            >
              <X size={18} weight="bold" />
            </button>
          </div>

          <div className="px-5 py-6">
            <label htmlFor="new-pin" className="block text-label uppercase text-ink/55">
              {pinSet ? "New PIN" : "PIN"}
            </label>
            <input
              id="new-pin"
              autoFocus
              type="password"
              inputMode="numeric"
              value={pinValue}
              onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 8))}
              aria-label="New PIN"
              disabled={pinState === "busy"}
              className="chat-field mt-2 w-full border-b border-ink/25 bg-transparent pb-2 text-center text-headline tracking-[0.3em] text-ink outline-none focus:border-ink"
            />
            <p className="mt-3 text-center text-meta text-ink/55">
              4 to 8 digits. Asked for whenever the app is opened.
            </p>

            {error ? (
              <p className="mt-4 bg-ember px-3 py-2 text-center text-meta text-ink">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              disabled={pinState === "busy" || pinValue.length < 4}
              onClick={() => savePin(pinValue)}
              className="mt-6 w-full bg-ink px-5 py-4 text-label uppercase text-bone transition-[transform,opacity] duration-press ease-out-strong active:scale-[0.98] disabled:opacity-50"
            >
              {pinState === "busy" ? "Saving" : "Save PIN"}
            </button>

            {pinSet ? (
              <button
                type="button"
                disabled={pinState === "busy"}
                onClick={() => savePin(null)}
                className="mt-4 w-full py-2 text-center text-label uppercase text-ink/55 transition-colors duration-press hover:text-ink"
              >
                Remove the PIN
              </button>
            ) : null}
          </div>
          <div className="h-[max(0.5rem,env(safe-area-inset-bottom))]" />
        </div>
      </Sheet>

      <form action={signOutAction} className="border-t border-rule">
        <button
          type="submit"
          className="flex w-full items-center gap-2.5 px-5 py-4 text-left text-body text-ink transition-[background-color] duration-press hover:bg-ink/5"
        >
          <SignOut size={17} className="text-ink/60" />
          Sign out
        </button>
      </form>
    </div>
  );
}

function Row({
  title,
  detail,
  control,
}: {
  title: string;
  detail: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-t border-rule px-5 py-4 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="text-body text-ink">{title}</p>
        <p className="mt-0.5 text-meta text-ink/55">{detail}</p>
      </div>
      {control}
    </div>
  );
}

function Switch({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  /* Both states carry their own weight: ink track with a bone knob
     when on; a rimmed light track with an ink knob when off. No
     state where the knob dissolves into its background. */
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full transition-colors duration-press",
        on ? "bg-ink" : "bg-bone-lift ring-1 ring-inset ring-ink/30",
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-[3px] size-[18px] rounded-full transition-transform duration-press ease-out-strong",
          on ? "translate-x-[19px] bg-bone" : "translate-x-[3px] bg-ink/60",
        )}
      />
    </button>
  );
}

function MonthStartControl({
  value,
  onPick,
}: {
  value: number;
  onPick: (d: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Month start day"
        className="flex shrink-0 items-center gap-1.5 border border-ink/30 px-3 py-1.5 text-label uppercase text-ink transition-[background-color] duration-press hover:bg-ink/5"
      >
        {ordinal(value)}
        <CaretDown size={11} weight="bold" className="text-ink/55" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} label="Month starts on">
        <div className="bg-bone">
          <div className="flex items-center justify-between border-b border-rule px-5 py-4">
            <p className="text-label uppercase text-ink/60">
              Your month starts on the
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="inline-flex size-9 items-center justify-center rounded-full text-ink/70 transition-transform duration-press ease-out-strong active:scale-[0.92]"
            >
              <X size={18} weight="bold" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-2 px-5 py-5">
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  onPick(d);
                  setOpen(false);
                }}
                className={cn(
                  "tnum h-10 text-meta transition-[transform,background-color] duration-press ease-out-strong active:scale-[0.94]",
                  d === value
                    ? "bg-ink font-semibold text-bone"
                    : "border border-rule text-ink hover:bg-ink/5",
                )}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="px-5 pb-4 text-meta text-ink/55">
            Payday budgeting: pick the day the money lands, and your month
            runs from there to the day before it lands again.
          </p>
          <div className="h-[max(1.25rem,env(safe-area-inset-bottom))]" />
        </div>
      </Sheet>
    </>
  );
}
