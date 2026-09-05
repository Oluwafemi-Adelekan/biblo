"use client";

import { useState, useTransition } from "react";
import { SignOut } from "@phosphor-icons/react";
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
          <select
            value={prefs.monthStart}
            onChange={(e) => save({ monthStart: Number(e.target.value) })}
            aria-label="Month start day"
            className="border-b border-ink/25 bg-transparent pb-1 text-body text-ink outline-none focus:border-ink"
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {ordinal(d)}
              </option>
            ))}
          </select>
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
          pinState === "idle" ? (
            <span className="flex items-center gap-3">
              {pinSet ? (
                <button
                  type="button"
                  onClick={() => savePin(null)}
                  className="text-label uppercase text-ink/55 underline underline-offset-2 hover:text-ink"
                >
                  Remove
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setPinState("editing")}
                className="border border-ink/30 px-3 py-1.5 text-label uppercase text-ink transition-[background-color] duration-press hover:bg-ink/5"
              >
                {pinSet ? "Change" : "Set"}
              </button>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                value={pinValue}
                onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="4–8 digits"
                aria-label="New PIN"
                disabled={pinState === "busy"}
                className="w-24 border-b border-ink/25 bg-transparent pb-1 text-body tracking-[0.2em] text-ink outline-none placeholder:tracking-normal placeholder:text-ink/30 focus:border-ink"
              />
              <button
                type="button"
                disabled={pinState === "busy" || pinValue.length < 4}
                onClick={() => savePin(pinValue)}
                className="bg-ink px-3 py-1.5 text-label uppercase text-bone disabled:opacity-40"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setPinState("idle");
                  setPinValue("");
                  setError("");
                }}
                className="text-label uppercase text-ink/55 hover:text-ink"
              >
                Cancel
              </button>
            </span>
          )
        }
      />
      {error ? (
        <p className="border-t border-rule bg-ember px-5 py-2.5 text-meta text-ink">{error}</p>
      ) : null}

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
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full transition-colors duration-press",
        on ? "bg-ink" : "bg-ink/25",
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] size-[18px] rounded-full bg-bone transition-transform duration-press ease-out-strong",
          on ? "translate-x-[19px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}
