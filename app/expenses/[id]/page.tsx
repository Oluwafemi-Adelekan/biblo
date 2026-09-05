import { notFound } from "next/navigation";
import { getSettings } from "@/lib/settings";
import { requirePin } from "@/lib/pin";
import Link from "next/link";
import { ArrowLeft, WarningDiamond } from "@phosphor-icons/react/ssr";
import { Band, Row, Rule } from "@/components/ui/Band";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { Amount, Label } from "@/components/ui/Text";
import { DeleteExpense } from "@/components/DeleteExpense";
import { getExpense } from "@/lib/data";
import { clockLabel, dayLabel, naira } from "@/lib/format";

export const dynamic = "force-dynamic";

const HOW: Record<string, string> = {
  typed: "Typed in the app",
  photo: "Photo",
  import: "Imported",
  sample: "Sample data",
};

export default async function ExpenseDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePin();
  const { showTime } = await getSettings();
  const { id } = await params;
  const found = await getExpense(id);
  if (!found) notFound();
  const { expense: e, category } = found;

  return (
    <div className="pb-6 lg:space-y-4 lg:pb-12 lg:pt-4">
      <Band tone="sage" pad="none" className="lg-card px-5 pt-4 pb-7 lg:p-6 lg:pb-8">
        <Link
          href="/expenses"
          className="inline-flex items-center gap-2 py-2 text-label uppercase text-ink/55 transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} weight="bold" />
          Expenses
        </Link>

        <div className="mt-5 flex justify-center">
          <span className="flex size-12 items-center justify-center bg-moss text-bone">
            <CategoryIcon name={category?.icon ?? "Question"} size={22} />
          </span>
        </div>

        <div className="mt-5 text-center">
          <Amount
            value={e.amountNGN}
            size="display"
            sign
            tone={e.amountNGN > 0 ? "positive" : "default"}
          />
          <p className="mt-3 text-title">{e.label}</p>
          <p className="mt-1 text-label uppercase text-ink/55">
            {category?.name ?? "Uncategorised"}
          </p>
        </div>
      </Band>

      <Band tone="bone" pad="none" divide className="lg-card">
        <Row label="Date">{dayLabel(e.date)}</Row>
        {e.time && showTime ? <Row label="Time">{clockLabel(e.time)}</Row> : null}
        <Row label="Added">{HOW[e.entry.how]}</Row>
        {e.entry.guessed ? (
          <Row label="Category">Guessed from what you typed</Row>
        ) : null}
      </Band>

      {/* What the receipt actually listed. Shown as a table because
          the point is comparing one price to another, and a table is
          what makes a column of figures comparable. */}
      {e.items.length > 0 ? (
        <Band tone="bone" pad="none" className="lg-card pt-4 lg:pt-5">
          <div className="px-5">
            <Label as="h2" tone="dim">
              {e.items.length} {e.items.length === 1 ? "item" : "items"}
            </Label>
          </div>
          <ul className="mt-3 divide-y divide-rule border-t border-rule">
            {e.items.map((item, i) => (
              <li
                key={`${item.name}-${i}`}
                className="flex items-baseline justify-between gap-4 px-5 py-3"
              >
                <span className="min-w-0">
                  <span className="block text-body">{item.name}</span>
                  {item.qty > 1 ? (
                    <span className="mt-0.5 block text-label uppercase text-ink/50">
                      {item.qty} x {naira(item.unit, { decimals: 0 })}
                    </span>
                  ) : null}
                </span>
                <span className="tnum shrink-0 text-meta font-medium">
                  {naira(item.total, { decimals: 0 })}
                </span>
              </li>
            ))}
          </ul>
          {/* Receipts round, and service charges are not items. When
              the lines do not reach the total, say so rather than
              quietly disagreeing with the figure above. */}
          {(() => {
            const sum = e.items.reduce((a, i) => a + i.total, 0);
            const gap = Math.abs(e.amountNGN) - sum;
            return Math.abs(gap) > 0.5 ? (
              <div className="flex items-center justify-between border-t border-rule px-5 py-3">
                <Label tone="dim">
                  {gap > 0 ? "Not itemised" : "Over the total"}
                </Label>
                <span className="tnum text-meta text-ink/60">
                  {naira(Math.abs(gap), { decimals: 0 })}
                </span>
              </div>
            ) : null;
          })()}
        </Band>
      ) : null}

      {/* entry.raw stays stored for the audit trail, but a wall of
          dictation is not something Femi wants read back at him. */}

      {e.note ? (
        <>
          <Rule className="lg:hidden" />
          <Band tone="bone" pad="none" className="lg-card px-5 py-4">
            <Label tone="dim">Note</Label>
            <p className="mt-1.5 text-meta">{e.note}</p>
          </Band>
        </>
      ) : null}

      {e.entry.check ? (
        <Band tone="amber" pad="none" className="lg-card px-5 py-4">
          <span className="flex items-start gap-2.5">
            <WarningDiamond size={15} weight="fill" className="mt-0.5 shrink-0" />
            <span>
              <Label>Needs a look</Label>
              <p className="mt-1.5 text-meta">{e.entry.check}</p>
            </span>
          </span>
        </Band>
      ) : null}

      <div className="px-5 pt-6">
        <DeleteExpense id={e.id} label={e.label} />
      </div>
    </div>
  );
}
