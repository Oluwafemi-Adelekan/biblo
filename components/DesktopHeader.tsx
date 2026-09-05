"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";

/* Desktop only: the strip that runs across the top of the content
   area, naming the page the way the reference does. It stays put
   while the page scrolls, and it is where each page's tools land
   (month picker, download) via HeaderPortal. The face shows only on
   chat - everywhere else the rail's Profile tab already carries it. */

const TITLES: [string, string][] = [
  ["/expenses/", "Expense"],
  ["/expenses", "Expenses"],
  ["/budget", "Budget"],
  ["/chat", "Chat"],
  ["/you", "Profile"],
  ["/", "Home"],
];

const BARE = ["/login", "/unlock", "/pin", "/report"];

export function DesktopHeader({
  name,
  avatar,
}: {
  name: string | null;
  avatar: string | null;
}) {
  const pathname = usePathname();
  if (BARE.includes(pathname) || pathname.startsWith("/auth/")) return null;

  const title =
    TITLES.find(([p]) => (p === "/" ? pathname === "/" : pathname.startsWith(p)))?.[1] ??
    "Biblo";
  const isChat = pathname.startsWith("/chat");

  return (
    <header className="sticky top-0 z-30 hidden h-[3.75rem] w-full shrink-0 items-center justify-between border-b border-rule bg-bone px-8 lg:flex">
      <p className="text-title text-ink">{title}</p>
      {isChat ? (
        <span className="flex items-center gap-2.5">
          {name ? <span className="text-meta text-ink/70">{name}</span> : null}
          {avatar ? (
            <Image
              src={`/avatars/${avatar}.png`}
              alt=""
              width={32}
              height={32}
              className="size-8 rounded-full object-cover"
            />
          ) : null}
        </span>
      ) : (
        <span id="header-tools" className="flex items-center gap-1" />
      )}
    </header>
  );
}
