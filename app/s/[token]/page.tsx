import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { notFound } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { Wordmark } from "@/components/ui/Text";
import {
  readShare,
  type LedgerDoc,
  type PeriodDoc,
  type SharedPerson,
  type SharedLine,
} from "@/lib/share";
import { naira, dayLabel } from "@/lib/format";

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
  return {
    title: share ? `${share.title} · Biblo` : "Biblo",
    description: share?.note,
    robots: { index: false, follow: false },
  };
}

export default async function Shared({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ who?: string }>;
}) {
  const { token } = await params;
  const share = await readShare(token);
  if (!share) notFound();

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
          <p className="mt-3 max-w-[48ch] text-meta leading-relaxed text-ink/75">
            {share.note}
          </p>
        ) : null}

        {share.doc.kind === "ledger" ? (
          only ? (
            <Person doc={share.doc} person={only} token={token} />
          ) : (
            <Ledger doc={share.doc} token={token} />
          )
        ) : (
          <Period doc={share.doc} />
        )}

        <footer className="mt-12 border-t border-rule pt-5">
          <p className="text-meta text-ink/55">
            Anyone with this link can read this page. It does not change when
            the books do, and it shows nothing else from them.
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
            <table className="w-full min-w-[34rem] border-y border-rule text-left text-meta">
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
      <Link
        href={`/s/${token}`}
        className="mt-6 inline-flex items-center gap-2 py-2 text-label uppercase text-ink/55 transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} weight="bold" />
        Everyone
      </Link>

      <h2 className="mt-5 text-title font-semibold text-ink">{person.name}</h2>

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
