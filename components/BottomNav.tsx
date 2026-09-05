"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ChatCircle,
  House,
  ListBullets,
  Sliders,
  UserCircle,
} from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/ui/Logo";
import { Wordmark } from "@/components/ui/Text";
import { feel } from "@/lib/feedback";

/* Four equal tabs, each an icon over its name. Chat is one of them,
   not a special button: it is a place you go, like the others. */

const TABS = [
  { href: "/", label: "Home", icon: House },
  { href: "/expenses", label: "Expenses", icon: ListBullets },
  { href: "/budget", label: "Budget", icon: Sliders },
  { href: "/chat", label: "Chat", icon: ChatCircle },
  { href: "/you", label: "Profile", icon: UserCircle },
];

/* Screens where there is nobody signed in (or a lock in the way)
   have no business showing the furniture behind them. */
const BARE = ["/login", "/unlock", "/pin", "/report"];

export function BottomNav({
  pending,
  avatar,
}: {
  pending: number;
  avatar?: string | null;
}) {
  const pathname = usePathname();
  if (BARE.includes(pathname) || pathname.startsWith("/auth/")) return null;

  return (
    <nav
      className="shrink-0 border-t border-rule bg-bone lg:h-full lg:w-56 lg:border-r lg:border-t-0 lg:px-3 lg:pt-7"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Main"
    >
      <span className="hidden items-center gap-1 px-3 pb-8 lg:flex">
        <Logo size={26} className="text-ink" />
        <Wordmark text="biblo" className="text-[1.2rem]" />
      </span>
      <div className="flex items-stretch lg:flex-col lg:gap-1">
        {TABS.map((t) => (
          <Tab
            key={t.href}
            {...t}
            pathname={pathname}
            badge={t.href === "/chat" ? pending : 0}
            face={t.href === "/you" ? avatar ?? undefined : undefined}
          />
        ))}
      </div>
    </nav>
  );
}

function Tab({
  href,
  label,
  icon: Icon,
  pathname,
  badge = 0,
  face,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; weight?: "regular" | "fill" }>;
  pathname: string;
  badge?: number;
  /** The You tab wears the person's own avatar, like the reference. */
  face?: string;
}) {
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      prefetch={true}
      onClick={feel}
      aria-current={active ? "page" : undefined}
      aria-label={badge > 0 ? `${label}, ${badge} being sorted` : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-transform duration-press ease-out-strong active:scale-[0.94]",
        "lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:px-3",
        active && "lg:bg-ink/5",
      )}
    >
      <span className="relative flex h-6 items-center justify-center">
        {face ? (
          <Image
            src={`/avatars/${face}.png`}
            alt=""
            width={24}
            height={24}
            className={cn(
              "size-6 rounded-full object-cover",
              active && "shadow-[0_0_0_2px_var(--color-ink)]",
            )}
          />
        ) : (
          <Icon size={22} weight={active ? "fill" : "regular"} />
        )}
        {badge > 0 ? (
          <span
            className="absolute -right-2 -top-0.5 size-2.5 rounded-full bg-ember ring-2 ring-bone"
            aria-hidden="true"
          />
        ) : null}
      </span>
      <span className={cn("text-label uppercase", active ? "text-ink" : "text-ink/55")}>
        {label}
      </span>
    </Link>
  );
}
