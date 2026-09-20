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

    /* The reader answers inside 5-30s, so the first minute polls
       briskly. After that, whatever is open is waiting on a person
       (an approval card, a receipt not yet sent), and a poll every
       few minutes is plenty - each one is a full server render, and
       a card left open all day used to cost thousands of them. Coming
       back to the app always refreshes at once. */
    const fast = window.setInterval(() => {
      if (Date.now() - startedAt.current > 60_000) return;
      tick();
    }, 5000);
    const slow = window.setInterval(() => {
      if (Date.now() - startedAt.current <= 60_000) return;
      tick();
    }, 3 * 60_000);
    const onShow = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.clearInterval(fast);
      window.clearInterval(slow);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [active, router]);

  return null;
}
