import { parseEntry } from "../lib/parse";
import cats from "../data/seed/categories.json" with { type: "json" };

/* Freeze the clock so the rollover rule is testable rather than
   dependent on when the suite happens to run. */
const RealDate = Date;
function at(iso: string) {
  // @ts-expect-error swapping the global for the duration of a check
  globalThis.Date = class extends RealDate {
    constructor(...a: unknown[]) {
      // @ts-expect-error passthrough
      super(...(a.length ? a : [iso]));
    }
    static now() { return new RealDate(iso).getTime(); }
  };
}
const restore = () => { globalThis.Date = RealDate; };

for (const [clock, text] of [
  ["2026-09-02T00:31:00", "5k fuel"],
  ["2026-09-02T00:31:00", "5k fuel today"],
  ["2026-09-02T00:31:00", "5k fuel yesterday"],
  ["2026-09-02T09:00:00", "5k fuel"],
  ["2026-09-02T09:00:00", "5k fuel yesterday"],
  ["2026-09-02T03:59:00", "2k lunch"],
  ["2026-09-02T04:00:00", "2k lunch"],
] as const) {
  at(clock);
  const r = parseEntry(text, cats as never);
  restore();
  console.log(`sent ${clock.slice(11, 16)} on ${clock.slice(0, 10)} | "${text}" -> ${r.date}`);
}
