"use client";

import { createBrowserClient } from "@supabase/ssr";

/* The one place the browser talks to Supabase, and only for auth:
   the publishable key can read nothing (RLS has no policies), so a
   session cookie is all this client can produce. Data still flows
   through the server alone. */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
