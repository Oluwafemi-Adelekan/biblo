import { Band } from "@/components/ui/Band";
import { Label } from "@/components/ui/Text";
import { BudgetForm } from "@/components/BudgetForm";
import { AddCategory } from "@/components/AddCategory";
import { MonthPicker } from "@/components/MonthPicker";
import { CategoryBars } from "@/components/charts/CategoryBars";
import { getMonth, getMonthIndex } from "@/lib/data";
import { monthLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  const [m, index] = await Promise.all([getMonth(), getMonthIndex()]);
  const spentByCategory = Object.fromEntries(
    m.categoryRows.map((r) => [r.category.id, r.total]),
  );

  return (
    <div className="pb-8">
      <Band
        tone="sage"
        pad="none"
        className="sticky top-0 z-10 flex items-center justify-between bg-sage px-5 pt-6 pb-4"
      >
        <Label as="h1" tone="dim">
          {monthLabel(m.month)} budget
        </Label>
        <MonthPicker
          current={m.month}
          counts={index.counts}
          activeMonth={index.activeMonth}
          demoMonth={index.demoMonth}
          basePath="/budget"
        />
      </Band>

      <BudgetForm
        month={m.month}
        budget={m.budget}
        categories={m.categories}
        spentByCategory={spentByCategory}
      />

      <div className="px-5 pt-4">
        <AddCategory month={m.month} />
      </div>

      {m.spent > 0 ? (
        <Band tone="sage" pad="none" className="pt-7">
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
