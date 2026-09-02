"use client";

import { useState } from "react";
import { shortNaira } from "@/lib/format";

/* ============================================================
   Am I spending faster than the month is passing?

   Two series on one axis: what you have actually spent, running
   totalled, against where an even spender would be. The pace line
   is dashed because dashing means a target here, not a reading.
   Gridlines stay solid.

   The viewBox drives the aspect ratio and the SVG takes its
   height from that (h-auto). Fixing the height in pixels while
   letting the width stretch made the plot letterbox itself,
   which is what left dead space down both sides.

   Drag anywhere across the plot to read any day.
   ============================================================ */

type Day = { day: number; date: string; total: number; running: number };

const W = 320;
const H = 150;
const PAD = { t: 16, r: 6, b: 20, l: 6 };

export function PaceChart({
  daily,
  budgetTotal,
  days,
  elapsed,
}: {
  daily: Day[];
  budgetTotal: number;
  days: number;
  elapsed: number;
}) {
  const [at, setAt] = useState<number | null>(null);

  const perDay = days > 0 ? budgetTotal / days : 0;
  const peak = Math.max(budgetTotal, ...daily.map((d) => d.running), 1);
  const top = peak * 1.12;

  const px = (day: number) =>
    PAD.l + ((day - 1) / Math.max(days - 1, 1)) * (W - PAD.l - PAD.r);
  const py = (v: number) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b);

  const walked = daily.slice(0, Math.max(elapsed, 1));
  const line = walked.map((d) => `${px(d.day)},${py(d.running)}`).join(" ");
  const last = walked[walked.length - 1];
  const area = `${px(1)},${py(0)} ${line} ${px(last?.day ?? 1)},${py(0)}`;
  const paceLine = `${px(1)},${py(0)} ${px(days)},${py(budgetTotal)}`;

  const cur = daily[Math.min(Math.max(at ?? elapsed, 1), days) - 1];
  const ahead = (cur?.running ?? 0) - perDay * (cur?.day ?? 0);

  function move(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    const day = Math.round(((x - PAD.l) / (W - PAD.l - PAD.r)) * (days - 1)) + 1;
    setAt(Math.min(Math.max(day, 1), Math.max(elapsed, 1)));
  }

  return (
    <figure className="w-full">
      <figcaption className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-ink" />
          <span className="text-label uppercase text-ink/60">Spent</span>
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="16" height="2" aria-hidden="true">
            <line
              x1="0" y1="1" x2="16" y2="1"
              stroke="currentColor" strokeWidth="2"
              strokeDasharray="3 3" className="text-ink/40"
            />
          </svg>
          <span className="text-label uppercase text-ink/60">Even pace</span>
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full touch-none select-none"
        role="img"
        aria-label={`Spending pace. ${shortNaira(last?.running ?? 0)} spent by day ${elapsed} of ${days}, against ${shortNaira(perDay * elapsed)} at an even pace.`}
        onPointerDown={move}
        onPointerMove={(e) => e.buttons && move(e)}
        onPointerLeave={() => setAt(null)}
      >
        {/* The budget ceiling, labelled, so the plot says what the
            top of it means instead of leaving you to guess. */}
        <line
          x1={PAD.l} y1={py(budgetTotal)} x2={W - PAD.r} y2={py(budgetTotal)}
          stroke="currentColor" strokeWidth="1" className="text-ink/15"
        />
        <text
          x={PAD.l} y={py(budgetTotal) - 5}
          className="fill-ink/45"
          style={{ fontSize: 8.5, letterSpacing: "0.1em" }}
        >
          BUDGET {shortNaira(budgetTotal).toUpperCase()}
        </text>

        <line
          x1={PAD.l} y1={py(0)} x2={W - PAD.r} y2={py(0)}
          stroke="currentColor" strokeWidth="1" className="text-ink/15"
        />

        <polygon points={area} className="fill-ink/8" />
        <polyline
          points={paceLine}
          fill="none" stroke="currentColor" strokeWidth="2"
          strokeDasharray="3 4" strokeLinecap="round" className="text-ink/40"
        />
        <polyline
          points={line}
          fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" className="text-ink"
        />

        {cur ? (
          <>
            <line
              x1={px(cur.day)} y1={PAD.t - 6} x2={px(cur.day)} y2={py(0)}
              stroke="currentColor" strokeWidth="1" className="text-ink/20"
            />
            {/* ringed in the surface colour so it stays legible where
                it crosses the pace line */}
            <circle
              cx={px(cur.day)} cy={py(cur.running)} r="4.5"
              className={ahead > 0 ? "fill-ember" : "fill-ink"}
              stroke="var(--color-bone)" strokeWidth="2"
            />
          </>
        ) : null}

        <text x={PAD.l} y={H - 5} className="fill-ink/45" style={{ fontSize: 8.5, letterSpacing: "0.1em" }}>
          1
        </text>
        <text x={W - PAD.r} y={H - 5} textAnchor="end" className="fill-ink/45" style={{ fontSize: 8.5, letterSpacing: "0.1em" }}>
          {days}
        </text>
      </svg>

      {cur ? (
        <p className="mt-3 flex items-baseline justify-between gap-3 border-t border-rule pt-3">
          <span className="text-label uppercase text-ink/50">Day {cur.day}</span>
          <span className="text-meta">
            <span className="tnum font-semibold">{shortNaira(cur.running)}</span>
            <span className="text-ink/55">
              {" "}
              {ahead > 0 ? "over" : "under"} pace by{" "}
            </span>
            <span className={"tnum font-semibold " + (ahead > 0 ? "text-ember" : "")}>
              {shortNaira(Math.abs(ahead))}
            </span>
          </span>
        </p>
      ) : null}
    </figure>
  );
}
