"use client";

import { useState } from "react";
import { GoogleLogo } from "@phosphor-icons/react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Wordmark } from "@/components/ui/Text";
import { Logo } from "@/components/ui/Logo";

/* The public front door. One tap with Google, or a link by email.
   Deliberately as plain as the unlock screen it grew from: a locked
   door should not describe the room. */

export function LoginForm({ to }: { to: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const callback = () =>
    `${window.location.origin}/auth/callback?to=${encodeURIComponent(to)}`;

  async function withGoogle() {
    setState("busy");
    const { error: e } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback() },
    });
    if (e) {
      setError("Google sign-in is not switched on yet. Use the email link below.");
      setState("error");
    }
  }

  async function withEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState("busy");
    const { error: err } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callback() },
    });
    if (err) {
      setError(err.message);
      setState("error");
    } else {
      setState("sent");
    }
  }

  return (
    /* Desktop: the column's own fill would draw edges against the
       ground, so it goes transparent - one colour wall to wall. */
    <div className="flex min-h-dvh flex-col items-center justify-center bg-sage px-6 lg:bg-transparent">
      <span className="flex items-center gap-1">
        <Logo size={42} className="text-ink" />
        <Wordmark text="biblo" className="text-[2rem]" />
      </span>
      <p className="mt-3 max-w-[26ch] text-center text-meta text-ink/60">
        Tell it what you spent. It keeps the score.
      </p>

      <div className="mt-10 w-full max-w-[20rem]">
        <button
          type="button"
          onClick={withGoogle}
          disabled={state === "busy"}
          className="flex w-full items-center justify-center gap-2.5 bg-ink px-5 py-4 text-label uppercase text-bone transition-transform duration-press ease-out-strong active:scale-[0.98] disabled:opacity-60"
        >
          <GoogleLogo size={16} weight="bold" />
          Continue with Google
        </button>

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-ink/15" />
          <span className="text-label uppercase text-ink/40">or</span>
          <span className="h-px flex-1 bg-ink/15" />
        </div>

        {state === "sent" ? (
          <p className="bg-bone px-4 py-3.5 text-center text-meta text-ink">
            Check your inbox. The link signs you straight in.
          </p>
        ) : (
          <form onSubmit={withEmail}>
            <label htmlFor="email" className="block text-label uppercase text-ink/55">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              className="chat-field mt-2 w-full border-b border-ink/25 bg-transparent pb-2 text-body text-ink outline-none placeholder:text-ink/30 focus:border-ink"
            />
            <button
              type="submit"
              disabled={state === "busy"}
              className="mt-5 w-full border border-ink/30 px-5 py-3.5 text-label uppercase text-ink transition-[transform,background-color] duration-press ease-out-strong hover:bg-ink/5 active:scale-[0.98] disabled:opacity-60"
            >
              Email me a sign-in link
            </button>
          </form>
        )}

        {state === "error" && error ? (
          <p className="mt-4 bg-ember px-3 py-2 text-center text-meta text-ink">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
