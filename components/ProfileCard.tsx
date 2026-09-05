"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Check, Flame, X } from "@phosphor-icons/react";
import { updateSettings } from "@/app/actions";
import { AVATARS, avatarName, avatarSrc, avatarTile } from "@/lib/avatars";
import { cn } from "@/lib/cn";
import { feel } from "@/lib/feedback";

/* The reference Femi gave, in the house palette: face centred and
   large, name and email under it, the streak as a chip - then air
   before anything else. Tapping the face opens a full overlay: the
   chosen one big on its tile colour, its name in a pill (names only
   speak when chosen), a strip of the rest, and one clear button. */

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
  const [applied, setApplied] = useState(avatarId);
  const [sel, setSel] = useState(avatarId);
  const [, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  /* The chosen face presents itself: the strip carries it into view
     whenever it changes, and on open. */
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    stripRef.current
      ?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [open, sel]);

  const apply = () => {
    feel();
    setApplied(sel);
    setOpen(false);
    start(async () => {
      await updateSettings({ avatar: sel });
    });
  };

  return (
    <>
      <div className="flex flex-col items-center text-center">
        <button
          type="button"
          onClick={() => {
            setSel(applied);
            setOpen(true);
          }}
          aria-label="Change your face"
          className="rounded-[22px] transition-transform duration-press ease-out-strong active:scale-[0.95]"
          style={{ backgroundColor: avatarTile(applied) }}
        >
          <Image
            src={avatarSrc(applied)}
            alt=""
            width={112}
            height={112}
            className="size-28 rounded-[22px] object-cover"
          />
        </button>

        <p className="mt-5 text-headline text-ink">{name}</p>
        {email ? (
          <p className="mt-1 text-meta text-ink/55">{email}</p>
        ) : null}

        <span
          className="mt-5 inline-flex items-center gap-2 border border-rule bg-bone px-4 py-2"
          aria-label={`${streak} day streak`}
        >
          <Flame
            size={16}
            weight={streak > 0 ? "fill" : "regular"}
            className={streak > 0 ? "text-ember" : "text-ink/40"}
          />
          <span className="tnum text-meta font-semibold text-ink">
            {streak} {streak === 1 ? "day" : "days"}
          </span>
        </span>
      </div>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose your face"
          className="fixed inset-0 z-50 mx-auto flex max-w-[430px] flex-col bg-bone"
        >
          {/* The chosen one, large, on its own tile colour. */}
          <div
            className="flex flex-col items-center px-5 pb-14 pt-5 transition-colors duration-200"
            style={{ backgroundColor: avatarTile(sel) }}
          >
            <div className="flex w-full items-center justify-between">
              <p className="text-label uppercase text-ink/70">Choose your face</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="inline-flex size-9 items-center justify-center rounded-full bg-bone/70 text-ink transition-transform duration-press ease-out-strong active:scale-[0.92]"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <span className="mt-2 bg-bone/70 px-3.5 py-1.5 text-label uppercase text-ink">
              {avatarName(sel)}
            </span>

            <Image
              src={avatarSrc(sel)}
              alt=""
              width={480}
              height={480}
              priority
              className="mt-4 aspect-square w-full max-w-[300px] object-contain"
            />
          </div>

          {/* The rest of the cast; the chosen one goes fully round
              and wears the check, like the reference. */}
          <div
            ref={stripRef}
            className="scrollbar-none -mt-10 flex gap-3 overflow-x-auto px-5 pb-1 pt-1"
          >
            {AVATARS.map((a) => {
              const active = a.id === sel;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    feel();
                    setSel(a.id);
                  }}
                  aria-label={a.name}
                  aria-pressed={active}
                  className={cn(
                    "relative shrink-0 transition-[transform,border-radius] duration-press ease-out-strong active:scale-[0.93]",
                    active
                      ? "rounded-full shadow-[0_0_0_2px_var(--color-ink)]"
                      : "rounded-[16px] shadow-[0_0_0_1px_var(--color-rule)]",
                  )}
                  style={{ backgroundColor: avatarTile(a.id) }}
                >
                  <Image
                    src={avatarSrc(a.id)}
                    alt=""
                    width={72}
                    height={72}
                    className={cn(
                      "size-[72px] object-cover",
                      active ? "rounded-full" : "rounded-[16px]",
                    )}
                  />
                  {active ? (
                    <span className="absolute -bottom-0.5 -right-0.5 inline-flex size-5 items-center justify-center rounded-full bg-ink text-bone shadow-[0_0_0_2px_var(--color-bone)]">
                      <Check size={11} weight="bold" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
            <button
              type="button"
              onClick={apply}
              className="w-full bg-ink px-5 py-4 text-label uppercase text-bone transition-transform duration-press ease-out-strong active:scale-[0.98]"
            >
              Set as face
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
