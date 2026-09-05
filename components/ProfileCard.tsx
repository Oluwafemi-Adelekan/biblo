"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Check, Flame, X } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/Sheet";
import { updateSettings } from "@/app/actions";
import { AVATARS, avatarName, avatarSrc, avatarTile } from "@/lib/avatars";
import { cn } from "@/lib/cn";
import { feel } from "@/lib/feedback";

/* The reference, refined by Femi's second look: the face lives as
   its own circle - no tile corners peeking out anywhere. Tapping it
   slides up a half sheet: the chosen one large on its tile colour,
   its name in a pill, the rest in a strip where only the chosen
   wears a background and the check. */

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
  const [nameOpen, setNameOpen] = useState(false);
  const [shownName, setShownName] = useState(name);
  const [nameValue, setNameValue] = useState(name);
  const [, start] = useTransition();

  const saveName = () => {
    const next = nameValue.trim().slice(0, 40);
    if (!next) return;
    feel();
    setShownName(next);
    setNameOpen(false);
    start(async () => {
      await updateSettings({ name: next });
    });
  };

  /* The chosen face presents itself in the strip. */
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
          className="rounded-full transition-transform duration-press ease-out-strong active:scale-[0.95]"
        >
          <Image
            src={avatarSrc(applied)}
            alt=""
            width={112}
            height={112}
            className="size-28 rounded-full object-cover"
          />
        </button>

        <button
          type="button"
          onClick={() => {
            setNameValue(shownName);
            setNameOpen(true);
          }}
          aria-label="Change your name"
          className="mt-5 text-headline text-ink transition-opacity duration-press active:opacity-70"
        >
          {shownName}
        </button>
        {email ? <p className="mt-1 text-meta text-ink/55">{email}</p> : null}

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

      <Sheet open={nameOpen} onClose={() => setNameOpen(false)} label="Your name">
        <div className="bg-bone">
          <div className="flex items-center justify-between border-b border-rule px-5 py-4">
            <p className="text-title text-ink">Your name</p>
            <button
              type="button"
              onClick={() => setNameOpen(false)}
              aria-label="Close"
              className="inline-flex size-9 items-center justify-center rounded-full text-ink/70 transition-transform duration-press ease-out-strong active:scale-[0.92]"
            >
              <X size={18} weight="bold" />
            </button>
          </div>
          <div className="px-5 py-6">
            <input
              autoFocus
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              aria-label="Your name"
              maxLength={40}
              className="chat-field w-full border-b border-ink/25 bg-transparent pb-2 text-center text-headline text-ink outline-none focus:border-ink"
            />
            <p className="mt-3 text-center text-meta text-ink/55">
              Whatever you like being called. First names do fine here.
            </p>
            <button
              type="button"
              disabled={!nameValue.trim()}
              onClick={saveName}
              className="mt-6 w-full bg-ink px-5 py-4 text-label uppercase text-bone transition-[transform,opacity] duration-press ease-out-strong active:scale-[0.98] disabled:opacity-50"
            >
              Save
            </button>
          </div>
          <div className="h-[max(0.5rem,env(safe-area-inset-bottom))]" />
        </div>
      </Sheet>

      <Sheet open={open} onClose={() => setOpen(false)} label="Choose your face">
        {/* Seventy percent of the screen. The content block keeps its
            own tight spacing and sits at the top; the tile colour
            wraps only that block, and the room left over is plain
            ground between the strip and the button. */}
        <div className="flex min-h-[70dvh] flex-col bg-bone">
          {/* The chosen one, on its own tile colour. */}
          <div
            className="flex flex-col items-center px-5 pb-12 pt-5 transition-colors duration-200"
            style={{ backgroundColor: avatarTile(sel) }}
          >
            <div className="flex w-full items-center justify-between">
              <p className="text-title text-ink">Choose your face</p>
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
              width={400}
              height={400}
              priority
              className="mt-4 size-48 rounded-full object-cover"
            />
          </div>

          {/* Only the chosen face wears a background and the check;
              the rest are simply themselves. */}
          <div
            ref={stripRef}
            className="scrollbar-none -mt-9 flex gap-3 overflow-x-auto px-5 pb-2 pt-1"
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
                    "relative shrink-0 rounded-full transition-transform duration-press ease-out-strong active:scale-[0.93]",
                    active && "shadow-[0_0_0_2px_var(--color-ink)]",
                  )}
                  style={active ? { backgroundColor: avatarTile(a.id) } : undefined}
                >
                  <Image
                    src={avatarSrc(a.id)}
                    alt=""
                    width={72}
                    height={72}
                    className="size-[72px] rounded-full object-cover"
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

          <div className="mt-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
            <button
              type="button"
              onClick={apply}
              className="w-full bg-ink px-5 py-4 text-label uppercase text-bone transition-transform duration-press ease-out-strong active:scale-[0.98]"
            >
              Set as face
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
