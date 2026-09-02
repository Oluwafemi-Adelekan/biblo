import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { aiConfigured } from "@/lib/ai";

/* Answers one question from the outside: what can the running
   deployment actually see? Booleans only — it says whether each
   secret is present, never what it is. Public on purpose (the
   middleware lets it through) so "is it configured?" can be settled
   with a URL instead of a guided tour of the Vercel dashboard. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const present = (k: string) => Boolean(process.env[k]?.trim());

  let database = false;
  try {
    const { error } = await db().from("heartbeat").select("id").limit(1);
    database = !error;
  } catch {
    database = false;
  }

  return NextResponse.json({
    ok: true,
    // Which build is answering: the first 7 of the git commit.
    commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local-dev").slice(0, 7),
    database,
    reader: {
      configured: aiConfigured(),
      AZURE_OPENAI_ENDPOINT: present("AZURE_OPENAI_ENDPOINT"),
      AZURE_OPENAI_KEY: present("AZURE_OPENAI_KEY"),
      AZURE_OPENAI_DEPLOYMENT: present("AZURE_OPENAI_DEPLOYMENT"),
    },
  });
}
