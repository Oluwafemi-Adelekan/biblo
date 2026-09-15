import { NextResponse, type NextRequest } from "next/server";

/* TEMPORARY. Times the app's own pages from inside the platform, so
   the measurement is not polluted by the public internet. Behind the
   middleware like every /api route; forwards the caller's cookies. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cookie = req.headers.get("cookie") ?? "";
  const origin = req.nextUrl.origin;
  const out: Record<string, number | string> = { region: process.env.VERCEL_REGION ?? "?" };
  for (const p of ["/api/health", "/", "/expenses", "/budget", "/you", "/chat"]) {
    const t0 = performance.now();
    const r = await fetch(`${origin}${p}`, { headers: { cookie, RSC: "1" }, redirect: "manual", cache: "no-store" });
    await r.text();
    out[p] = `${Math.round(performance.now() - t0)}ms (${r.status})`;
  }
  return NextResponse.json(out);
}
