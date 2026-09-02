import { parseEntry } from "../lib/parse";
import cats from "../data/seed/categories.json" with { type: "json" };
const C = cats as never;
const cases = [
  "5k fuel at NNPC",
  "2,000 on lunch",
  "spent 3500 naira on bolt yesterday",
  "₦12000 groceries at Ebeano",
  "1.5k shawarma",
  "barber 5000",
  "45k car service",
  "gym 25000 today",
  "tithe 15000",
  "netflix 4800",
  "bought 2 bottles of water",
  "paid mum 100k",
  "laundry",
];
for (const t of cases) {
  const r = parseEntry(t, C);
  console.log(
    String(t).padEnd(34),
    "|", String(r.amount ?? "-").padStart(7),
    "|", (r.categoryId ?? "-").padEnd(13),
    "|", r.label.padEnd(18),
    "|", r.date,
    r.check ? "| CHECK: " + r.check : "",
  );
}
