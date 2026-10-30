import type { Metadata } from "next";
import Link from "next/link";
import { ViewTransition } from "react";
import { ArrowLeft, ArrowUpRight, WarningDiamond, Moon } from "@phosphor-icons/react/ssr";
import { notFound } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { Wordmark } from "@/components/ui/Text";
import {
  readShare,
  type LedgerDoc,
  type PeriodDoc,
  type GuideDoc,
  type GuideDay,
  type GuideStop,
  type SharedPerson,
  type SharedLine,
} from "@/lib/share";
import { naira, dayLabel } from "@/lib/format";
import { Directory } from "@/components/share/Directory";

/* A page of someone's books, open to anyone holding the link.
   No session, no sign-in, nothing live: what it shows was written
   once when the link was made. See lib/share for why. */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const share = await readShare((await params).token);
  /* The picture a link preview shows: a guide's cover, or the first
     card's photo on a front page. */
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const pic =
    share?.doc.kind === "collection"
      ? share.doc.items[0]?.image
      : share?.doc.kind === "guide"
        ? share.doc.cover
        : undefined;
  return {
    title: share ? `${share.title} · Biblo` : "Biblo",
    description: share?.note,
    robots: { index: false, follow: false },
    openGraph: pic && host ? { images: [`https://${host}${pic}`] } : undefined,
  };
}

