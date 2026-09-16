import { Band } from "@/components/ui/Band";
import { requirePin } from "@/lib/pin";
import { Label } from "@/components/ui/Text";
import { BudgetForm } from "@/components/BudgetForm";
import { AddCategory } from "@/components/AddCategory";
import { MonthPicker } from "@/components/MonthPicker";
import { HeaderPortal } from "@/components/HeaderPortal";
import { CategoryBars } from "@/components/charts/CategoryBars";
import { getMonth, getMonthIndex } from "@/lib/data";
import { monthLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  await requirePin();
  const [m, index] = await Promise.all([getMonth(), getMonthIndex()]);
  const spentByCategory = Object.fromEntries(
    m.categoryRows.map((r) => [r.category.id, r.total]),
  );

  return (
    <div className="pb-8 lg:space-y-4 lg:pb-12 lg:pt-4">
      <Band
        tone="sage"
        pad="none"
        className="sticky top-0 z-10 flex items-center justify-between bg-sage px-5 pt-6 pb-4 lg:hidden"
      >
        <Label as="h1" tone="dim">
          {monthLabel(m.month)} budget
        </Label>
        <HeaderPortal>
          <MonthPicker
            current={m.month}
            counts={index.counts}
            activeMonth={index.activeMonth}
            demoMonth={index.demoMonth}
            basePath="/budget"
          />
        </HeaderPortal>
      </Band>

      <div className="lg-card">
        <BudgetForm
          month={m.month}
          budget={m.budget}
          earned={m.earned}
          categories={m.categories}
          spentByCategory={spentByCategory}
        />
      </div>

      <div className="px-5 pt-4">
        <AddCategory month={m.month} />
      </div>

      {m.spent > 0 ? (
        <Band tone="sage" pad="none" className="lg-card pt-7 lg:bg-bone lg:pb-2 lg:pt-6">
          <div className="px-5 pb-3">
            <Label as="h2" tone="dim">
              Spent so far
            </Label>
          </div>
          <div className="border-y border-rule bg-bone">
            <CategoryBars rows={m.categoryRows} />
          </div>
        </Band>
      ) : null}
    </div>
  );
}
