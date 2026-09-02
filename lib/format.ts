import type { Config } from "./schema";

/* The reference sets amounts as $1,894.0 — one decimal, not two.
   That truncation is a deliberate part of the type treatment, so
   it is encoded here once rather than re-derived per component. */

export function naira(
  n: number,
  opts: { sign?: boolean; decimals?: 0 | 1 | 2 } = {},
) {
  const { sign = false, decimals = 1 } = opts;
  const abs = Math.abs(n);
  const body = abs.toLocaleString("en-NG", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const lead = sign && n < 0 ? "-" : sign && n > 0 ? "+" : "";
  return `${lead}₦${body}`;
}

/** Splits a formatted amount into three pieces so each can be set
 *  differently: the sign, the integer body, and the fractional tail
 *  that the reference renders in a lighter tone.
 *
 *  The sign is separated because at display size with -0.045em
 *  tracking, the minus collides with the crossbars of ₦. */
export function nairaParts(n: number, opts: { sign?: boolean } = {}) {
  const full = naira(n, { ...opts, decimals: 1 });
  const signed = full.startsWith("-") || full.startsWith("+");
  const lead = signed ? full[0] : "";
  const rest = signed ? full.slice(1) : full;
  const i = rest.lastIndexOf(".");
  return { lead, head: rest.slice(0, i), tail: rest.slice(i) };
}

export function shortNaira(n: number) {
  const abs = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${s}₦${(abs / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${s}₦${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
  return `${s}₦${abs.toFixed(0)}`;
}

export function monthLabel(month: string, style: "long" | "short" = "long") {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-NG", {
    month: style,
    year: style === "long" ? undefined : "numeric",
  });
}

export function dayLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "9:40 PM" from "21:40" */
export function clockLabel(t?: string) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function toNGN(amount: number, currency: string, config: Config) {
  if (currency === "NGN") return amount;
  const rate = config.rates[currency];
  return rate ? amount * rate : amount;
}
