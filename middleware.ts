import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, lockState, same, token } from "@/lib/auth";

/* Runs before every page. Three outcomes:
   - open          nothing set locally, straight through
   - locked        needs the cookie, otherwise off to /unlock
   - misconfigured deployed with no passcode: serve nothing at all */

export async function middleware(req: NextRequest) {
  const state = lockState({
    passcode: process.env.BIBLO_PASSCODE,
    secret: process.env.BIBLO_SESSION_SECRET,
    production: process.env.NODE_ENV === "production",
  });

  if (state.mode === "open") return NextResponse.next();

  if (state.mode === "misconfigured") {
    return new NextResponse(
      "Biblo is deployed without a passcode, so it is refusing to serve.\n" +
        "Set BIBLO_PASSCODE and BIBLO_SESSION_SECRET in the environment.",
      { status: 503, headers: { "Content-Type": "text/plain" } },
    );
  }

  const { pathname } = req.nextUrl;
  if (pathname === "/unlock") return NextResponse.next();
  // Vercel's cron calls this on a schedule and has no cookie. It
  // carries its own bearer token instead, checked in the route.
  if (pathname.startsWith("/api/cron/")) return NextResponse.next();

  const expected = await token(process.env.BIBLO_SESSION_SECRET!);
  const got = req.cookies.get(COOKIE)?.value ?? "";
  if (same(got, expected)) return NextResponse.next();

  const to = req.nextUrl.clone();
  to.pathname = "/unlock";
  // Come back to whatever was being asked for.
  to.search = pathname === "/" ? "" : `?to=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(to);
}

export const config = {
  /* Everything except Next's own assets. /api is included on purpose:
     the upload and file routes read and write real data. */
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
