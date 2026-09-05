import Link from "next/link";
import { ExportMenu } from "@/components/ExportMenu";
import { requirePin } from "@/lib/pin";
import { Band } from "@/components/ui/Band";
import { Comb } from "@/components/ui/Comb";
import { Amount, Label } from "@/components/ui/Text";
import { ExpenseRow } from "@/components/ExpenseRow";
import { MonthPicker } from "@/components/MonthPicker";
import { HeaderPortal } from "@/components/HeaderPortal";
import { MaskIncome } from "@/components/MaskIncome";
import { getMonth, getMonthIndex } from "@/lib/data";
import { dayLabel, monthLabel, shortNaira } from "@/lib/format";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export default async function Expenses({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; check?: string; month?: string }>;
}) {
  await requirePin();
  const { category: categoryId, check, month } = await searchParams;
  const [m, index] = await Promise.all([getMonth(month), getMonthIndex()]);

  const checkOnly = check === "1";
  const active = categoryId ? m.categoryById.get(categoryId) : undefined;

  let rows = m.expenses;
  if (active) rows = rows.filter((e) => e.categoryId === active.id);
  if (checkOnly) rows = rows.filter((e) => e.entry.check);

  /* Income is money in, so totalling only negatives would show zero
     on that view. Total whichever direction the filter is about. */
  const incoming = active?.kind === "income";
  const out = rows
    .filter((e) => (incoming ? e.amountNGN > 0 : e.amountNGN < 0))
    .reduce((a, e) => a + Math.abs(e.amountNGN), 0);

  const byDay = rows.reduce<Record<string, typeof rows>>((acc, e) => {
    (acc[e.date] ??= []).push(e);
    return acc;
  }, {});

  const busiest = m.daily.reduce((a, b) => (b.total > a.total ? b : a), m.daily[0]);
  let i = 0;

  return (
    <div className="pb-6 lg:space-y-4 lg:pb-12 lg:pt-4">
      {/* Only the title row sticks. Pinning the whole block, chart
          and filters included, would eat half the screen. On desktop
          the row hides and its tools ride the fixed header instead. */}
      <Band
        tone="sage"
        pad="none"
        className="sticky top-0 z-10 flex items-center justify-between bg-sage px-5 pt-6 pb-3 lg:hidden"
      >
        <Label as="h1" tone="dim">
          {checkOnly ? "Needs a look" : active ? active.name : monthLabel(m.month)}
        </Label>
        <span className="flex items-center gap-1">
        <HeaderPortal>
          <ExportMenu
            from={m.periodFrom}
            to={m.periodLast}
            category={active?.id}
          />
          <MonthPicker
            current={m.month}
            counts={index.counts}
            activeMonth={index.activeMonth}
            demoMonth={index.demoMonth}
            basePath="/expenses"
          />
        </HeaderPortal>
        </span>
      </Band>

      <Band tone="sage" pad="none" className="lg-card px-5 pb-5 lg:p-6">
        <div>
          {incoming ? (
            <MaskIncome className="text-headline text-ink/35">
              <Amount value={out} size="headline" tone="positive" />
            </MaskIncome>
          ) : (
            <Amount value={out} size="headline" />
          )}
        </div>
        <p className="mt-1.5 text-label uppercase text-ink/50">
          {rows.length} {rows.length === 1 ? "entry" : "entries"}
        </p>

        {/* Daily outflow. One mark per day of the month. */}
        {!active && !checkOnly ? (
          <figure className="mt-6">
            <Comb data={m.daily} height={64} />
            <figcaption className="mt-2 flex items-center justify-between text-label uppercase text-ink/45">
              <span>1</span>
              <span>
                busiest {busiest.day} · {shortNaira(busiest.total)}
              </span>
              <span>{m.days}</span>
            </figcaption>
          </figure>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <Chip href="/expenses" on={!active && !checkOnly}>
            All
          </Chip>
          <Chip href="/expenses?category=income" on={active?.id === "income"}>
            Income
          </Chip>
          <Chip href="/expenses?check=1" on={checkOnly}>
            Needs a look {m.needsCheck.length > 0 ? `(${m.needsCheck.length})` : ""}
          </Chip>
          {active && active.id !== "income" ? <Chip on>{active.name}</Chip> : null}
        </div>
      </Band>

      {/* The thread is where pending things live; this just points
          at it rather than listing them twice. */}
      {rows.length === 0 ? (
        <Band tone="bone" pad="lg" className="lg-card text-center">
          <p className="text-title">
            {checkOnly ? "Nothing needs a look." : "Nothing here yet."}
          </p>
          <Link
            href="/chat"
            className="mt-4 inline-flex bg-ember px-5 py-3 text-label uppercase text-ink transition-transform duration-press ease-out-strong active:scale-[0.97]"
          >
            Add an expense
          </Link>
        </Band>
      ) : (
        Object.entries(byDay).map(([date, items]) => {
          const dayTotal = items.reduce((a, e) => a + Math.abs(e.amountNGN), 0);
          return (
            <section key={date} className="lg-card">
              <div className="flex items-center justify-between bg-sage-dim px-5 py-2 lg:bg-bone-lift lg:py-2.5">
                <Label tone="dim">{dayLabel(date)}</Label>
                <span className="tnum text-label uppercase text-ink/55">
                  {/* On the income view this is an income sum too. */}
                  {incoming ? (
                    <MaskIncome className="text-ink/40">
                      {shortNaira(dayTotal)}
                    </MaskIncome>
                  ) : (
                    shortNaira(dayTotal)
                  )}
                </span>
              </div>
              <div className="divide-y divide-rule border-y border-rule bg-bone lg:border-b-0">
                {items.map((e) => (
                  <ExpenseRow
                    key={e.id}
                    expense={e}
                    category={m.categoryById.get(e.categoryId)}
                    index={i++}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function Chip({
  href,
  on,
  children,
}: {
  href?: string;
  on?: boolean;
  children: React.ReactNode;
}) {
  const cls = cn(
    "px-3 py-1.5 text-label uppercase transition-[transform,background-color] duration-press ease-out-strong active:scale-[0.96]",
    on ? "bg-ink text-bone" : "border border-rule text-ink/70 hover:bg-ink/5",
  );
  return href ? (
    <Link href={href} className={cls}>
      {children}
    </Link>
  ) : (
    <span className={cls}>{children}</span>
  );
}
