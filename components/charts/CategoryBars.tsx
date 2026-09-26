import Link from "next/link";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { shortNaira } from "@/lib/format";
import type { Month } from "@/lib/data";

/* ============================================================
   Where the money went, by category.

   One hue for every bar. The length already encodes the size, so
   colouring bars darker-where-bigger would burn the only free
   channel restating what you can already see. Ember is reserved
   for a single meaning: this one is past its cap.

   No tooltip. Every bar carries its value directly and this is a
   phone, where there is no hover to speak of; a tap opens that
   category's expenses instead.
   ============================================================ */

export function CategoryBars({
  rows,
  limit,
}: {
  rows: Month["categoryRows"];
  limit?: number;
}) {
  const shown = (limit ? rows.slice(0, limit) : rows).filter((r) => r.total !== 0);
  if (shown.length === 0) return null;

  // Bars are scaled against the largest of (biggest spend, its cap) so
  // the cap marker always has somewhere to sit inside the track.
  const max = Math.max(...shown.map((r) => Math.max(r.total, r.cap)), 1);

  return (
    <ul className="divide-y divide-rule">
      {shown.map((r) => {
        // Net-negative (more came back than went out) draws nothing.
        const pct = Math.max((r.total / max) * 100, 0);
        const capPct = r.cap > 0 ? (r.cap / max) * 100 : null;
        return (
          <li key={r.category.id}>
            <Link
              href={`/expenses?category=${r.category.id}`}
              className="hoverable block px-5 py-3.5 transition-transform duration-press ease-out-strong active:scale-[0.99]"
            >
              <div className="flex items-center gap-2.5">
                <CategoryIcon
                  name={r.category.icon}
                  size={15}
                  className="shrink-0 text-ink/50"
                />
                <span className="flex-1 truncate text-meta">{r.category.name}</span>
                <span className="tnum shrink-0 text-meta font-semibold">
                  {shortNaira(r.total)}
                </span>
              </div>

              <div className="relative mt-2 h-3">
                {/* track */}
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink/10" />
                {/* the bar: square at the baseline, rounded at the data end */}
                <div
                  className={
                    "absolute left-0 top-1/2 h-2.5 -translate-y-1/2 rounded-r-[4px] " +
                    (r.over ? "bg-ember" : "bg-ink")
                  }
                  style={{ width: `max(${pct}%, 3px)` }}
                />
                {/* cap marker */}
                {capPct !== null ? (
                  <div
                    className="absolute top-1/2 h-3.5 w-px -translate-y-1/2 bg-ink/45"
                    style={{ left: `${capPct}%` }}
                    aria-hidden="true"
                  />
                ) : null}
              </div>

              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-label uppercase text-ink/45">
                  {r.count} {r.count === 1 ? "entry" : "entries"}
                </span>
                <span
                  className={
                    "text-label uppercase " + (r.over ? "text-ember" : "text-ink/45")
                  }
                >
                  {r.cap === 0
                    ? "no cap"
                    : r.over
                      ? `${shortNaira(r.overBy)} over`
                      : r.leftInCap === 0
                      ? "at cap"
                      : `${shortNaira(r.leftInCap)} left`}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
