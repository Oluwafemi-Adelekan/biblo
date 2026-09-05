import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/* Where the emailed link lands. The email carries a one-time token
   hash straight here, and this route trades it for a session on
   whatever browser did the clicking - phone, laptop, anywhere -
   with no dependency on which browser asked for the email. */

export async function GET(req: NextRequest) {
  const token_hash = req.nextUrl.searchParams.get("token_hash");
  const type = req.nextUrl.searchParams.get("type") ?? "email";
  const to = req.nextUrl.searchParams.get("to") ?? "/";
  const dest = to.startsWith("/") ? to : "/";

  if (token_hash) {
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
    const { error } = await supabase.auth.verifyOtp({
      type: type as "email",
      token_hash,
    });
    if (!error) return NextResponse.redirect(new URL(dest, req.url));
  }

  // Used, expired, or mangled: back to the door with a note.
  const login = new URL("/login", req.url);
  login.searchParams.set("expired", "1");
  return NextResponse.redirect(login);
}
