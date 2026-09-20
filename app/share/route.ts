import { NextResponse, type NextRequest } from "next/server";

/* The share sheet POSTs here. Normally the service worker answers
   before the request leaves the phone and this never runs. It runs
   only when no worker is in control yet (a share attempted before
   the chat has ever been opened in the installed app) - then the
   files cannot be caught, so the kindest thing is to land in the
   chat and say so once. */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return NextResponse.redirect(new URL("/chat?shared=missed", req.nextUrl.origin), 303);
}
export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/chat", req.nextUrl.origin), 303);
}
