import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, WarningDiamond } from "@phosphor-icons/react/ssr";
import { Band, Row, Rule } from "@/components/ui/Band";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { Amount, Label } from "@/components/ui/Text";
import { DeleteExpense } from "@/components/DeleteExpense";
import { getExpense } from "@/lib/data";
import { clockLabel, dayLabel } from "@/lib/format";

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
  const { id } = await params;
  const found = await getExpense(id);
  if (!found) notFound();
  const { expense: e, category } = found;

  return (
    <div className="pb-6">
      <Band tone="sage" pad="none" className="px-5 pt-4 pb-7">
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
          <Amount value={e.amountNGN} size="display" sign />
          <p className="mt-3 text-title">{e.label}</p>
          <p className="mt-1 text-label uppercase text-ink/55">
            {category?.name ?? "Uncategorised"}
          </p>
        </div>
      </Band>

      <Band tone="bone" pad="none" divide>
        <Row label="Date">{dayLabel(e.date)}</Row>
        {e.time ? <Row label="Time">{clockLabel(e.time)}</Row> : null}
        <Row label="Added">{HOW[e.entry.how]}</Row>
        {e.entry.guessed ? (
          <Row label="Category">Guessed from what you typed</Row>
        ) : null}
      </Band>

      {e.entry.raw ? (
        <Band tone="bone-lift" pad="none" className="px-5 py-4">
          <Label tone="dim">You typed</Label>
          <p className="mt-1.5 text-body">{e.entry.raw}</p>
        </Band>
      ) : null}

      {e.note ? (
        <>
          <Rule />
          <Band tone="bone" pad="none" className="px-5 py-4">
            <Label tone="dim">Note</Label>
            <p className="mt-1.5 text-meta">{e.note}</p>
          </Band>
        </>
      ) : null}

      {e.entry.check ? (
        <Band tone="amber" pad="none" className="px-5 py-4">
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
