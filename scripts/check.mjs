/* Guards the two things that silently degrade: an icon name no
   component answers to, and a budget whose caps do not add up.
   Reads Supabase, since that is what the app reads. */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

/* Owner's rows only: this is the audit tool for the house's books.
   Tenants' budgets start empty and drift is their own to make. */
const ZERO = "00000000-0000-0000-0000-000000000000";
const owner =
  (await db.from("profiles").select("id").eq("owner", true).maybeSingle()).data
    ?.id ?? ZERO;

const cats =
  (await db.from("categories").select("*").eq("user_id", owner).order("sort"))
    .data ?? [];
const budgets =
  (await db.from("budgets").select("*").eq("user_id", owner)).data ?? [];

const src = readFileSync(
  new URL("../components/ui/CategoryIcon.tsx", import.meta.url),
  "utf8",
);
const mapped = new Set([...src.matchAll(/^\s{2}([A-Z][A-Za-z]+),$/gm)].map((m) => m[1]));

let bad = 0;

if (cats.length === 0) {
  console.error("No categories in Supabase. Has the seed run?");
  bad++;
}

for (const c of cats) {
  if (!mapped.has(c.icon)) {
    console.error(`MISSING ICON  ${c.id} wants ${c.icon}`);
    bad++;
  }
}

for (const b of budgets) {
  const sum = Object.values(b.caps).reduce((a, c) => a + c, 0);
  if (sum !== Number(b.total)) {
    console.error(`CAPS MISMATCH ${b.month}: caps ${sum} vs total ${b.total}`);
    bad++;
  }
  for (const id of Object.keys(b.caps)) {
    if (!cats.some((c) => c.id === id)) {
      console.error(`UNKNOWN CAP  ${b.month}: ${id}`);
      bad++;
    }
  }
}

console.log(
  bad === 0
    ? `ok: ${cats.length} categories, ${budgets.length} budgets`
    : `${bad} problem(s)`,
);
process.exit(bad ? 1 : 0);
