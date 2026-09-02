"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/Sheet";
import { Label } from "@/components/ui/Text";
import { cn } from "@/lib/cn";

/* A real calendar rather than two hard-coded tabs. Twelve months a
   year, arrows for the year, and a mark under any month that has
   something in it so you are not clicking into empty screens. */

const NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function MonthPicker({
  current,
  counts,
  activeMonth,
  demoMonth,
  basePath = "/",
}: {
  current: string;
  /** month -> number of expenses in it */
  counts: Record<string, number>;
  activeMonth: string;
  demoMonth?: string;
  basePath?: string;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(current.slice(0, 4)));
  const router = useRouter();

  const [curY, curM] = [Number(current.slice(0, 4)), Number(current.slice(5, 7))];
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  function go(month: string) {
    setOpen(false);
    router.push(month === activeMonth ? basePath : `${basePath}?month=${month}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setYear(Number(current.slice(0, 4)));
          setOpen(true);
        }}
        aria-label={`Month: ${FULL[curM - 1]} ${curY}. Change month.`}
        className="flex items-center gap-1.5 px-2.5 py-1 text-label uppercase text-ink/70 transition-[transform,color] duration-press ease-out-strong hover:text-ink active:scale-[0.96]"
      >
        {NAMES[curM - 1]} {curY}
        <CaretRight size={11} weight="bold" className="rotate-90" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} label="Pick a month">
        <div className="bg-bone">
          <div className="flex items-center justify-between border-b border-rule px-5 py-4">
            <Label tone="dim">Pick a month</Label>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="inline-flex size-9 items-center justify-center rounded-full text-ink/70 transition-transform duration-press ease-out-strong active:scale-[0.92]"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex items-center justify-between border-b border-rule px-3 py-2.5">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              aria-label={`Go to ${year - 1}`}
              className="inline-flex size-10 items-center justify-center text-ink/70 transition-[transform,color] duration-press ease-out-strong hover:text-ink active:scale-[0.9]"
            >
              <CaretLeft size={18} weight="bold" />
            </button>
            <span className="tnum text-title font-semibold">{year}</span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              aria-label={`Go to ${year + 1}`}
              className="inline-flex size-10 items-center justify-center text-ink/70 transition-[transform,color] duration-press ease-out-strong hover:text-ink active:scale-[0.9]"
            >
              <CaretRight size={18} weight="bold" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-px bg-rule">
            {NAMES.map((name, i) => {
              const month = `${year}-${String(i + 1).padStart(2, "0")}`;
              const selected = month === current;
              const count = counts[month] ?? 0;
              const future = month > thisMonth;
              const isDemo = month === demoMonth;

              return (
                <button
                  key={month}
                  type="button"
                  onClick={() => go(month)}
                  disabled={future}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1.5 py-5 transition-[transform,background-color] duration-press ease-out-strong active:scale-[0.96]",
                    selected
                      ? "bg-ink text-bone"
                      : future
                        ? "bg-bone text-ink/25"
                        : "bg-bone text-ink hover:bg-ink/5",
                  )}
                >
                  <span className="text-body font-medium">{name}</span>
                  <span
                    className={cn(
                      "text-label uppercase",
                      selected ? "text-bone/60" : "text-ink/45",
                    )}
                  >
                    {isDemo ? "sample" : count > 0 ? count : future ? "—" : "empty"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="h-[max(1.25rem,env(safe-area-inset-bottom))] bg-bone" />
        </div>
      </Sheet>
    </>
  );
}
