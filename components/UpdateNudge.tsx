"use client";

import { useEffect, useState } from "react";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { feel } from "@/lib/feedback";

/* The installed app is a web app: every open loads the latest deploy
   on its own, nothing to reinstall. What CAN go stale is a tab left
   open across a deploy. This asks /api/health now and then, and when
   the commit changes, offers one tap to reload - the Play Store
   "Update" button, minus the store. */

export function UpdateNudge({ commit }: { commit: string }) {
  const [fresh, setFresh] = useState<string | null>(null);

  useEffect(() => {
    if (!commit || commit === "local-d") return;
    let stop = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        const j = (await r.json()) as { commit?: string };
        if (!stop && j.commit && j.commit !== commit) setFresh(j.commit);
      } catch {}
    };
    // On return to the app, and every few minutes while it is open.
    document.addEventListener("visibilitychange", check);
    const t = window.setInterval(check, 5 * 60_000);
    return () => {
      stop = true;
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(t);
    };
  }, [commit]);

  if (!fresh) return null;
  return (
    <button
      type="button"
      onClick={() => {
        feel();
        window.location.reload();
      }}
      className="fixed left-1/2 top-3 z-[60] flex -translate-x-1/2 items-center gap-2 bg-ink px-4 py-2.5 text-label uppercase text-bone shadow-lg transition-transform duration-press ease-out-strong active:scale-[0.97] motion-safe:animate-[rise_200ms_var(--ease-out-strong)] lg:top-4"
    >
      <ArrowsClockwise size={14} weight="bold" />
      Update ready · tap to refresh
    </button>
  );
}
