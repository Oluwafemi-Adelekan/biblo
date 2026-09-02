import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

/* Free Supabase projects pause after 7 idle days, which would take
   the app down without warning. A daily write keeps it awake. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Vercel signs cron requests when CRON_SECRET is set. If it is,
  // insist on it, so this cannot be triggered by anyone who finds it.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  const { error } = await db()
    .from("heartbeat")
    .update({ pinged_at: new Date().toISOString() })
    .eq("id", 1);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
