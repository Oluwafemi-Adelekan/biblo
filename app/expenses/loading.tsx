import { Skeleton } from "@/components/ui/Skeleton";

export default function ExpensesLoading() {
  return (
    <div className="loading-fade pb-6">
      <div className="flex items-center justify-between px-5 pt-6 pb-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-6 w-20" />
      </div>

      <div className="px-5 pb-5">
        <Skeleton className="h-10 w-44" />
        <Skeleton className="mt-2 h-3 w-20" />
        <Skeleton className="mt-6 h-16 w-full" />
        <div className="mt-5 flex gap-2">
          <Skeleton className="h-8 w-12" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>

      <Skeleton className="h-8 w-full" />
      <div className="space-y-px bg-bone px-5 py-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3.5 py-2.5">
            <Skeleton className="size-8 shrink-0" />
            <div className="flex-1">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="mt-1.5 h-2.5 w-24" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
