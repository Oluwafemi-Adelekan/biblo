"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

/* ============================================================
   BUTTON
   Five variants, three sizes, one press behaviour. Every
   pressable surface in the app comes from here so the press
   feedback is identical everywhere.

   Press: scale(0.97) over 140ms on a strong ease-out. The scale
   is what makes the interface feel like it heard you; ease-out
   is used because ease-in delays the first frame, which is the
   frame the finger is watching.
   ============================================================ */

type Variant = "primary" | "solid" | "quiet" | "ghost" | "amber";
type Size = "band" | "md" | "sm" | "icon";

const VARIANT: Record<Variant, string> = {
  // Ink on ember, not bone on ember: bone/ember is 2.6:1 and fails.
  primary: "bg-ember text-ink hover:bg-ember-deep",
  solid: "bg-moss text-bone hover:bg-moss-deep",
  amber: "bg-amber text-ink hover:bg-amber-deep",
  quiet: "bg-transparent text-ink border border-rule hover:bg-ink/5",
  ghost: "bg-transparent text-ink hover:bg-ink/5",
};

const SIZE: Record<Size, string> = {
  band: "w-full px-5 py-5 text-label uppercase justify-center",
  md: "px-4 py-2.5 text-meta font-medium",
  sm: "px-3 py-1.5 text-label uppercase",
  icon: "size-11 rounded-full justify-center p-0",
};

const base = [
  "inline-flex items-center gap-2 select-none",
  "transition-[transform,background-color] duration-press ease-out-strong",
  "active:scale-[0.97]",
  "disabled:opacity-40 disabled:pointer-events-none disabled:active:scale-100",
].join(" ");

type Props = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children?: React.ReactNode;
  href?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant = "quiet",
  size = "md",
  className,
  children,
  href,
  ...rest
}: Props) {
  // A band-width button scaling by 3% reads as the whole screen
  // flexing, so full-bleed bands press more subtly than chips do.
  const press = size === "band" ? "active:scale-[0.99]" : "";
  const classes = cn(base, VARIANT[variant], SIZE[size], press, className);

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" {...rest} className={classes}>
      {children}
    </button>
  );
}

/** The circular arrow control from the reference cards. */
export function IconButton({
  label,
  children,
  href,
  onClick,
  tone = "ink",
  className,
}: {
  label: string;
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  tone?: "ink" | "bone";
  className?: string;
}) {
  const classes = cn(
    "inline-flex size-11 shrink-0 items-center justify-center rounded-full",
    "transition-[transform,background-color] duration-press ease-out-strong active:scale-[0.94]",
    tone === "ink"
      ? "bg-ink/10 text-ink hover:bg-ink/16"
      : "bg-bone/15 text-bone hover:bg-bone/25",
    className,
  );
  if (href) {
    return (
      <Link href={href} aria-label={label} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} onClick={onClick} className={classes}>
      {children}
    </button>
  );
}
