import { cn } from "@/lib/cn";

/* ============================================================
   COMB — the signature element.

   The reference uses a field of vertical hairlines as pure
   ornament. Here it carries the data instead: one hairline per
   day of the month, hanging from the top edge, its length set by
   that day's outflow. The heaviest day is drawn in ember.

   Hanging rather than rising is deliberate. This chart is money
   leaving, and downward is the direction the reader already
   associates with that.
   ============================================================ */

export function Comb({
  data,
  height = 96,
  tone = "ink",
  markPeak = true,
  animate = true,
  className,
}: {
  data: { day: number; date: string; total: number }[];
  height?: number;
  tone?: "ink" | "bone" | "ember";
  markPeak?: boolean;
  animate?: boolean;
  className?: string;
}) {
  const max = Math.max(...data.map((d) => d.total), 1);
  const peak = data.reduce((a, b) => (b.total > a.total ? b : a), data[0]);

  const stroke = {
    ink: "bg-ink/30",
    bone: "bg-bone/35",
    ember: "bg-ember/50",
  }[tone];

  return (
    <div
      className={cn("flex w-full items-start justify-between", className)}
      style={{ height }}
      aria-hidden="true"
    >
      {data.map((d, i) => {
        // A zero-spend day still shows a 2% tick, so the comb reads
        // as a continuous month rather than a broken row of gaps.
        const pct = d.total === 0 ? 2 : Math.max((d.total / max) * 100, 4);
        const isPeak = markPeak && d.day === peak.day && peak.total > 0;
        return (
          <span
            key={d.date}
            className={cn(
              "w-[3px] shrink-0 origin-top rounded-b-[2px]",
              isPeak ? "bg-ember" : stroke,
              animate && "motion-safe:animate-[comb-drop_420ms_var(--ease-out-strong)_backwards]",
            )}
            style={{
              height: `${pct}%`,
              animationDelay: animate ? `${i * 9}ms` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

/* The comb needs a caption to be a chart rather than a texture.
   Kept separate so the plain texture is still available. */
export function CombChart({
  data,
  caption,
  height = 96,
  tone = "ink",
  className,
}: {
  data: { day: number; date: string; total: number }[];
  caption?: React.ReactNode;
  height?: number;
  tone?: "ink" | "bone" | "ember";
  className?: string;
}) {
  const first = data[0]?.day;
  const last = data[data.length - 1]?.day;
  const dim = tone === "bone" ? "text-bone/50" : "text-ink/45";
  return (
    <figure className={cn("w-full", className)}>
      <Comb data={data} height={height} tone={tone} />
      <figcaption
        className={cn("mt-2 flex items-center justify-between text-label uppercase", dim)}
      >
        <span>{first}</span>
        {caption ? <span className="tracking-[0.14em]">{caption}</span> : null}
        <span>{last}</span>
      </figcaption>
    </figure>
  );
}
