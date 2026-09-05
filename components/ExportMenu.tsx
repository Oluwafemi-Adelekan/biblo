"use client";

import { useState } from "react";
import { DownloadSimple, FileCsv, FilePdf, X } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/Sheet";
import { feel } from "@/lib/feedback";

/* One download button, two shapes of the same period: the statement
   for eyes, the spreadsheet for machines. */

export function ExportMenu({
  from: initialFrom,
  to: initialTo,
  category,
}: {
  from: string;
  to: string;
  category?: string;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
  const qs = `from=${from}&to=${to}${category ? `&category=${category}` : ""}`;
  const csvHref = `/api/export?${qs}`;
  const reportHref = `/report?${qs}`;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          feel();
          setOpen(true);
        }}
        aria-label="Export this view"
        className="inline-flex size-9 items-center justify-center text-ink/60 transition-[transform,color] duration-press ease-out-strong hover:text-ink active:scale-[0.92]"
      >
        <DownloadSimple size={18} />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} label="Export">
        <div className="bg-bone">
          <div className="flex items-center justify-between border-b border-rule px-5 py-4">
            <p className="text-title text-ink">Export this view</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="inline-flex size-9 items-center justify-center rounded-full text-ink/70 transition-transform duration-press ease-out-strong active:scale-[0.92]"
            >
              <X size={18} weight="bold" />
            </button>
          </div>

          {/* The period, yours to set - it starts as the view you
              were just looking at. */}
          <div className="flex items-end gap-4 border-b border-rule px-5 py-4">
            <label className="min-w-0 flex-1">
              <span className="block text-label uppercase text-ink/55">From</span>
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="tnum mt-1.5 w-full border-b border-ink/25 bg-transparent pb-1.5 text-body text-ink outline-none focus:border-ink"
              />
            </label>
            <label className="min-w-0 flex-1">
              <span className="block text-label uppercase text-ink/55">To</span>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="tnum mt-1.5 w-full border-b border-ink/25 bg-transparent pb-1.5 text-body text-ink outline-none focus:border-ink"
              />
            </label>
          </div>

          <ul className={valid ? "divide-y divide-rule" : "pointer-events-none divide-y divide-rule opacity-40"}>
            <li>
              <a
                href={reportHref}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3.5 px-5 py-4 transition-[background-color] duration-press hover:bg-ink/5"
              >
                <FilePdf size={22} className="shrink-0 text-ink/70" />
                <span className="min-w-0">
                  <span className="block text-body text-ink">Statement</span>
                  <span className="mt-0.5 block text-meta text-ink/55">
                    A print-ready report - graphs, totals, every entry. Save it
                    as a PDF from the print screen.
                  </span>
                </span>
              </a>
            </li>
            <li>
              <a
                href={csvHref}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3.5 px-5 py-4 transition-[background-color] duration-press hover:bg-ink/5"
              >
                <FileCsv size={22} className="shrink-0 text-ink/70" />
                <span className="min-w-0">
                  <span className="block text-body text-ink">Spreadsheet</span>
                  <span className="mt-0.5 block text-meta text-ink/55">
                    Every entry as CSV, ready for Excel or Sheets.
                  </span>
                </span>
              </a>
            </li>
          </ul>
          <div className="h-[max(1.25rem,env(safe-area-inset-bottom))]" />
        </div>
      </Sheet>
    </>
  );
}
