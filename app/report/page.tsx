import { Logo } from "@/components/ui/Logo";
import { Wordmark } from "@/components/ui/Text";
import { PrintButton } from "@/components/PrintButton";
import { getCategories, getExpenses } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { viewerEmail } from "@/lib/viewer";
import { requirePin } from "@/lib/pin";
import { naira, dayLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

/* The statement. A print-ready report in the house style: the
   period's story on one page - totals, the daily rhythm, where it
   went, then every entry. The browser's print dialog turns it into
   the PDF; the button says so. */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);

export default async function Report({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; category?: string }>;
}) {
  await requirePin();
  const { from = "", to = "", category } = await searchParams;

  if (!DATE.test(from) || !DATE.test(to) || from > to) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-sage px-8 text-center">
        <p className="text-title">
          A statement needs a period: /report?from=YYYY-MM-DD&to=YYYY-MM-DD
        </p>
      </div>
    );
  }

  const [all, categories, settings, email] = await Promise.all([
    getExpenses(),
    getCategories(),
    getSettings(),
    viewerEmail(),
  ]);
  const name = settings.name?.trim() || email?.split("@")[0] || "";
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const kind = new Map(categories.map((c) => [c.id, c.kind]));

  let rows = all.filter((e) => e.date >= from && e.date <= to);
  if (category) rows = rows.filter((e) => e.categoryId === category);
  rows.sort((a, b) =>
    (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")),
  );

  const spendRows = rows.filter((e) => kind.get(e.categoryId) !== "income");
  const out = spendRows.reduce((s, e) => s + Math.abs(e.amountNGN), 0);
  const inn = rows
    .filter((e) => kind.get(e.categoryId) === "income")
    .reduce((s, e) => s + e.amountNGN, 0);

  /* The daily rhythm, one bar per day (capped at 92 days). */
  const days: { date: string; total: number }[] = [];
  for (let d = from; d <= to && days.length < 92; d = addDays(d, 1)) {
    days.push({
      date: d,
      total: spendRows
        .filter((e) => e.date === d)
        .reduce((s, e) => s + Math.abs(e.amountNGN), 0),
    });
  }
  const peak = Math.max(1, ...days.map((d) => d.total));

  /* Where it went, largest first. */
  const byCat = new Map<string, number>();
  for (const e of spendRows) {
    byCat.set(e.categoryId, (byCat.get(e.categoryId) ?? 0) + Math.abs(e.amountNGN));
  }
  const catRows = [...byCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const catPeak = Math.max(1, ...catRows.map(([, v]) => v));

  const W = 560;
  const barW = Math.max(2, Math.floor(W / days.length) - 2);

  return (
    <div className="min-h-dvh bg-sage-dim py-8 print:bg-white print:py-0 [print-color-adjust:exact]">
      <PrintButton />
      <div className="mx-auto max-w-[640px] bg-bone px-8 py-10 shadow-[0_0_0_1px_var(--color-rule)] print:max-w-none print:shadow-none">
        {/* ---- head ---- */}
        <div className="flex items-start justify-between">
          <span className="flex items-center gap-1">
            <Logo size={30} className="text-ink" />
            <Wordmark text="biblo" className="text-[1.4rem]" />
          </span>
          <span className="text-right">
            <p className="text-label uppercase text-ink/50">Statement</p>
            <p className="tnum mt-1 text-meta font-semibold text-ink">
              {dayLabel(from)} — {dayLabel(to)}
            </p>
          </span>
        </div>
        <p className="mt-2 text-meta text-ink/60">
          {name}
          {email ? ` · ${email}` : ""}
          {category ? ` · ${catName.get(category) ?? category}` : ""}
        </p>

        {/* ---- the three numbers ---- */}
        <div className="mt-8 flex divide-x divide-rule border-y border-rule">
          {[
            ["Out", -out],
            ["In", inn],
            ["Net", inn - out],
          ].map(([label, v]) => (
            <div key={label as string} className="flex-1 px-4 py-4">
              <p className="text-label uppercase text-ink/50">{label}</p>
              <p className="tnum mt-1 text-title font-semibold text-ink">
                {naira(v as number, { decimals: 0 })}
              </p>
            </div>
          ))}
        </div>

        {/* ---- daily rhythm ---- */}
        <p className="mt-8 text-label uppercase text-ink/50">Day by day</p>
        <svg
          viewBox={`0 0 ${W} 72`}
          className="mt-3 w-full"
          role="img"
          aria-label="Spending per day"
        >
          {days.map((d, i) => {
            const h = Math.max(d.total > 0 ? 3 : 1, (d.total / peak) * 64);
            return (
              <rect
                key={d.date}
                x={i * (W / days.length) + 1}
                y={68 - h}
                width={barW}
                height={h}
                rx={1.5}
                fill={d.total > 0 ? "#16180F" : "#16180F22"}
              />
            );
          })}
        </svg>
        <div className="mt-1 flex justify-between text-label uppercase text-ink/40">
          <span>{dayLabel(from)}</span>
          <span>{dayLabel(to)}</span>
        </div>

        {/* ---- where it went ---- */}
        {catRows.length > 0 ? (
          <>
            <p className="mt-8 text-label uppercase text-ink/50">Where it went</p>
            <div className="mt-3 space-y-2.5">
              {catRows.map(([id, v]) => (
                <div key={id}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-meta text-ink">{catName.get(id) ?? id}</span>
                    <span className="tnum text-meta font-semibold text-ink">
                      {naira(v, { decimals: 0 })}
                    </span>
                  </div>
                  <div className="mt-1 h-2 bg-ink/10">
                    <div
                      className="h-2 bg-ink"
                      style={{ width: `${Math.max(2, (v / catPeak) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {/* ---- every entry ---- */}
        <p className="mt-8 text-label uppercase text-ink/50">
          Entries ({rows.length})
        </p>
        <table className="mt-3 w-full border-collapse text-meta">
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-t border-rule [page-break-inside:avoid]">
                <td className="tnum py-2 pr-3 align-top text-ink/60">{e.date.slice(5)}</td>
                <td className="py-2 pr-3 align-top text-ink">{e.label}</td>
                <td className="py-2 pr-3 align-top text-ink/60">
                  {catName.get(e.categoryId) ?? e.categoryId}
                </td>
                <td className="tnum py-2 text-right align-top font-semibold text-ink">
                  {naira(e.amountNGN, { decimals: 0 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-10 border-t border-rule pt-4 text-label uppercase text-ink/40">
          Generated {dayLabel(new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }))} ·
          Tell it what you spent. It keeps the score.
        </p>
      </div>
    </div>
  );
}
