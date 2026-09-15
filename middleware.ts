import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { COOKIE, same, token } from "@/lib/auth";

/* The front door, now with accounts. A request gets through with a
   Supabase session (Google, or an emailed link), or with the owner's
   original passcode cookie - kept so the first phone never notices
   the migration. Everyone else is sent to /login.

   This also owns session refresh: renewed auth cookies ride out on
   the response here, because server components cannot set cookies. */

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname === "/login" ||
    pathname === "/unlock" ||
    pathname === "/api/health" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/cron/")
  ) {
    return NextResponse.next();
  }

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (all) => {
          all.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          all.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  /* Verified locally against the project's public signing key (a
     one-time fetch, then cached), not by asking the auth server on
     every request - that round trip was paid twice per page. A
     token past its expiry still refreshes over the network here,
     and the renewed cookies ride out on the response. */
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) return res;

  if (process.env.BIBLO_SESSION_SECRET) {
    const got = req.cookies.get(COOKIE)?.value ?? "";
    if (same(got, await token(process.env.BIBLO_SESSION_SECRET))) return res;
  }

  const to = req.nextUrl.clone();
  to.pathname = "/login";
  to.search = pathname === "/" ? "" : `?to=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(to);
}

export const config = {
  /* Everything except Next's own assets. /api is included on purpose:
     the upload and file routes read and write real data. */
  matcher: [
    "/((?!_next/static|_next/image|avatars/|brand/|icons/|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest).*)",
  ],
};
