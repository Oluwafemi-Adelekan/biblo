import { Skeleton } from "@/components/ui/Skeleton";

export default function BudgetLoading() {
  return (
    <div className="loading-fade pb-8">
      <div className="flex items-center justify-between px-5 pt-6 pb-4">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-6 w-20" />
      </div>

      <div className="bg-bone px-5 py-4">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-2 h-9 w-40" />
      </div>

      <div className="mt-5 px-5 pb-3">
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="bg-bone px-5">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <Skeleton className="size-5 shrink-0" />
            <div className="flex-1">
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
