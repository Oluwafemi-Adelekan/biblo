import { cn } from "@/lib/cn";
import { nairaParts } from "@/lib/format";

/* ============================================================
   TYPE PRIMITIVES
   One family (Archivo) doing three jobs, separated by weight,
   width and tracking rather than by pairing a second face. The
   reference does the same, and mixing in a second family would
   dilute the industrial read.
   ============================================================ */

/** The 10px uppercase tracked label. Used for every field name,
 *  section header and eyebrow in the app, with no exceptions. */
export function Label({
  children,
  className,
  tone = "default",
  as: As = "span",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "dim" | "invert" | "invert-dim";
  as?: "span" | "div" | "h1" | "h2" | "h3" | "p";
}) {
  const tones = {
    default: "text-ink",
    dim: "text-ink/55",
    invert: "text-bone",
    "invert-dim": "text-bone/60",
  } as const;
  return (
    <As className={cn("text-label uppercase", tones[tone], className)}>
      {children}
    </As>
  );
}

/** A money figure. The fractional tail is set dimmer than the
 *  integer part, which is the single most recognisable move in
 *  the reference type treatment. */
export function Amount({
  value,
  size = "display",
  sign = false,
  tone = "default",
  className,
}: {
  value: number;
  size?: "display" | "headline" | "title" | "body";
  sign?: boolean;
  tone?: "default" | "invert" | "ember";
  className?: string;
}) {
  const { lead, head, tail } = nairaParts(value, { sign });
  const sizes = {
    display: "text-display",
    headline: "text-headline",
    title: "text-title font-semibold tracking-[-0.03em]",
    body: "text-body font-medium tracking-[-0.02em]",
  } as const;
  const tones = {
    default: ["text-ink", "text-ink/40"],
    invert: ["text-bone", "text-bone/45"],
    ember: ["text-ember", "text-ember/45"],
  } as const;
  /* Tabular figures give every digit the width of a zero, which makes a
     large standalone number look loose. They earn their place only in
     columns that have to line up, so they stop at title size. */
  const tabular = size === "title" || size === "body";

  return (
    <span
      className={cn(
        "inline-flex items-baseline",
        tabular && "tnum",
        sizes[size],
        tones[tone][0],
        className,
      )}
    >
      {lead ? <span className="mr-[0.18em] tracking-normal">{lead}</span> : null}
      {head}
      <span className={tones[tone][1]}>{tail}</span>
    </span>
  );
}

export function Wordmark({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-block leading-[0.82] tracking-[-0.055em]", className)}
      style={{ fontWeight: 700, fontStretch: "112%" }}
    >
      {text}
    </span>
  );
}