export default async function Shared({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ who?: string; from?: string }>;
}) {
  const { token } = await params;
  const share = await readShare(token);
  if (!share) notFound();

  /* A front page gets the whole width: it is a place to start, not a
     document to read down. */
  if (share.doc.kind === "collection") {
    return (
      <ViewTransition
        key={token}
        enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "page-fade" }}
        exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "page-fade" }}
        default="none"
      >
      <div className="min-h-dvh bg-sage-dim">
        <main className="mx-auto max-w-[68rem] px-5 pb-16 pt-6 sm:px-9 sm:pt-10">
          <header className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1">
              <Logo size={28} className="text-ink" />
              <Wordmark text="biblo" className="text-[1.3rem]" />
            </span>
            <span className="text-meta text-ink/60">Put together by {share.by}</span>
          </header>
          <Directory doc={share.doc} from={token} />
          <footer className="mt-14 border-t border-rule pt-5">
            <p className="text-meta text-ink/55">
              Every guide here comes from a trip that was actually taken. Prices move, so check
              the big ones before you go.
            </p>
            <Link
              href="/"
              className="mt-3 inline-block text-meta font-medium text-ink underline underline-offset-4"
            >
              What is Biblo?
            </Link>
          </footer>
        </main>
      </div>
      </ViewTransition>
    );
  }

  /* Opened from a front page: the way back sits beside the title. */
  const from = (await searchParams).from;
  const home = from && from !== token ? await readShare(from) : null;
  const back = home?.doc.kind === "collection" ? from : undefined;

  /* A guide reads like the app: the photo across the top with
     nothing above it, then a bar with the title that stays put while
     the page scrolls under it, all on the app's own sage ground. */
  if (share.doc.kind === "guide") {
    const doc = share.doc;
    return (
      <ViewTransition
        key={token}
        enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "page-fade" }}
        exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "page-fade" }}
        default="none"
      >
      <div className="min-h-dvh bg-sage-dim">
        {doc.cover ? (
          /* The same photo as the card it was opened from: it grows
             from the card into the cover instead of being replaced. */
          <ViewTransition name={`guide-photo-${token}`} share="photo-morph" default="none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={doc.cover}
              alt=""
              className="block aspect-[4/3] max-h-[70vh] w-full object-cover sm:aspect-[21/9]"
            />
          </ViewTransition>
        ) : null}
        <div className="sticky top-0 z-10 border-b border-rule bg-sage-dim">
          <div className="mx-auto flex max-w-[44rem] items-center justify-between gap-4 px-5 py-3 sm:px-9">
            <h1 className="flex min-w-0 items-center gap-1 text-title font-semibold text-ink">
              {back ? (
                <Link
                  href={`/s/${back}`}
                  transitionTypes={["nav-back"]}
                  aria-label="Back to all the guides"
                  className="-ml-2 inline-flex size-8 shrink-0 items-center justify-center text-ink/70 hover:text-ink"
                >
                  <ArrowLeft size={18} weight="bold" />
                </Link>
              ) : null}
              <span className="truncate">{share.title}</span>
            </h1>
            <span className="flex shrink-0 items-center gap-1">
              <Logo size={22} className="text-ink" />
              <Wordmark text="biblo" className="text-[1.05rem]" />
            </span>
          </div>
        </div>
        <main className="mx-auto max-w-[44rem] px-5 pb-12 pt-3 sm:px-9">
          {/* Lined up with the title's words, not with the arrow. */}
          <p className={`text-meta text-ink/60 ${back ? "pl-7" : ""}`}>Put together by {share.by}</p>
          {share.note ? (
            <p className="mt-3 text-meta leading-relaxed text-ink/75">{share.note}</p>
          ) : null}
          <Guide doc={doc} />
          <footer className="mt-12 border-t border-rule pt-5">
            <p className="text-meta text-ink/55">
              {doc.footer ??
                "Prices are what was paid on the trip this came from, in late 2026. Border fees in particular move, so take them as a guide, not a quote."}
            </p>
            <Link
              href="/"
              className="mt-3 inline-block text-meta font-medium text-ink underline underline-offset-4"
            >
              What is Biblo?
            </Link>
          </footer>
        </main>
      </div>
      </ViewTransition>
    );
  }

  /* One person's own page. The name is in the URL so it can be sent
     to them directly - the whole point is that someone who is not
     in this group's accounting should be able to open a link and
     see their own column, not scroll a hundred lines looking for
     themselves. An unknown name just shows everybody. */
  const asked = (await searchParams).who;
  const only =
    share.doc.kind === "ledger"
      ? share.doc.people.find((p) => p.name === asked)
      : undefined;

  return (
    <div className="min-h-dvh bg-sage-dim py-6 sm:py-10">
      <main className="mx-auto max-w-[44rem] bg-bone px-5 py-8 shadow-[0_0_0_1px_var(--color-rule)] sm:px-9 sm:py-10">
        <header className="flex items-start justify-between gap-4">
          <span className="flex items-center gap-1">
            <Logo size={28} className="text-ink" />
            <Wordmark text="biblo" className="text-[1.3rem]" />
          </span>
          <span className="text-right">
            <p className="text-label uppercase text-ink/50">Shared</p>
            <p className="tnum mt-1 text-meta text-ink/70">
              {dayLabel(share.createdAt.slice(0, 10))}
            </p>
          </span>
        </header>

        <h1 className="mt-7 text-title font-semibold text-ink">{share.title}</h1>
        <p className="mt-1 text-meta text-ink/60">Put together by {share.by}</p>
        {share.note ? (
          <p className="mt-3 text-meta leading-relaxed text-ink/75">
            {share.note}
          </p>
        ) : null}

        {share.doc.kind === "ledger" ? (
          only ? (
            <Person doc={share.doc} person={only} token={token} />
          ) : (
            <Ledger doc={share.doc} token={token} />
          )
        ) : share.doc.kind === "period" ? (
          <Period doc={share.doc} />
        ) : null}

        <footer className="mt-12 border-t border-rule pt-5">
          <p className="text-meta text-ink/55">
            Anyone with this link can read this page. It does not change when the books do, and it shows
            nothing else from them.
          </p>
          <Link
            href="/"
            className="mt-3 inline-block text-meta font-medium text-ink underline underline-offset-4"
          >
            What is Biblo?
          </Link>
        </footer>
      </main>
    </div>
  );
}

/* --- a trip for other people to follow ------------------------
   Read top to bottom the way the trip happens: what to sort before
   leaving, the days in order, where to sleep, and the long way north
   kept apart with its warning attached. */

