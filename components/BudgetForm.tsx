"use client";

import { useActionState, useMemo, useState } from "react";
import { Check, Eye, EyeSlash } from "@phosphor-icons/react";
import { updateBudget } from "@/app/actions";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { Label } from "@/components/ui/Text";
import { naira } from "@/lib/format";
import { useIncomeVisible } from "@/lib/useIncomeVisible";
import type { Budget, Category } from "@/lib/schema";

/* Set the numbers here. Everything recalculates as you type, so you
   can see what is left over before you commit to it. */

export function BudgetForm({
  month,
  budget,
  categories,
  spentByCategory,
}: {
  month: string;
  budget: Budget;
  categories: Category[];
  spentByCategory: Record<string, number>;
}) {
  const [state, action, busy] = useActionState(updateBudget, null);
  const { visible: showIncome, toggle: toggleIncome } = useIncomeVisible();

  const [income, setIncome] = useState(budget.income.toLocaleString("en-NG"));
  const [caps, setCaps] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      categories
        .filter((c) => c.kind === "spend")
        .map((c) => [c.id, budget.caps[c.id]?.toLocaleString("en-NG") ?? ""]),
    ),
  );

  const num = (s: string) => Number(s.replace(/[^\d.]/g, "")) || 0;
  /* Six-figure amounts are hard to check without separators, so the
     field shows them grouped and the action strips them again. */
  const grouped = (s: string) => {
    const n = s.replace(/[^\d]/g, "");
    return n ? Number(n).toLocaleString("en-NG") : "";
  };
  const totals = useMemo(() => {
    const capped = Object.values(caps).reduce((a, c) => a + num(c), 0);
    return { capped, spare: num(income) - capped };
  }, [caps, income]);

  // Two categories share a heading; the rest stand alone. Render the
  // grouping only where it exists rather than inventing one per row.
  const spend = categories.filter((c) => c.kind === "spend");
  const groups: { name: string | null; items: Category[] }[] = [];
  for (const c of spend) {
    const last = groups[groups.length - 1];
    if (c.group && last?.name === c.group) last.items.push(c);
    else groups.push({ name: c.group ?? null, items: [c] });
  }

  return (
    <form action={action}>
      <input type="hidden" name="month" value={month} />

      <div className="border-y border-rule bg-bone px-5 py-4">
        <div className="flex items-center justify-between">
          <label htmlFor="income">
            <Label tone="dim">Income this month</Label>
          </label>
          {/* Same preference as the home screen: hide it in one place
              and it is hidden in the other. */}
          <button
            type="button"
            onClick={toggleIncome}
            aria-pressed={!showIncome}
            aria-label={showIncome ? "Hide income" : "Show income"}
            className="inline-flex size-8 items-center justify-center text-ink/45 transition-[transform,color] duration-press ease-out-strong hover:text-ink active:scale-[0.9]"
          >
            {showIncome ? <Eye size={16} /> : <EyeSlash size={16} />}
          </button>
        </div>
        <div className="mt-1.5 flex items-baseline gap-1">
          <span className="text-headline text-ink/40">₦</span>
          {showIncome ? (
            <input
              id="income"
              name="income"
              inputMode="numeric"
              value={income}
              onChange={(e) => setIncome(grouped(e.target.value))}
              className="tnum w-full bg-transparent text-headline text-ink outline-none"
            />
          ) : (
            <>
              {/* The real value still submits; only the display is masked. */}
              <input type="hidden" name="income" value={income} />
              <span className="text-headline text-ink/40">••••</span>
            </>
          )}
        </div>
      </div>

      <div className="mt-5 px-5 pb-3">
        <Label as="h2" tone="dim">
          Monthly caps
        </Label>
      </div>

      <div className="border-y border-rule bg-bone">
        {groups.map((g) => (
          <div key={g.name ?? g.items[0].id}>
            {g.name ? (
              <p className="border-b border-rule bg-bone-lift px-5 py-2 text-label uppercase text-ink/50">
                {g.name}
              </p>
            ) : null}
            {g.items.map((c) => {
              const cap = num(caps[c.id]);
              const spent = spentByCategory[c.id] ?? 0;
              const over = cap > 0 && spent > cap;
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 border-b border-rule px-5 py-3 last:border-b-0"
                >
                  <CategoryIcon name={c.icon} size={16} className="shrink-0 text-ink/50" />
                  <label htmlFor={`cap-${c.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-body">{c.name}</span>
                    {spent > 0 ? (
                      <span
                        className={
                          "text-label uppercase " +
                          (over ? "text-ember" : "text-ink/45")
                        }
                      >
                        {naira(spent, { decimals: 0 })} spent
                      </span>
                    ) : null}
                  </label>
                  <span className="flex shrink-0 items-baseline gap-0.5">
                    <span className="text-meta text-ink/40">₦</span>
                    <input
                      id={`cap-${c.id}`}
                      name={`cap:${c.id}`}
                      inputMode="numeric"
                      value={caps[c.id]}
                      placeholder="0"
                      onChange={(ev) =>
                        setCaps((p) => ({ ...p, [c.id]: grouped(ev.target.value) }))
                      }
                      className="tnum w-24 bg-transparent text-right text-body font-medium text-ink outline-none placeholder:text-ink/25"
                    />
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-5 px-5">
        <div className="flex items-center justify-between border-b border-rule py-2.5">
          <Label tone="dim">Allocated</Label>
          <span className="tnum text-meta font-semibold">
            {naira(totals.capped, { decimals: 0 })}
          </span>
        </div>
        <div className="flex items-center justify-between py-2.5">
          <Label tone="dim">{totals.spare < 0 ? "Over income by" : "Unallocated"}</Label>
          <span
            className={
              "tnum text-meta font-semibold " + (totals.spare < 0 ? "text-ember" : "")
            }
          >
            {naira(Math.abs(totals.spare), { decimals: 0 })}
          </span>
        </div>
      </div>

      <div className="mt-5 px-5">
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 bg-ember px-5 py-4 text-label uppercase text-ink transition-[transform,background-color,opacity] duration-press ease-out-strong hover:bg-ember-deep active:scale-[0.99] disabled:opacity-50"
        >
          {state?.ok && !busy ? <Check size={15} weight="bold" /> : null}
          {busy ? "Saving" : state?.ok ? "Saved" : "Save budget"}
        </button>
      </div>
    </form>
  );
}
