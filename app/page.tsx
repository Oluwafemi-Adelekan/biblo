import Link from "next/link";
import { CaretRight, WarningDiamond } from "@phosphor-icons/react/ssr";
import { Band } from "@/components/ui/Band";
import { Amount, Label, Wordmark } from "@/components/ui/Text";
import { Logo } from "@/components/ui/Logo";
import { CategoryBars } from "@/components/charts/CategoryBars";
import { PaceChart } from "@/components/charts/PaceChart";
import { ExpenseRow } from "@/components/ExpenseRow";
import { MonthPicker } from "@/components/MonthPicker";
import { MaskIncome } from "@/components/MaskIncome";
import { getMonth, getMonthIndex } from "@/lib/data";
import { monthLabel, shortNaira } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const [m, index] = await Promise.all([getMonth(month), getMonthIndex()]);
  /* Two different states that were being added together, so the
     home screen said 2 and the screen it linked to said 1. Messages
     wait on Claude; flagged rows wait on Femi. */
  const waitingOnClaude = m.pending.length;
  const needsALook = m.needsCheck.length;

  return (
    <div className="pb-6">
      <Band
        tone="sage"
        pad="none"
        className="sticky top-0 z-10 flex items-center justify-between bg-sage px-5 pt-5 pb-3"
      >
        <span className="flex items-center gap-1">
          <Logo size={30} className="text-ink" />
          <Wordmark text={m.config.wordmark} className="text-[1.4rem]" />
        </span>
        <MonthPicker
          current={m.month}
          counts={index.counts}
          activeMonth={index.activeMonth}
          demoMonth={index.demoMonth}
        />
      </Band>

      {/* ---- the one number ------------------------------------ */}
      <Band tone="sage" pad="none" className="px-5 pt-5 pb-6">
        <Label as="h1" tone="dim">
          {m.over ? "Over budget" : "Left to spend"}
        </Label>
        <div className="mt-2">
          <Amount
            value={m.over ? m.overBy : m.left}
            size="display"
            tone={m.over ? "ember" : "default"}
          />
        </div>

        <div className="mt-4 flex items-center gap-5">
          <span>
            <Label tone="dim">Spent</Label>
            <p className="tnum mt-1 text-meta font-semibold">{shortNaira(m.spent)}</p>
          </span>
          <span className="h-7 w-px bg-rule" />
          <span>
            <Label tone="dim">Budget</Label>
            <p className="tnum mt-1 text-meta font-semibold">{shortNaira(m.budget.total)}</p>
          </span>
          <span className="h-7 w-px bg-rule" />
          <span>
            <Label tone="dim">Income</Label>
            <p className="tnum mt-1 text-meta font-semibold">
              <MaskIncome>{shortNaira(m.budget.income)}</MaskIncome>
            </p>
          </span>
        </div>
      </Band>

      {/* ---- waiting on Claude ---------------------------------- */}
      {waitingOnClaude > 0 ? (
        <Link
          href="/chat"
          className="flex items-center justify-between gap-3 bg-amber px-5 py-3.5 text-ink transition-[transform,background-color] duration-press ease-out-strong hover:bg-amber-deep active:scale-[0.99]"
        >
          <span className="flex items-center gap-2.5">
            <WarningDiamond size={15} weight="fill" />
            <span className="text-meta font-medium">
              {waitingOnClaude} waiting on Claude
            </span>
          </span>
          <CaretRight size={16} weight="bold" />
        </Link>
      ) : null}

      {needsALook > 0 ? (
        <Link
          href="/expenses?check=1"
          className="flex items-center justify-between gap-3 border-b border-rule bg-bone px-5 py-3.5 text-ink transition-[transform,background-color] duration-press ease-out-strong hover:bg-ink/5 active:scale-[0.99]"
        >
          <span className="flex items-center gap-2.5">
            <WarningDiamond size={15} weight="fill" className="text-ember" />
            <span className="text-meta font-medium">
              {needsALook} {needsALook === 1 ? "entry needs" : "entries need"} a look
            </span>
          </span>
          <CaretRight size={16} weight="bold" />
        </Link>
      ) : null}

      {/* ---- pace ----------------------------------------------- */}
      <Band tone="bone" pad="none" className="px-5 pt-5 pb-5">
        <Label as="h2" tone="dim">
          Pace
        </Label>
        <div className="mt-4">
          <PaceChart
            daily={m.daily}
            budgetTotal={m.budget.total}
            days={m.days}
            elapsed={m.elapsed}
          />
        </div>
      </Band>

      {/* ---- where it went -------------------------------------- */}
      {m.spent > 0 ? (
      <Band tone="sage" pad="none" className="pt-5">
        <div className="flex items-center justify-between px-5 pb-3">
          <Label as="h2" tone="dim">
            Where it went
          </Label>
          <Link
            href="/budget"
            className="flex items-center gap-1 text-label uppercase text-ink/55"
          >
            All {m.categoryRows.length}
            <CaretRight size={12} weight="bold" />
          </Link>
        </div>
        <div className="border-y border-rule bg-bone">
          <CategoryBars rows={m.categoryRows} limit={6} />
        </div>
      </Band>
      ) : null}

      {/* ---- recent --------------------------------------------- */}
      <Band tone="sage" pad="none" className="pt-5">
        <div className="flex items-center justify-between px-5 pb-3">
          <Label as="h2" tone="dim">
            Recent
          </Label>
          <Link
            href="/expenses"
            className="flex items-center gap-1 text-label uppercase text-ink/55"
          >
            All {m.expenses.length}
            <CaretRight size={12} weight="bold" />
          </Link>
        </div>
        {m.expenses.length === 0 ? (
          <div className="border-y border-rule bg-bone px-5 py-8 text-center">
            <p className="text-title">Nothing yet this month.</p>
            <Link
              href="/chat"
              className="mt-4 inline-flex bg-ember px-5 py-3 text-label uppercase text-ink transition-transform duration-press ease-out-strong active:scale-[0.97]"
            >
              Add your first expense
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-rule border-y border-rule bg-bone">
            {m.expenses.slice(0, 4).map((e, i) => (
              <ExpenseRow
                key={e.id}
                expense={e}
                category={m.categoryById.get(e.categoryId)}
                showDay
                index={i}
              />
            ))}
          </div>
        )}
      </Band>

      {m.isDemo ? (
        <p className="px-5 pt-4 text-label uppercase text-ink/45">
          {monthLabel(m.month)} is sample data
        </p>
      ) : null}
    </div>
  );
}
