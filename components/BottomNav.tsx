"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChatCircle, House, ListBullets, Sliders } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { feel } from "@/lib/feedback";

/* Four equal tabs, each an icon over its name. Chat is one of them,
   not a special button: it is a place you go, like the others. */

const TABS = [
  { href: "/", label: "Home", icon: House },
  { href: "/expenses", label: "Expenses", icon: ListBullets },
  { href: "/budget", label: "Budget", icon: Sliders },
  { href: "/chat", label: "Chat", icon: ChatCircle },
];

export function BottomNav({ pending }: { pending: number }) {
  const pathname = usePathname();

  return (
    <nav
      className="shrink-0 border-t border-rule bg-bone"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Main"
    >
      <div className="flex items-stretch">
        {TABS.map((t) => (
          <Tab
            key={t.href}
            {...t}
            pathname={pathname}
            badge={t.href === "/chat" ? pending : 0}
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
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; weight?: "regular" | "fill" }>;
  pathname: string;
  badge?: number;
}) {
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      prefetch={true}
      onClick={feel}
      aria-current={active ? "page" : undefined}
      aria-label={badge > 0 ? `${label}, ${badge} waiting on Claude` : undefined}
      className="flex flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-transform duration-press ease-out-strong active:scale-[0.94]"
    >
      <span className="relative flex h-6 items-center justify-center">
        <Icon size={22} weight={active ? "fill" : "regular"} />
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
