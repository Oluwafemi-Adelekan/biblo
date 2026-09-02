import { Skeleton } from "@/components/ui/Skeleton";

export default function ChatLoading() {
  return (
    <div className="loading-fade flex flex-1 flex-col">
      <div className="flex items-center justify-between px-5 py-4">
        <Skeleton className="h-6 w-24" />
      </div>

      <div className="flex flex-1 flex-col justify-end space-y-3 px-4 py-5">
        <div className="flex justify-end">
          <Skeleton className="h-10 w-48" />
        </div>
        <Skeleton className="h-16 w-64" />
        <div className="flex justify-end">
          <Skeleton className="h-10 w-36" />
        </div>
        <Skeleton className="h-12 w-56" />
      </div>

      <div className="border-t border-rule bg-bone px-4 py-3">
        <div className="flex items-end gap-2">
          <Skeleton className="size-10 shrink-0" />
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="size-10 shrink-0 rounded-full" />
        </div>
      </div>
    </div>
  );
}
