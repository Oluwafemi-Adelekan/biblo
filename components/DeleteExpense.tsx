"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash } from "@phosphor-icons/react";
import { removeExpense } from "@/app/actions";

/* Two taps, no dialog. A modal for one destructive row on a phone is
   more ceremony than the action deserves, but one tap is too few. */

export function DeleteExpense({ id, label }: { id: string; label: string }) {
  const [armed, setArmed] = useState(false);
  const [busy, start] = useTransition();
  const router = useRouter();

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="inline-flex items-center gap-2 border border-rule px-4 py-2.5 text-label uppercase text-ink/70 transition-[transform,background-color] duration-press ease-out-strong hover:bg-ink/5 active:scale-[0.97]"
      >
        <Trash size={15} />
        Delete
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-meta text-ink/70">Delete &ldquo;{label}&rdquo;?</span>
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          start(async () => {
            await removeExpense(id);
            router.push("/expenses");
          })
        }
        className="bg-ember px-4 py-2.5 text-label uppercase text-ink transition-[transform,background-color] duration-press ease-out-strong hover:bg-ember-deep active:scale-[0.97] disabled:opacity-50"
      >
        {busy ? "Deleting" : "Yes, delete"}
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="px-4 py-2.5 text-label uppercase text-ink/60 transition-transform duration-press ease-out-strong active:scale-[0.97]"
      >
        Keep
      </button>
    </div>
  );
}
