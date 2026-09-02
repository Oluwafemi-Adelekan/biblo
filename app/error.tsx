"use client";

import { useEffect } from "react";
import { ArrowClockwise } from "@phosphor-icons/react";
import { Wordmark } from "@/components/ui/Text";
import { Logo } from "@/components/ui/Logo";

/* The page something goes wrong on.

   Before this existed, any hiccup - a cold database, one dropped
   fetch - surfaced as the platform's black crash page, which looks
   like the app died. Failures are usually a moment, not a state, so
   this page says so in the app's own voice and offers one button. */

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Visible in Vercel's function logs, which is where the digest
    // is worth something.
    console.error("[biblo]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-sage px-8 text-center">
      <span className="flex items-center gap-1">
        <Logo size={30} className="text-ink" />
        <Wordmark text="biblo" className="text-[1.4rem]" />
      </span>

      <p className="mt-8 text-title">That didn&rsquo;t load.</p>
      <p className="mt-2 max-w-[30ch] text-meta text-ink/65">
        Usually a hiccup rather than a problem. Your money is safe where it is.
      </p>

      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex items-center gap-2 bg-ink px-6 py-3.5 text-label uppercase text-bone transition-transform duration-press ease-out-strong active:scale-[0.97]"
      >
        <ArrowClockwise size={15} weight="bold" />
        Try again
      </button>

      {error.digest ? (
        <p className="mt-6 text-label uppercase text-ink/35">ref {error.digest}</p>
      ) : null}
    </div>
  );
}
