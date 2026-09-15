import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { AsyncLocalStorage } from "node:async_hooks";
import { createServerClient } from "@supabase/ssr";
import { db } from "./supabase";
import { OWNER_EMAILS, ZERO_USER } from "./owners";
import { COOKIE, same, token } from "./auth";

/* WHOSE rows a request touches. Every read and write in lib/data and
   lib/store scopes itself through viewerId(), so pages and actions
   never carry a user id around.

   Three ways an identity arrives:
   1. A Supabase Auth session (Google, or an emailed link).
   2. The owner's old passcode cookie - kept so the original phone
      keeps working through and after the migration.
   3. runAsUser(), for background work (the reader runs in after(),
      where there is no request cookie) - the message being processed
      says whose it is. */

const als = new AsyncLocalStorage<string>();

export function runAsUser<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  return als.run(uid, fn);
}

/** The owner's real id once they have signed in, else the sentinel
 *  the original data still carries. */
export const ownerId = cache(async (): Promise<string> => {
  const { data } = await db()
    .from("profiles")
    .select("id")
    .eq("owner", true)
    .limit(1)
    .maybeSingle();
  return data?.id ?? ZERO_USER;
});

export type ProfileRow = {
  id: string;
  email: string | null;
  owner: boolean;
  settings: Record<string, unknown>;
};

/** The viewer's profile row, read once per request and shared by
 *  everything that needs a piece of it - identity, settings, the
 *  owner flag. It used to be read two or three separate times. */
export const profileRow = cache(async (uid: string): Promise<ProfileRow | null> => {
  const { data } = await db()
    .from("profiles")
    .select("id, email, owner, settings")
    .eq("id", uid)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    email: data.email ?? null,
    owner: Boolean(data.owner),
    settings: (data.settings ?? {}) as Record<string, unknown>,
  };
});

/** First sight of an authed user: make their profile, and if they are
 *  the owner, claim the pre-account rows; otherwise seed them a fresh
 *  set of categories and an empty budget for this month. */
async function ensureProfile(uid: string, email: string, fullName?: string) {
  const existing = await profileRow(uid);
  if (existing) {
    // A profile from before names were kept learns its name now.
    const s = existing.settings;
    // First names only: this is not a government application.
    const first = fullName?.trim().split(/\s+/)[0];
    if (first && !s.name) {
      await db()
        .from("profiles")
        .update({ settings: { ...s, name: first } })
        .eq("id", uid);
    }
    return;
  }

  const owner = OWNER_EMAILS.includes(email.toLowerCase());
  const first = fullName?.trim().split(/\s+/)[0];
  await db().from("profiles").insert({
    id: uid,
    email: email.toLowerCase(),
    owner,
    settings: {
      ...(first ? { name: first } : {}),
      // Nobody lands on face number one by default.
      avatar: String(1 + Math.floor(Math.random() * 30)),
    },
  });

  if (owner) {
    // The original single-user rows become this account's.
    for (const table of ["expenses", "messages", "categories", "budgets"]) {
      await db().from(table).update({ user_id: uid }).eq("user_id", ZERO_USER);
    }
    return;
  }

  // A new tenant starts with the plain starter set - not the owner's
  // personal taxonomy - and a blank budget for the current month.
  const { DEFAULT_CATEGORIES } = await import("./defaults");
  await db()
    .from("categories")
    .insert(
      DEFAULT_CATEGORIES.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        group: null,
        matches: c.matches,
        kind: c.kind,
        sort: c.sort,
        user_id: uid,
      })),
    );
  const month = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }).slice(0, 7);
  await db().from("budgets").insert({ user_id: uid, month, income: 0, total: 0, caps: {} });
}

/** The signed-in Supabase user for this request, if any - read from
 *  the session token's claims, verified locally against the project's
 *  public key. The middleware has already refreshed an expired token
 *  by the time a page renders, so no auth-server call is needed here. */
const authedUser = cache(async () => {
  const jar = await cookies();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        // Server components cannot write cookies; the middleware
        // owns session refresh. Swallowing the write is correct.
        setAll: () => {},
      },
    },
  );
  const { data } = await client.auth.getClaims();
  const c = data?.claims;
  if (!c?.sub) return null;
  const meta = (c.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: c.sub,
    email: (c.email as string | undefined) ?? null,
    fullName: (meta.full_name ?? meta.name) as string | undefined,
  };
});

/** The signed-in person's email, from their profile row - works for
 *  the passcode path too, since that resolves to the owner. */
export const viewerEmail = cache(async (): Promise<string | null> => {
  const row = await profileRow(await viewerId());
  return row?.email ?? null;
});

/** Whether this request belongs to the owner - from the same profile
 *  row everything else already read, so it costs nothing extra. */
export const viewerIsOwner = cache(async (): Promise<boolean> => {
  const uid = await viewerId();
  const row = await profileRow(uid);
  if (row) return row.owner;
  // Pre-account rows: the passcode path resolves to the sentinel.
  return uid === (await ownerId());
});

export const viewerId = cache(async (): Promise<string> => {
  const forced = als.getStore();
  if (forced) return forced;

  const user = await authedUser();
  if (user?.email) {
    await ensureProfile(user.id, user.email, user.fullName);
    return user.id;
  }

  // The owner's passcode cookie still opens the owner's books.
  if (process.env.BIBLO_SESSION_SECRET) {
    const jar = await cookies();
    const got = jar.get(COOKIE)?.value ?? "";
    const expected = await token(process.env.BIBLO_SESSION_SECRET);
    if (same(got, expected)) return ownerId();
  }

  // Middleware should have redirected long before this point.
  throw new Error("No signed-in viewer for this request.");
});
