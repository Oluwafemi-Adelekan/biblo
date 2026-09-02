import { Skeleton } from "@/components/ui/Skeleton";

/* The home page, sketched. Navigation commits the moment the tab is
   tapped and this stands in while the figures arrive, which is what
   makes switching pages feel like switching pages. */

export default function HomeLoading() {
  return (
    <div className="pb-6">
      <div className="flex items-center justify-between px-5 pt-5 pb-1">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-6 w-20" />
      </div>

      <div className="px-5 pt-5 pb-6">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-3 h-14 w-64" />
        <div className="mt-4 flex items-center gap-5">
          <Skeleton className="h-10 w-16" />
          <Skeleton className="h-10 w-16" />
          <Skeleton className="h-10 w-16" />
        </div>
      </div>

      <div className="bg-bone px-5 pt-5 pb-5">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="mt-4 h-36 w-full" />
      </div>

      <div className="pt-5">
        <div className="px-5 pb-3">
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="space-y-px bg-bone px-5 py-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="mt-3 h-16 w-full" />
          <Skeleton className="mt-3 h-16 w-full" />
        </div>
      </div>
    </div>
  );
}
