"use client";

import { Eye, EyeSlash } from "@phosphor-icons/react";
import { Label } from "@/components/ui/Text";
import { shortNaira } from "@/lib/format";
import { useIncomeVisible } from "@/lib/useIncomeVisible";

/* The income figure, plus the control that hides it.

   Two separate flex children on purpose. Wrapping the figure in a
   button gave it different metrics from Spent and Budget beside it,
   and the row stopped lining up. The stat is now the same markup as
   its neighbours and the eye sits on its own at the end of the row. */

export function IncomeStat({ income }: { income: number }) {
  const { visible, toggle } = useIncomeVisible();

  return (
    <>
      <span>
        <Label tone="dim">Income</Label>
        <p className="tnum mt-1 text-meta font-semibold">
          {visible ? shortNaira(income) : "••••"}
        </p>
      </span>

      <button
        type="button"
        onClick={toggle}
        aria-pressed={!visible}
        aria-label={visible ? "Hide income" : "Show income"}
        className="ml-auto inline-flex size-9 items-center justify-center self-center text-ink/45 transition-[transform,color] duration-press ease-out-strong hover:text-ink active:scale-[0.9]"
      >
        {visible ? <Eye size={17} /> : <EyeSlash size={17} />}
      </button>
    </>
  );
}
