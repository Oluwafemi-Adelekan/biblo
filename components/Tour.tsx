"use client";

import { useEffect, useLayoutEffect, useState, useTransition } from "react";
import { markToured } from "@/app/actions";
import { cn } from "@/lib/cn";
import { feel } from "@/lib/feedback";

/* The first-run walkthrough. Four cards, a spotlight on the real
   controls, and gone forever once finished - the flag lives on the
   account, so it never replays on another device. */

const STEPS: { sel: string | null; title: string; body: string }[] = [
  {
    sel: null,
    title: "Welcome to Biblo.",
    body: "Your money, kept by talking about it. No forms, no spreadsheets - you say what you spent, it keeps the score.",
  },
  {
    sel: 'nav a[href="/chat"]',
    title: "Everything starts in Chat.",
    body: "Type “5k fuel”, dictate it, or send a photo of a receipt - it gets read and filed on its own. Money coming in counts too: “got paid 250k”. When it needs your yes, you get a button, not a form.",
  },
  {
    sel: 'nav a[href="/budget"]',
    title: "Budget is yours to shape.",
    body: "Set what comes in, cap each category, add your own. The graphs on Home do the judging quietly.",
  },
  {
    sel: 'nav a[href="/you"]',
    title: "And this part is you.",
    body: "Your streak, your privacy - hide income, set a PIN, even start your month on payday.",
  },
];

export function Tour({ run }: { run: boolean }) {
  const [step, setStep] = useState(0);
  const [gone, setGone] = useState(false);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  /** How far the card lifts off the floor on a phone: exactly the
   *  height of the bottom nav, so the tabs it is pointing at stay in
   *  view beneath it instead of under it. 0 on desktop (rail). */
  const [lift, setLift] = useState(0);
  const [, start] = useTransition();

  const active = run && !gone;
  const sel = STEPS[step]?.sel ?? null;

  useLayoutEffect(() => {
    if (!active) return;
    const measure = () => {
      /* Everything is measured against the visual viewport, which is
         what the person actually sees - on iOS Safari the layout
         viewport can run under the bottom toolbar, and a card pinned
         to that edge disappears behind it. */
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const nav = document.querySelector("nav[aria-label='Main']");
      const nr = nav?.getBoundingClientRect();
      // A bottom bar (phone) lifts the card; a side rail (desktop) does not.
      setLift(nr && nr.top > vh / 2 ? Math.max(0, vh - nr.top) : 0);

      if (!sel) {
        setRect(null);
        return;
      }
      const el = document.querySelector(sel);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ x: r.x - 6, y: r.y - 6, w: r.width + 12, h: r.height + 12 });
    };
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [active, sel]);

  useEffect(() => {
    if (!active) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [active]);

  if (!active) return null;

  const finish = () => {
    feel();
    setGone(true);
    // A replay from Profile arrives as /?tour=1; drop the flag so a
    // reload does not start the tour over.
    if (window.location.search.includes("tour=1")) {
      window.history.replaceState(null, "", "/");
    }
    start(async () => {
      await markToured();
    });
  };
  const next = () => {
    feel();
    if (step >= STEPS.length - 1) finish();
    else setStep(step + 1);
  };

  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome tour"
      // h-dvh, not inset-0: the dynamic viewport is the part of the
      // screen the browser's own bars are not covering.
      className="fixed left-0 top-0 z-50 h-dvh w-full"
    >
      {/* One element, lit from within: the spotlight is the hole its
          giant shadow leaves. */}
      <div
        className="absolute rounded-[10px] transition-all duration-200 ease-out-strong"
        style={
          rect
            ? {
                left: rect.x,
                top: rect.y,
                width: rect.w,
                height: rect.h,
                boxShadow: "0 0 0 200vmax oklch(0.204 0.017 118 / 0.74)",
              }
            : {
                left: "50%",
                top: "50%",
                width: 0,
                height: 0,
                boxShadow: "0 0 0 200vmax oklch(0.204 0.017 118 / 0.74)",
              }
        }
      />

      {/* Phone: a card sitting just above the bottom nav, so the tab
          being pointed at is in plain view beneath it. Desktop: a
          floating card centred on the content canvas. */}
      <div
        className="absolute inset-x-0 bottom-0 mx-auto bg-bone p-5 shadow-[0_-1px_0_var(--color-rule)] motion-safe:animate-[rise_200ms_var(--ease-out-strong)] lg:bottom-10 lg:left-[14rem] lg:max-w-[26rem] lg:p-6 lg:shadow-[0_0_0_1px_var(--color-rule)]"
        style={lift > 0 ? { bottom: lift } : undefined}
      >
        <p className="text-title text-ink">{s.title}</p>
        <p className="mt-2 text-body text-ink/75">{s.body}</p>

        {/* Progress on its own line; then Back alone on the left,
            Skip and Next together on the right. */}
        <div className="mt-5 flex items-center gap-1.5" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                "size-1.5 rounded-full transition-colors duration-press",
                i === step ? "bg-ink" : "bg-ink/25",
              )}
            />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => {
                feel();
                setStep(step - 1);
              }}
              className="py-2.5 text-label uppercase text-ink/55 transition-colors duration-press hover:text-ink"
            >
              Back
            </button>
          ) : (
            <span />
          )}
          <span className="flex items-center gap-4">
            {!last ? (
              <button
                type="button"
                onClick={finish}
                className="py-2.5 text-label uppercase text-ink/55 transition-colors duration-press hover:text-ink"
              >
                Skip
              </button>
            ) : null}
            <button
              type="button"
              onClick={next}
              className="bg-ink px-5 py-2.5 text-label uppercase text-bone transition-transform duration-press ease-out-strong active:scale-[0.97]"
            >
              {last ? "Let's go" : "Next"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
