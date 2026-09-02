"use client";

import { useIncomeVisible } from "@/lib/useIncomeVisible";

/* Wraps anything that reveals how much came in.

   One switch, on the Budget screen, but it reaches everywhere: the
   home figure, and the total on the income filter. Individual rows
   are left alone deliberately — hiding those would make the list
   useless, and the point is that a glance at the screen should not
   hand over the headline number. */

export function MaskIncome({
  children,
  dots = "••••",
  className,
}: {
  children: React.ReactNode;
  dots?: string;
  className?: string;
}) {
  const { visible } = useIncomeVisible();
  if (visible) return <>{children}</>;
  return (
    <span className={className ?? "text-ink/40"} aria-label="Income hidden">
      {dots}
    </span>
  );
}
