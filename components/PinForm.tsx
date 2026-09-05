"use client";

import { useActionState } from "react";
import { signOutAction, verifyPin } from "@/app/actions";
import { Wordmark } from "@/components/ui/Text";
import { Logo } from "@/components/ui/Logo";

/* The second lock, styled like the first. */

export function PinForm() {
  const [state, action, busy] = useActionState(verifyPin, null);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-sage px-6">
      <span className="flex items-center gap-1">
        <Logo size={42} className="text-ink" />
        <Wordmark text="biblo" className="text-[2rem]" />
      </span>

      <form action={action} className="mt-10 w-full max-w-[18rem]">
        <label htmlFor="pin" className="block text-label uppercase text-ink/55">
          PIN
        </label>
        <input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
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
          {busy ? "Checking" : "Open"}
        </button>
      </form>

      <form action={signOutAction} className="mt-8">
        <button
          type="submit"
          className="text-label uppercase text-ink/50 underline underline-offset-2 transition-colors duration-press hover:text-ink"
        >
          Not you? Sign out
        </button>
      </form>
    </div>
  );
}
