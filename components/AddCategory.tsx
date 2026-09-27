"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "@phosphor-icons/react";
import { createCategory } from "@/app/actions";
import { Sheet } from "@/components/ui/Sheet";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { Label } from "@/components/ui/Text";
import { cn } from "@/lib/cn";

/* Pick from the icons the app actually ships. Offering a text field
   for an icon name would just let you type one that renders as a
   question mark. */
const CHOICES = [
  "ShoppingBag", "ShoppingCart", "ForkKnife", "GasPump", "Wrench", "HandSoap", "Barbell",
  "Lightning", "ShieldCheck", "WifiHigh", "TShirt", "PiggyBank", "PlayCircle",
  "Church", "Gift", "HandHeart", "Bank",
];

export function AddCategory({ month }: { month: string }) {
  const [open, setOpen] = useState(false);
  const [icon, setIcon] = useState(CHOICES[0]);
  /* Money out or money in. Everyone starts with one generic Income,
     which is fine for a salary and useless the moment there are two
     sources - so a category can be either. */
  const [kind, setKind] = useState<"spend" | "income">("spend");

  const [state, action, busy] = useActionState(
    async (prev: unknown, form: FormData) => {
      const r = await createCategory(prev, form);
      if (r.ok) setOpen(false);
      return r;
    },
    null,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 border border-dashed border-ink/25 px-5 py-4 text-label uppercase text-ink/70 transition-[transform,background-color,color] duration-press ease-out-strong hover:bg-ink/5 hover:text-ink active:scale-[0.98]"
      >
        <Plus size={15} weight="bold" />
        New category
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} label="New category">
        <form action={action} className="bg-bone">
          <input type="hidden" name="month" value={month} />
          <input type="hidden" name="icon" value={icon} />
          <input type="hidden" name="kind" value={kind} />

          <div className="flex items-center justify-between border-b border-rule px-5 py-4">
            <Label tone="dim">New category</Label>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="inline-flex size-9 items-center justify-center rounded-full text-ink/70 transition-transform duration-press ease-out-strong active:scale-[0.92]"
            >
              <X size={20} />
            </button>
          </div>

          <div className="px-5 py-5">
            <div className="grid grid-cols-2 gap-px bg-rule">
              {(
                [
                  ["spend", "Money out"],
                  ["income", "Money in"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  className={cn(
                    "py-3 text-label uppercase transition-colors duration-press",
                    kind === k ? "bg-ink text-bone" : "bg-bone text-ink/60 hover:bg-ink/5",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <label htmlFor="cat-name" className="mt-6 block">
              <Label tone="dim">Name</Label>
            </label>
            <input
              id="cat-name"
              name="name"
              required
              autoFocus
              autoCapitalize="words"
              placeholder={kind === "income" ? "Salary" : "Travel"}
              className="chat-field mt-1.5 w-full border-b border-rule bg-transparent pb-2 text-title text-ink outline-none placeholder:text-ink/25"
            />

            {/* You cap what you spend, not what arrives. */}
            {kind === "spend" ? (
              <>
                <label htmlFor="cat-cap" className="mt-6 block">
                  <Label tone="dim">Monthly cap</Label>
                </label>
                <div className="mt-1.5 flex items-baseline gap-1 border-b border-rule pb-2">
                  <span className="text-title text-ink/40">₦</span>
                  <input
                    id="cat-cap"
                    name="cap"
                    inputMode="numeric"
                    placeholder="0"
                    className="chat-field tnum w-full bg-transparent text-title text-ink outline-none placeholder:text-ink/25"
                  />
                </div>
              </>
            ) : (
              <p className="mt-4 text-meta text-ink/60">
                Money in has no cap. Say &ldquo;got paid 120k salary&rdquo; in the chat and
                it lands here.
              </p>
            )}

            <div className="mt-6">
              <Label tone="dim">Icon</Label>
              <div className="mt-3 grid grid-cols-8 gap-px bg-rule">
                {CHOICES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setIcon(name)}
                    aria-label={name}
                    aria-pressed={icon === name}
                    className={cn(
                      "flex aspect-square items-center justify-center transition-colors duration-press",
                      icon === name ? "bg-ink text-bone" : "bg-bone text-ink/65 hover:bg-ink/5",
                    )}
                  >
                    <CategoryIcon name={name} size={18} />
                  </button>
                ))}
              </div>
            </div>

            {state && !state.ok ? (
              <p className="mt-4 bg-ember px-3 py-2 text-meta text-ink">{state.error}</p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="mt-6 w-full bg-ember px-5 py-4 text-label uppercase text-ink transition-[transform,background-color,opacity] duration-press ease-out-strong hover:bg-ember-deep active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? "Adding" : kind === "income" ? "Add income source" : "Add category"}
            </button>
          </div>
          <div className="h-[max(1.25rem,env(safe-area-inset-bottom))]" />
        </form>
      </Sheet>
    </>
  );
}