function Guide({ doc }: { doc: GuideDoc }) {
  return (
    <>
      {doc.summary ? (
        <p className="mt-5 text-body leading-relaxed text-ink">{doc.summary}</p>
      ) : null}

      <dl className="mt-6 grid grid-cols-2 gap-px border-y border-rule bg-rule sm:grid-cols-4">
        {doc.facts.map((f) => (
          <div key={f.label} className="bg-bone px-3 py-3">
            <dt className="text-label uppercase text-ink/50">{f.label}</dt>
            <dd className="tnum mt-1 text-meta font-semibold text-ink">{f.value}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-10 text-label uppercase text-ink/50">{doc.beforeTitle ?? "Before you leave"}</h2>
      <div className="mt-3 grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {doc.before.map((b) => (
          <section key={b.title}>
            <h3 className="text-meta font-semibold text-ink">{b.title}</h3>
            <ul className="mt-2 flex flex-col gap-1.5">
              {b.points.map((p) => (
                <li key={p} className="flex gap-2 text-meta leading-relaxed text-ink/75">
                  <span aria-hidden className="mt-[0.6em] size-1 shrink-0 bg-ink/40" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {doc.sections?.map((sec) => (
        <section key={sec.title}>
          <h2 className="mt-12 text-label uppercase text-ink/50">{sec.title}</h2>
          {sec.intro ? <p className="mt-2 text-meta leading-relaxed text-ink/70">{sec.intro}</p> : null}
          <ul className="mt-3 flex flex-col divide-y divide-rule border-y border-rule">
            {sec.stops.map((s) => (
              <li key={s.name} className="py-4">
                <Stop s={s} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {doc.days.length > 0 ? (
        <>
          <h2 className="mt-12 text-label uppercase text-ink/50">The days</h2>
          <Days days={doc.days} />
        </>
      ) : null}
      {doc.short ? (
        <p className="mt-4 border-l-2 border-ink/20 pl-3 text-meta leading-relaxed text-ink/70">
          {doc.short}
        </p>
      ) : null}

      {doc.budget ? (
        <>
          <h2 className="mt-12 text-label uppercase text-ink/50">What it costs</h2>
          <p className="mt-2 text-meta leading-relaxed text-ink/70">{doc.budget.intro}</p>
          <dl className="mt-3 divide-y divide-rule border-y border-rule">
            {doc.budget.rows.map((r) => (
              <div
                key={r.item}
                className={`flex items-baseline justify-between gap-4 py-2.5 ${r.strong ? "bg-bone px-3 -mx-3" : ""}`}
              >
                <dt className={`text-meta ${r.strong ? "font-semibold text-ink" : "text-ink/75"}`}>{r.item}</dt>
                <dd className={`tnum shrink-0 text-right text-meta ${r.strong ? "font-semibold text-ink" : "text-ink"}`}>{r.each}</dd>
              </div>
            ))}
          </dl>
          {doc.budget.total ? (
            <p className="mt-3 text-meta leading-relaxed text-ink/70">{doc.budget.total}</p>
          ) : null}
        </>
      ) : null}

      {doc.stays.length > 0 ? (
      <h2 className="mt-12 text-label uppercase text-ink/50">Where to stay</h2>
      ) : null}
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {doc.stays.map((st) => (
          <a
            key={st.url}
            href={st.url}
            target="_blank"
            rel="noreferrer"
            className="group flex flex-col bg-bone ring-1 ring-inset ring-ink/10 transition-colors hover:ring-ink/30"
          >
            {st.image ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={st.image}
                alt={`The listing photo for ${st.name}`}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="aspect-[16/10] w-full object-cover"
              />
            ) : null}
            <span className="flex flex-1 flex-col p-4">
              <span className="flex items-start justify-between gap-3">
                <span className="text-body font-semibold text-ink">{st.name}</span>
                {st.tag ? (
                  <span className="shrink-0 bg-moss px-1.5 py-0.5 text-label uppercase text-bone">
                    {st.tag}
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 text-meta text-ink/60">
                {st.where} · sleeps {st.sleeps}
              </span>
              {st.listing ? <span className="mt-2 text-meta text-ink/50">{st.listing}</span> : null}
              {st.note ? (
                <span className="mt-2 text-meta leading-relaxed text-ink/75">{st.note}</span>
              ) : null}
              <span className="mt-auto flex items-center gap-1 pt-3 text-label uppercase text-ink/60 group-hover:text-ink">
                See the listing <ArrowUpRight size={12} weight="bold" />
              </span>
            </span>
          </a>
        ))}
      </div>

      {doc.extension ? (
        <>
          <h2 className="mt-12 text-label uppercase text-ink/50">{doc.extension.title}</h2>
          <p className="mt-1 text-meta text-ink/60">{doc.extension.adds}</p>
          <p className="mt-3 flex gap-2 bg-ember/10 p-3 text-meta leading-relaxed text-ink ring-1 ring-inset ring-ember/40">
            <WarningDiamond size={16} weight="fill" className="mt-0.5 shrink-0 text-ember" />
            <span>{doc.extension.warning}</span>
          </p>
          <Days days={doc.extension.days} />
        </>
      ) : null}
    </>
  );
}

function Stop({ s }: { s: GuideStop }) {
  return (
    <div className="text-meta leading-relaxed">
      <span className="flex flex-wrap items-baseline gap-x-2">
        {s.link ? (
          <a
            href={s.link}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink"
          >
            {s.name}
          </a>
        ) : (
          <span className="font-semibold text-ink">{s.name}</span>
        )}
        {s.cost ? <span className="tnum text-ink/50">{s.cost}</span> : null}
      </span>
      <span className="block text-ink/70">{s.what}</span>
      {s.warn ? (
        <span className="mt-1 flex gap-1.5 text-ink/80">
          <WarningDiamond size={14} weight="fill" className="mt-[0.2em] shrink-0 text-ember" />
          {s.warn}
        </span>
      ) : null}
    </div>
  );
}

function Days({ days }: { days: GuideDay[] }) {
  return (
    <ol className="mt-3 flex flex-col">
      {days.map((d) => (
        <li
          key={d.day}
          className="grid grid-cols-[3.25rem_1fr] gap-x-3 border-t border-rule py-5 first:border-t-0"
        >
          <span className="text-label uppercase leading-tight text-ink/50">
            Day
            <span className="tnum mt-0.5 block text-title font-semibold normal-case tracking-normal text-ink">
              {d.day}
            </span>
          </span>
          <div className="min-w-0">
            <h3 className="text-body font-semibold text-ink">{d.title}</h3>
            <ul className="mt-3 flex flex-col gap-3">
              {d.stops.map((s) => (
                <li key={s.name} className="text-meta leading-relaxed">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    {s.link ? (
                      <a
                        href={s.link}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink"
                      >
                        {s.name}
                      </a>
                    ) : (
                      <span className="font-semibold text-ink">{s.name}</span>
                    )}
                    {s.cost ? <span className="tnum text-ink/50">{s.cost}</span> : null}
                  </span>
                  <span className="block text-ink/70">{s.what}</span>
                  {s.warn ? (
                    <span className="mt-1 flex gap-1.5 text-ink/80">
                      <WarningDiamond
                        size={14}
                        weight="fill"
                        className="mt-[0.2em] shrink-0 text-ember"
                      />
                      {s.warn}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            {d.night ? (
              <p className="mt-3 flex items-center gap-1.5 text-label uppercase text-ink/50">
                <Moon size={12} weight="bold" /> {d.night}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* --- a pot several people paid into -------------------------- */

function Ledger({ doc, token }: { doc: LedgerDoc; token: string }) {
  const gap = doc.totalIn - doc.totalSpent;
  const widest = Math.max(
    1,
    ...doc.people.map((p) => Math.max(p.paidIn, p.used)),
  );

  return (
    <>
      <div className="mt-8 flex flex-wrap divide-x divide-rule border-y border-rule">
        {[
          ["Paid in", doc.totalIn],
          ["Spent", -doc.totalSpent],
          [gap >= 0 ? "Left" : "Short by", gap],
        ].map(([label, v]) => (
          <div key={label as string} className="min-w-[8rem] flex-1 px-4 py-4">
            <p className="text-label uppercase text-ink/50">{label}</p>
            <p className="tnum mt-1 text-title font-semibold text-ink">
              {naira(v as number, { decimals: 0 })}
            </p>
          </div>
        ))}
      </div>

      <h2 className="mt-9 text-label uppercase text-ink/50">
        Where everyone stands
      </h2>
      <ul className="mt-4 flex flex-col gap-4">
        {doc.people.map((p) => (
          <li key={p.name}>
            <Link
              href={`/s/${token}?who=${encodeURIComponent(p.name)}`}
              className="flex items-baseline justify-between gap-3 hover:underline"
            >
              <span className="text-body font-medium text-ink">{p.name}</span>
              <span
                className={`tnum text-body font-semibold ${
                  p.balance < 0 ? "text-ember" : "text-positive"
                }`}
              >
                {naira(p.balance, { sign: true, decimals: 0 })}
              </span>
            </Link>
            {/* Paid in above, used below, on one shared scale. */}
            <div className="mt-1.5 flex flex-col gap-0.5">
              <Bar value={p.paidIn} of={widest} tone="bg-moss" />
              <Bar value={p.used} of={widest} tone="bg-amber" />
            </div>
            <p className="tnum mt-1 text-meta text-ink/55">
              paid {naira(p.paidIn, { decimals: 0 })} · used{" "}
              {naira(p.used, { decimals: 0 })}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-meta text-ink/55">
        Tap a name for only the lines that touch them.
      </p>
      <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-meta text-ink/55">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 bg-moss" aria-hidden /> paid in
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 bg-amber" aria-hidden /> used
        </span>
      </p>

      <h2 className="mt-10 text-label uppercase text-ink/50">
        Every line, {doc.lines.length} of them
      </h2>
      <ul className="mt-3 divide-y divide-rule border-y border-rule">
        {doc.lines.map((l, i) => {
          const split = describeSplit(l.who, doc.people);
          return (
            <li key={i} className="flex items-baseline justify-between gap-4 py-2.5">
              <span className="min-w-0">
                <span className="text-meta text-ink">{l.label}</span>
                <span className="mt-0.5 block text-meta text-ink/50">
                  {l.note ? `${l.note} · ` : ""}
                  {split.who}
                </span>
              </span>
              <span className="tnum shrink-0 text-right text-meta text-ink">
                {naira(l.amount, { decimals: 0 })}
                <span className="block text-ink/50">
                  {l.original
                    ? `${l.original.amount.toLocaleString()} ${l.original.currency}`
                    : null}
                  {l.original && split.heads > 1 ? " · " : null}
                  {split.heads > 1
                    ? `${naira(l.amount / split.heads, { decimals: 0 })} each`
                    : null}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {doc.open?.length ? (
        <>
          <h2 className="mt-10 text-label uppercase text-ink/50">
            Not accounted for
          </h2>
          {doc.unclaimed?.length ? <Unclaimed groups={doc.unclaimed} /> : null}
          <p className="mt-8 text-meta text-ink/60">
            And two notes on the figures above.
          </p>
          <ol className="mt-3 flex flex-col gap-2.5">
            {doc.open.map((o, i) => (
              <li key={i} className="flex gap-3 text-meta text-ink/80">
                <span className="tnum shrink-0 text-ink/40">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{o}</span>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </>
  );
}

/* Who carried a line, said the way a person would say it out loud.
 *  An empty list means everybody. Past a handful of names it is
 *  shorter to say who was left out than who was in, and the count
 *  comes first either way, because the question a reader is actually
 *  asking is how many ways this was cut. */
function describeSplit(who: string[] | undefined, people: SharedPerson[]) {
  const everyone = people.length;
  const heads = who?.length ? who.length : everyone;

  if (!who?.length) return { heads, who: `split ${everyone} ways, everyone` };
  if (heads === 1) return { heads, who: `${who[0]} alone` };
  if (heads === everyone) return { heads, who: `split ${everyone} ways, everyone` };

  const out = people.map((p) => p.name).filter((n) => !who.includes(n));
  return {
    heads,
    who:
      out.length < heads
        ? `split ${heads} ways, everyone except ${list(out)}`
        : `split ${heads} ways, ${list(who)}`,
  };
}

const list = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/* What is still left on a receipt nobody has finished claiming.
 *  A table rather than prose, because the reader is matching lines
 *  against a paper receipt in French: the printed name comes first. */
function Unclaimed({ groups }: { groups: NonNullable<LedgerDoc["unclaimed"]> }) {
  const shown = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.left > 0) }))
    .filter((g) => g.items.length);
  const total = shown
    .flatMap((g) => g.items)
    .reduce((s, i) => s + i.left * i.unit, 0);

  return (
    <div className="mt-3">
      <p className="text-meta text-ink/60">
        From the Super U receipt of 4 October, still unclaimed:{" "}
        <span className="tnum font-semibold text-ink">
          {total.toLocaleString()} CFA
        </span>
        , split ten ways until someone claims it.
      </p>
      {shown.map((g) => (
        <section key={g.group} className="mt-5">
          <h3 className="text-label uppercase text-ink/50">{g.group}</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[34rem] table-fixed border-y border-rule text-left text-meta">
              {/* Fixed widths so every group's columns line up with the next. */}
              <colgroup>
                <col className="w-[32%]" />
                <col className="w-[22%]" />
                <col className="w-[14%]" />
                <col className="w-[22%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead>
                <tr className="text-label uppercase text-ink/45">
                  <th className="py-2 pr-3 font-medium">On the receipt</th>
                  <th className="py-2 pr-3 font-medium">English</th>
                  <th className="py-2 pr-3 text-right font-medium">Bought</th>
                  <th className="py-2 pr-3 font-medium">Claimed</th>
                  <th className="py-2 text-right font-medium">Left</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule border-t border-rule">
                {g.items.map((it) => (
                  <tr key={it.name} className="align-top">
                    <td className="py-2.5 pr-3 text-ink">{it.fr ?? it.name}</td>
                    <td className="py-2.5 pr-3 text-ink/60">{it.name}</td>
                    <td className="tnum py-2.5 pr-3 text-right text-ink/70">
                      {it.qty} × {it.unit.toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-3 text-ink/60">
                      {it.claimed.length ? it.claimed.join(", ") : "none"}
                    </td>
                    <td className="tnum py-2.5 text-right">
                      <span className="font-semibold text-ember">{it.left}</span>
                      <span className="block text-ink/50">
                        {(it.left * it.unit).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function Bar({
  value,
  of,
  tone,
}: {
  value: number;
  of: number;
  tone: string;
}) {
  return (
    <span className="block h-2 w-full bg-ink/5">
      <span
        className={`block h-full ${tone}`}
        style={{ width: `${Math.max(1, (value / of) * 100)}%` }}
      />
    </span>
  );
}

/* --- one person's own column -------------------------------- */

function Person({
  doc,
  person,
  token,
}: {
  doc: LedgerDoc;
  person: SharedPerson;
  token: string;
}) {
  const mine = doc.lines
    .map((l) => {
      const heads = l.who?.length ? l.who.length : doc.people.length;
      const on = !l.who?.length || l.who.includes(person.name);
      return on ? { line: l, heads, share: l.amount / heads } : null;
    })
    .filter((x): x is { line: SharedLine; heads: number; share: number } => x !== null);

  const spent = mine.reduce((s, m) => s + m.share, 0);
  const credit = doc.creditEach ?? 0;

  /* Grouped by where the money went, in the order the trip
     happened, because a hundred lines in one list is the thing
     this page exists to avoid. */
  const places: { place: string; rows: typeof mine }[] = [];
  for (const m of mine) {
    const place = m.line.note ?? "Other";
    const last = places[places.length - 1];
    if (last && last.place === place) last.rows.push(m);
    else places.push({ place, rows: [m] });
  }

  return (
    <>
      <div className="mt-6 flex items-center gap-1.5">
        <Link
          href={`/s/${token}`}
          aria-label="Back to everyone"
          className="-ml-2 flex size-9 items-center justify-center text-ink/70 transition-colors hover:text-ink"
        >
          <ArrowLeft size={18} weight="bold" />
        </Link>
        <h2 className="text-title font-semibold text-ink">{person.name}</h2>
      </div>

      <div className="mt-5 flex flex-wrap divide-x divide-rule border-y border-rule">
        {[
          ["Paid in", person.paidIn],
          ["Used", -person.used],
          [person.balance < 0 ? "Owes" : "Owed back", -Math.abs(person.balance)],
        ].map(([label, v]) => (
          <div key={label as string} className="min-w-[8rem] flex-1 px-4 py-4">
            <p className="text-label uppercase text-ink/50">{label}</p>
            <p className="tnum mt-1 text-title font-semibold text-ink">
              {naira(Math.abs(v as number), { decimals: 0 })}
            </p>
          </div>
        ))}
      </div>

      {places.map(({ place, rows }, i) => (
        <section key={place + i} className="mt-7">
          <h3 className="text-label uppercase text-ink/50">{place}</h3>
          <ul className="mt-2 divide-y divide-rule border-y border-rule">
            {rows.map(({ line, heads, share }, j) => (
              <li
                key={j}
                className="flex items-baseline justify-between gap-4 py-2.5"
              >
                <span className="min-w-0">
                  <span className="text-meta text-ink">{line.label}</span>
                  <span className="mt-0.5 block text-meta text-ink/50">
                    {heads > 1
                      ? `${naira(line.amount, { decimals: 0 })} split ${heads} ways`
                      : "theirs alone"}
                  </span>
                </span>
                <span className="tnum shrink-0 text-meta font-medium text-ink">
                  {naira(share, { decimals: 0 })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="mt-8 border-t border-rule pt-4">
        <Row label="Everything above" value={spent} />
        {credit ? (
          <Row label="Share of the cash left over" value={-credit} />
        ) : null}
        <Row label="Used" value={person.used} strong />
        <Row label="Paid in" value={-person.paidIn} />
        <Row
          label={person.balance < 0 ? "Still owes" : "Owed back"}
          value={Math.abs(person.balance)}
          strong
        />
      </div>
    </>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <p
      className={`flex items-baseline justify-between gap-4 py-1.5 ${
        strong ? "text-body font-semibold text-ink" : "text-meta text-ink/70"
      }`}
    >
      <span>{label}</span>
      <span className="tnum">{naira(value, { decimals: 0 })}</span>
    </p>
  );
}

/* --- a stretch of one person's own books --------------------- */

function Period({ doc }: { doc: PeriodDoc }) {
  return (
    <>
      <div className="mt-8 flex divide-x divide-rule border-y border-rule">
        {[
          ["Out", -doc.totalOut],
          ["In", doc.totalIn],
          ["Net", doc.totalIn - doc.totalOut],
        ].map(([label, v]) => (
          <div key={label as string} className="flex-1 px-4 py-4">
            <p className="text-label uppercase text-ink/50">{label}</p>
            <p className="tnum mt-1 text-title font-semibold text-ink">
              {naira(v as number, { decimals: 0 })}
            </p>
          </div>
        ))}
      </div>

      <h2 className="mt-9 text-label uppercase text-ink/50">
        {dayLabel(doc.from)} to {dayLabel(doc.to)}
      </h2>
      <ul className="mt-3 divide-y divide-rule border-y border-rule">
        {doc.rows.map((r, i) => (
          <li key={i} className="flex items-baseline justify-between gap-4 py-2.5">
            <span className="min-w-0">
              <span className="text-meta text-ink">{r.label}</span>
              <span className="mt-0.5 block text-meta text-ink/50">
                {dayLabel(r.date)} · {r.category}
                {r.note ? ` · ${r.note}` : ""}
              </span>
            </span>
            <span className="tnum shrink-0 text-meta text-ink">
              {naira(r.amount, { decimals: 0 })}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
