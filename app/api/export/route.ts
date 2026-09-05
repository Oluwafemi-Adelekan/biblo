import { NextResponse, type NextRequest } from "next/server";
import { getCategories, getExpenses } from "@/lib/data";

/* Your period, as a file. A spreadsheet-ready CSV of every entry
   between two dates - the Expenses page links here with its current
   view, and the chat hands these links out on request. Scoped like
   everything else: you export only your own books. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const cell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  const category = req.nextUrl.searchParams.get("category");

  if (!DATE.test(from) || !DATE.test(to) || from > to) {
    return new NextResponse("Give from and to as YYYY-MM-DD.", { status: 400 });
  }

  const [all, categories] = await Promise.all([getExpenses(), getCategories()]);
  const name = new Map(categories.map((c) => [c.id, c.name]));

  let rows = all.filter((e) => e.date >= from && e.date <= to);
  if (category) rows = rows.filter((e) => e.categoryId === category);
  rows.sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));

  const out = rows.filter((e) => e.amountNGN < 0).reduce((s, e) => s + Math.abs(e.amountNGN), 0);
  const inn = rows.filter((e) => e.amountNGN > 0).reduce((s, e) => s + e.amountNGN, 0);

  const lines = [
    ["Date", "Time", "Label", "Category", "Amount (NGN)", "Method", "Note", "Items"].join(","),
    ...rows.map((e) =>
      [
        e.date,
        e.time ?? "",
        cell(e.label),
        cell(name.get(e.categoryId) ?? e.categoryId),
        e.amountNGN,
        e.method === "unknown" ? "" : e.method,
        cell(e.note ?? ""),
        cell((e.items ?? []).map((i) => `${i.name} x${i.qty} @${i.unit}`).join("; ")),
      ].join(","),
    ),
    "",
    ["", "", "Total out", "", -out].join(","),
    ["", "", "Total in", "", inn].join(","),
    ["", "", "Net", "", inn - out].join(","),
  ];

  // The BOM makes Excel read the naira signs and accents correctly.
  const csv = "﻿" + lines.join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="biblo-${from}-to-${to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
