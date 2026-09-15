"use client";

/* Touch and sound feedback.

   The sounds are synthesized, not sampled: two short sine sweeps
   with fast envelopes - a rising "pop" going out, a falling one
   coming in. Sine has no upper harmonics, which is exactly what
   keeps it from sounding like the generic metallic clink; it reads
   as a soft click with a pitch, the register modern messengers use.

   Browsers only allow audio after a user gesture, so the context is
   created on the first tap and replies can only sound after that -
   which is fine, because a reply you are waiting for implies a tap
   that sent something. */

let ctx: AudioContext | null = null;

function context(create: boolean): AudioContext | null {
  if (!ctx && create) {
    try {
      ctx = new AudioContext();
    } catch {
      ctx = null;
    }
  }
  if (ctx?.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

function sweep(
  c: AudioContext,
  from: number,
  to: number,
  duration: number,
  peak: number,
) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  const t = c.currentTime;

  osc.type = "sine";
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + duration);

  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

/* iOS has no vibration API for the web at all. What it does have,
   since iOS 18, is a haptic when a native switch control toggles -
   so a hidden switch, flipped from inside the tap, is the one way a
   web page can tap back on an iPhone. Built once, on first use. */
let iosSwitch: HTMLLabelElement | null = null;

function iosTap() {
  if (!iosSwitch) {
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.tabIndex = -1;
    label.style.cssText =
      "position:fixed;left:-100px;top:-100px;width:1px;height:1px;overflow:hidden;pointer-events:none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    iosSwitch = label;
  }
  iosSwitch.click();
}

/** A short tick you can feel. A real vibration where the platform
 *  has one (Android); the switch trick on iOS; silence elsewhere. */
export function feel() {
  try {
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(8);
      return;
    }
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) iosTap();
  } catch {
    // no motor, no problem
  }
}

/** Message going out: a quick rising pop. */
export function sentSound() {
  const c = context(true);
  if (c) sweep(c, 440, 880, 0.09, 0.11);
}

/** Reply arriving: softer, falling. Only sounds if something has
 *  already been sent this session (no context is created here). */
export function receivedSound() {
  const c = context(false);
  if (c) sweep(c, 660, 392, 0.11, 0.09);
}
