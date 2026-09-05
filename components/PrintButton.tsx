"use client";

import { Printer } from "@phosphor-icons/react";

/* The statement's one control. The browser's print dialog is the
   PDF machine every device already has. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="fixed right-4 top-4 z-10 inline-flex items-center gap-2 bg-ink px-4 py-3 text-label uppercase text-bone shadow-[0_1px_8px_rgba(0,0,0,0.15)] transition-transform duration-press ease-out-strong active:scale-[0.97] print:hidden"
    >
      <Printer size={15} weight="bold" />
      Save as PDF
    </button>
  );
}
