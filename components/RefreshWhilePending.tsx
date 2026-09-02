"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/* The reader answers seconds after a message lands, but a server
   component does not know that. While something is waiting on the
   reader, ask the server again every few seconds; stop the moment
   nothing is pending, or after two minutes, whichever comes first.
   Two minutes is the cap because if the reader has not answered by
   then it has deferred to Claude, and Claude is not fast. */

export function RefreshWhilePending({ active }: { active: boolean }) {
  const router = useRouter();
  const startedAt = useRef(0);

  useEffect(() => {
    if (!active) return;
    startedAt.current = Date.now();

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - startedAt.current > 120_000) return;
      router.refresh();
    };

    const id = window.setInterval(tick, 4000);
    return () => window.clearInterval(id);
  }, [active, router]);

  return null;
}
