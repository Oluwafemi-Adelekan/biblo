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

/** A short tick you can feel. Pixel-style; quietly ignored where the
 *  platform has no vibration motor (iOS Safari). */
export function feel() {
  try {
    navigator.vibrate?.(8);
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
