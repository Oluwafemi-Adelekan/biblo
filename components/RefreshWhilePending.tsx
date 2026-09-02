"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/* The reader answers seconds after a message lands, but a server
   component does not know that. While something is waiting, ask the
   server again: every few seconds at first, then at a walking pace
   for as long as the work is still open - deferred work can take a
   while, and the chat now shows a live working state until the real
   reply lands, so the poll must outlive the quick case. */

export function RefreshWhilePending({ active }: { active: boolean }) {
  const router = useRouter();
  const startedAt = useRef(0);

  useEffect(() => {
    if (!active) return;
    startedAt.current = Date.now();

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
    };

    const fast = window.setInterval(() => {
      if (Date.now() - startedAt.current > 120_000) return;
      tick();
    }, 4000);
    const slow = window.setInterval(() => {
      if (Date.now() - startedAt.current <= 120_000) return;
      tick();
    }, 30_000);
    return () => {
      window.clearInterval(fast);
      window.clearInterval(slow);
    };
  }, [active, router]);

  return null;
}
