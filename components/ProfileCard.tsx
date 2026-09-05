"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Flame, X } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/Sheet";
import { updateSettings } from "@/app/actions";
import { AVATARS, avatarSrc } from "@/lib/avatars";
import { cn } from "@/lib/cn";
import { feel } from "@/lib/feedback";

/* The face, the name, the fire. Tap the face to pick another - the
   pack Femi chose, each with a house name. The streak sits on the
   same card: the number and the flame, one line, nothing more. */

export function ProfileCard({
  name,
  email,
  avatarId,
  streak,
}: {
  name: string;
  email: string | null;
  avatarId: string;
  streak: number;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(avatarId);
  const [, start] = useTransition();

  const pick = (id: string) => {
    feel();
    setCurrent(id);
    setOpen(false);
    start(async () => {
      await updateSettings({ avatar: id });
    });
  };

  return (
    <>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Change your avatar"
          className="shrink-0 transition-transform duration-press ease-out-strong active:scale-[0.94]"
        >
          <Image
            src={avatarSrc(current)}
            alt=""
            width={56}
            height={56}
            className="size-14 rounded-[12px] object-cover shadow-[0_0_0_1px_var(--color-rule)]"
          />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-title text-ink">{name}</p>
          {email ? (
            <p className="mt-0.5 truncate text-meta text-ink/55">{email}</p>
          ) : null}
        </div>
        <span
          className="flex shrink-0 items-center gap-1.5"
          aria-label={`${streak} day streak`}
        >
          <span className="tnum text-title text-ink">{streak}</span>
          <Flame
            size={20}
            weight={streak > 0 ? "fill" : "regular"}
            className={streak > 0 ? "text-ember" : "text-ink/35"}
          />
        </span>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} label="Choose your avatar">
        <div className="bg-bone">
          <div className="flex items-center justify-between border-b border-rule px-5 py-4">
            <p className="text-label uppercase text-ink/60">Choose your face</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="inline-flex size-9 items-center justify-center rounded-full text-ink/70 transition-transform duration-press ease-out-strong active:scale-[0.92]"
            >
              <X size={18} weight="bold" />
            </button>
          </div>

          <div className="grid max-h-[60dvh] grid-cols-4 gap-x-3 gap-y-4 overflow-y-auto px-5 py-5">
            {AVATARS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => pick(a.id)}
                aria-label={a.name}
                aria-pressed={a.id === current}
                className="group flex flex-col items-center gap-1.5"
              >
                <Image
                  src={avatarSrc(a.id)}
                  alt=""
                  width={64}
                  height={64}
                  className={cn(
                    "size-16 rounded-[12px] object-cover transition-transform duration-press ease-out-strong group-active:scale-[0.94]",
                    a.id === current
                      ? "shadow-[0_0_0_2px_var(--color-ink)]"
                      : "shadow-[0_0_0_1px_var(--color-rule)]",
                  )}
                />
                <span
                  className={cn(
                    "text-label uppercase",
                    a.id === current ? "text-ink" : "text-ink/50",
                  )}
                >
                  {a.name}
                </span>
              </button>
            ))}
          </div>
          <div className="h-[max(1.25rem,env(safe-area-inset-bottom))]" />
        </div>
      </Sheet>
    </>
  );
}
