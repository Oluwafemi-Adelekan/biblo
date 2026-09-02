/* The lock on the front door.

   One passcode, no accounts. You type it once on a device and the
   cookie remembers. Deliberately small: this is one person's phone
   reaching one person's data, and a login flow with emails and
   password resets would be more surface area, not less.

   Web Crypto rather than node:crypto, because the middleware that
   checks this runs on the Edge runtime where node:crypto is absent. */

export const COOKIE = "biblo_key";

/** How long a device stays unlocked. Long, because re-typing a PIN in
 *  a supermarket to log a receipt is exactly the friction that stops
 *  someone using the thing. */
export const MAX_AGE = 60 * 60 * 24 * 180;

const enc = new TextEncoder();

/** The cookie holds an HMAC of a fixed string, so it proves the
 *  passcode was known without carrying it. Rotating the secret
 *  signs every device out. */
export async function token(secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("biblo-v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant time, so a wrong value cannot be narrowed down by how
 *  long the comparison took. */
export function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type LockState =
  | { mode: "open" }        // development, or no passcode set locally
  | { mode: "locked" }      // a passcode is set and must be entered
  | { mode: "misconfigured" }; // deployed with no passcode: refuse to serve

/** Deciding whether to lock is shared by the middleware and the
 *  unlock page, so they can never disagree about it. */
export function lockState(env: {
  passcode?: string;
  secret?: string;
  production: boolean;
}): LockState {
  const configured = Boolean(env.passcode && env.secret);
  if (configured) return { mode: "locked" };
  // A deployed app with no passcode would be a public URL showing
  // someone's money. Fail closed rather than open.
  return env.production ? { mode: "misconfigured" } : { mode: "open" };
}
