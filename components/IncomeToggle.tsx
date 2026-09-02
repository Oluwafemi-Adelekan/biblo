"use client";

import { useState, useSyncExternalStore } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { Label } from "@/components/ui/Text";
import { shortNaira } from "@/lib/format";

/* Hide the income figure. Useful when the phone is out in company,
   and useful when you would rather think about the month in terms of
   what is left than what came in.

   The choice lives in this browser only. It is a display preference,
   not data, so it has no business in the database. */

const KEY = "biblo.showIncome";

function read() {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

export function IncomeToggle({ income }: { income: number }) {
  /* Read through an external store so the server renders the same
     thing every time and the browser corrects it on hydration,
     instead of setting state inside an effect. */
  const stored = useSyncExternalStore(
    (notify) => {
      window.addEventListener("storage", notify);
      return () => window.removeEventListener("storage", notify);
    },
    read,
    () => true,
  );
  const [override, setOverride] = useState<boolean | null>(null);
  const showing = override ?? stored;

  function flip() {
    const next = !showing;
    setOverride(next);
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // A browser refusing storage still gets the toggle, just not
      // the memory of it.
    }
  }

  return (
    <button
      type="button"
      onClick={flip}
      aria-pressed={showing}
      aria-label={showing ? "Hide income" : "Show income"}
      className="group text-left transition-transform duration-press ease-out-strong active:scale-[0.94]"
    >
      <span className="flex items-center gap-1">
        <Label tone="dim">Income</Label>
        {showing ? (
          <Eye size={11} className="text-ink/40" />
        ) : (
          <EyeSlash size={11} className="text-ink/40" />
        )}
      </span>
      <span className="tnum mt-1 block text-meta font-semibold">
        {showing ? shortNaira(income) : "••••"}
      </span>
    </button>
  );
}
