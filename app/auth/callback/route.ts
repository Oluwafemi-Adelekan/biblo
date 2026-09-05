import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/* Where Google (or the emailed link) lands. The one-time code becomes
   a session cookie, then straight into the app. */

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const to = req.nextUrl.searchParams.get("to") ?? "/";

  if (code) {
    const jar = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll: () => jar.getAll(),
          setAll: (all) =>
            all.forEach(({ name, value, options }) =>
              jar.set(name, value, options),
            ),
        },
      },
    );
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(to.startsWith("/") ? to : "/", req.url));
}
