import Link from "next/link";
import { WarningDiamond } from "@phosphor-icons/react/ssr";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { Amount } from "@/components/ui/Text";
import type { Category, Expense } from "@/lib/schema";
import { cn } from "@/lib/cn";

export function ExpenseRow({
  expense: e,
  category,
  showDay = false,
  index = 0,
}: {
  expense: Expense;
  category?: Category;
  showDay?: boolean;
  index?: number;
}) {
  const flagged = Boolean(e.entry.check);
  const income = e.amountNGN > 0;

  return (
    <Link
      href={`/expenses/${e.id}`}
      className={cn(
        "hoverable flex items-center gap-3.5 px-5 py-3",
        "transition-[transform,background-color] duration-press ease-out-strong active:scale-[0.985]",
        "motion-safe:animate-[rise_320ms_var(--ease-out-strong)_backwards]",
      )}
      style={{ animationDelay: `${Math.min(index, 10) * 22}ms` }}
    >
      <span className="flex size-8 shrink-0 items-center justify-center bg-ink/8 text-ink/70">
        <CategoryIcon name={category?.icon ?? "Question"} size={16} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-body font-medium">{e.label}</span>
          {flagged ? (
            <WarningDiamond
              size={12}
              weight="fill"
              className="shrink-0 text-ember"
              aria-label="Needs a look"
            />
          ) : null}
        </span>
        {/* The note is what tells two identical-looking rows apart -
            two tyres at the same price from two different people read
            as a duplicate without it. Category alone never could. */}
        <span className="mt-0.5 block truncate text-label uppercase text-ink/50">
          {showDay ? `${Number(e.date.slice(8))} · ` : ""}
          {category?.name ?? "Uncategorised"}
          {e.note ? ` · ${e.note}` : ""}
        </span>
      </span>

      <Amount
        value={e.amountNGN}
        size="body"
        sign
        tone={income ? "positive" : "default"}
        className="shrink-0"
      />
    </Link>
  );
}
