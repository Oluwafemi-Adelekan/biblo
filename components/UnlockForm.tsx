"use client";

import { useActionState } from "react";
import { unlock } from "@/app/unlock/actions";
import { Wordmark } from "@/components/ui/Text";

/* The only screen you see before the passcode. Deliberately plain:
   no wordmark tagline, no explanation of what the app is. A locked
   door should not describe the room. */

export function UnlockForm({ to }: { to: string }) {
  const [state, action, busy] = useActionState(unlock, null);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-sage px-6">
      <Wordmark text="biblo" className="text-[2rem]" />

      <form action={action} className="mt-10 w-full max-w-[18rem]">
        <input type="hidden" name="to" value={to} />

        <label htmlFor="passcode" className="block text-label uppercase text-ink/55">
          Passcode
        </label>
        <input
          id="passcode"
          name="passcode"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          autoFocus
          required
          className="chat-field mt-2 w-full border-b border-ink/25 bg-transparent pb-2 text-center text-headline tracking-[0.3em] text-ink outline-none focus:border-ink"
        />

        {state && !state.ok ? (
          <p className="mt-4 bg-ember px-3 py-2 text-center text-meta text-ink">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full bg-ink px-5 py-4 text-label uppercase text-bone transition-[transform,opacity] duration-press ease-out-strong active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "Checking" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
