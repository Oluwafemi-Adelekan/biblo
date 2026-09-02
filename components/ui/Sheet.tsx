"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/* A bottom sheet built on native <dialog>. Focus trapping, Escape,
   backdrop clicks and inerting the page behind come from the
   platform. The animation lives in CSS (globals) so it runs off
   the main thread and stays smooth while the route is loading. */

export function Sheet({
  open,
  onClose,
  label,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Clicks land on the dialog element itself only when they
        // hit the backdrop, since the panel below stops them.
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "sheet m-0 mt-auto w-full max-w-[430px] bg-transparent p-0",
        "mx-auto max-h-[90dvh] backdrop:backdrop-blur-[1px]",
        className,
      )}
    >
      {children}
    </dialog>
  );
}
