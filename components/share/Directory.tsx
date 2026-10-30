"use client";

import { useMemo, useState, ViewTransition } from "react";
import Link from "next/link";
import { ArrowUpRight, MagnifyingGlass, X } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import type { CollectionDoc } from "@/lib/share";

/* The front page of a set of guides. No navigation: a headline, a
   field to narrow the list, a chip per kind of trip, and a card per
   guide that sells it in a line or two, its words laid on its photo.
   Every card is the same card. */

type Item = CollectionDoc["items"][number];

export function Directory({ doc, from }: { doc: CollectionDoc; from: string }) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);

  const tags = useMemo(() => [...new Set(doc.items.map((i) => i.tag))], [doc.items]);
  const shown = doc.items.filter((i) => {
    if (tag && i.tag !== tag) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${i.title} ${i.story} ${i.tag} ${i.meta}`.toLowerCase().includes(q);
  });

  return (
    <>
      <h1 className="mt-10 max-w-[14ch] text-display text-ink [text-wrap:balance] sm:mt-14">
        {doc.heading}
      </h1>
      {doc.intro ? (
        <p className="mt-4 max-w-[52ch] text-body leading-relaxed text-ink/70">{doc.intro}</p>
      ) : null}

      <label className="mt-8 flex items-center gap-3 border border-rule bg-bone px-4 py-3 focus-within:border-ink/40">
        <MagnifyingGlass size={18} weight="bold" className="shrink-0 text-ink/50" />
        <input
          id="guide-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={doc.search ?? "Where would you like to go?"}
          className="chat-field min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink/40 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear the search"
            className="shrink-0 text-ink/50 hover:text-ink"
          >
            <X size={16} weight="bold" />
          </button>
        ) : null}
      </label>

      {tags.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {[null, ...tags].map((t) => (
            <button
              key={t ?? "all"}
              type="button"
              onClick={() => setTag(t)}
              aria-pressed={tag === t}
              className={cn(
                "px-3.5 py-2.5 text-label uppercase transition-colors duration-press",
                tag === t ? "bg-ink text-bone" : "bg-bone text-ink/70 ring-1 ring-inset ring-ink/10 hover:text-ink",
              )}
            >
              {t ?? "All"}
            </button>
          ))}
        </div>
      ) : null}

      {shown.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {shown.map((item) => (
            <OnPhoto key={item.token} item={item} from={from} />
          ))}
        </div>
      ) : (
        <p className="mt-8 border-t border-rule pt-5 text-meta text-ink/60">
          Nothing here matches “{query.trim()}” yet.
        </p>
      )}
    </>
  );
}

function href(item: Item, from: string) {
  return `/s/${item.token}?from=${from}`;
}

/* The words laid on the photo, darkened underneath so they read. */
function OnPhoto({ item, from }: { item: Item; from: string }) {
  return (
    <Link
      href={href(item, from)}
      transitionTypes={["nav-forward"]}
      className="group relative flex min-h-[30rem] flex-col justify-end overflow-hidden bg-moss text-bone"
    >
      <ViewTransition name={`guide-photo-${item.token}`} share="photo-morph" default="none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.image}
          alt={item.alt}
          className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out-strong group-hover:scale-[1.03]"
        />
      </ViewTransition>
      <span
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(to_top,oklch(0.204_0.017_118/0.88)_0%,oklch(0.204_0.017_118/0.55)_38%,transparent_70%)]"
      />
      <span className="relative flex flex-col p-5">
        <span className="flex items-start justify-between gap-3">
          <span className="text-title font-semibold">{item.title}</span>
          <span className="shrink-0 px-2 py-1 text-label uppercase ring-1 ring-inset ring-bone/50">
            {item.tag}
          </span>
        </span>
        <span className="mt-2 text-meta leading-relaxed text-bone/85">{item.story}</span>
        <span className="mt-3 text-meta font-medium">{item.meta}</span>
        <span className="mt-4 flex items-center justify-center gap-2 bg-bone py-3.5 text-label uppercase text-ink transition-colors group-hover:bg-bone/90">
          Open the guide <ArrowUpRight size={13} weight="bold" />
        </span>
      </span>
    </Link>
  );
}
