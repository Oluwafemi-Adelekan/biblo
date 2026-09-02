import { cn } from "@/lib/cn";

/* A placeholder block with a slow sheen. Route-level loading files
   compose these into rough page shapes, so tapping a tab commits the
   navigation instantly and the page sketches itself in while the
   real data arrives. */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton", className)} />;
}
