import { cn } from "@/lib/cn";

/* ============================================================
   METER — a category against its cap.

   Square ends, no radius, no gradient. Once spending passes the
   cap the track represents the actual spend and a tick stays
   behind at the cap position, so you can read how far past you
   went rather than only that you went past.

   The variant names the band the meter sits on, not the state it
   is in. An ember fill on an ember band is invisible, so the
   surface has to decide the ink.
   ============================================================ */

type On = "light" | "dark" | "ember";

export function Meter({
  total,
  cap,
  on = "light",
  className,
}: {
  total: number;
  cap: number;
  on?: On;
  className?: string;
}) {
  const track = {
    light: "bg-ink/10",
    dark: "bg-bone/15",
    ember: "bg-ink/15",
  }[on];

  if (cap <= 0) {
    return <div className={cn("h-[3px] w-full", track, className)} aria-hidden="true" />;
  }

  const over = total > cap;
  const fillPct = over ? 100 : (total / cap) * 100;
  const capPct = over ? (cap / total) * 100 : 100;

  const fill = {
    light: over ? "bg-ember" : "bg-ink",
    dark: over ? "bg-ember" : "bg-bone",
    ember: "bg-ink",
  }[on];

  const tick = { light: "bg-ink", dark: "bg-bone", ember: "bg-ink" }[on];

  return (
    <div
      className={cn("relative h-[3px] w-full", track, className)}
      role="meter"
      aria-valuenow={Math.round((total / cap) * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={over ? "Over cap" : "Within cap"}
    >
      <div className={cn("absolute inset-y-0 left-0", fill)} style={{ width: `${fillPct}%` }} />
      {over ? (
        <div
          className={cn("absolute inset-y-[-4px] w-[1.5px]", tick)}
          style={{ left: `${capPct}%` }}
          title="Cap"
        />
      ) : null}
    </div>
  );
}
