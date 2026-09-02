import { cn } from "@/lib/cn";

/* ============================================================
   BAND — the one layout primitive.
   The reference has no cards, no shadows and no rounded panels.
   It has full-bleed horizontal bands of flat colour, stacked and
   separated by hairlines. Every screen in this app is built from
   these, which is what keeps the pages from drifting apart.
   ============================================================ */

export type BandTone = "sage" | "bone" | "bone-lift" | "moss" | "ember" | "amber";

const TONE: Record<BandTone, string> = {
  sage: "bg-sage text-ink",
  bone: "bg-bone text-ink",
  "bone-lift": "bg-bone-lift text-ink",
  moss: "bg-moss text-bone",
  ember: "bg-ember text-ink",
  amber: "bg-amber text-ink",
};

/** Bands on a dark ground need a lighter hairline than bands on a
 *  light ground, so the rule colour follows the tone automatically
 *  rather than being passed in at every call site. */
export const isDark = (t: BandTone) => t === "moss";

export function Band({
  tone = "sage",
  pad = "md",
  divide = false,
  className,
  children,
  ...rest
}: {
  tone?: BandTone;
  pad?: "none" | "sm" | "md" | "lg";
  /** Draw hairlines between direct children. */
  divide?: boolean;
  className?: string;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const pads = {
    none: "",
    sm: "px-5 py-3",
    md: "px-5 py-5",
    lg: "px-5 py-7",
  } as const;
  return (
    <div
      {...rest}
      className={cn(
        TONE[tone],
        pads[pad],
        divide && "divide-y",
        divide && (isDark(tone) ? "divide-rule-invert" : "divide-rule"),
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A label/value row. This is the "DATE — 12 Jun, 2024" pattern
 *  from the transaction detail, generalised. */
export function Row({
  label,
  children,
  dark = false,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 px-5 py-3.5", className)}>
      <span className={cn("text-label uppercase", dark ? "text-bone/60" : "text-ink/55")}>
        {label}
      </span>
      <span className={cn("text-meta tnum text-right", dark ? "text-bone" : "text-ink")}>
        {children}
      </span>
    </div>
  );
}

export function Rule({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <hr
      className={cn("border-0 h-px w-full", dark ? "bg-rule-invert" : "bg-rule", className)}
    />
  );
}
