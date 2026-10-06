import "server-only";
import { cache } from "react";
import { db } from "./supabase";
import { profileRow, viewerId } from "./viewer";

/* Per-user preferences, one jsonb on the profile. Small on purpose:
   every field here is something a person actually asked for. */

/** One published link, as its owner sees it listed. The page it
 *  points at lives in storage; see lib/share. Declared here rather
 *  than there because settings cannot import share without the two
 *  files importing each other. */
export type ShareIndexEntry = {
  token: string;
  title: string;
  kind: "ledger" | "period";
  createdAt: string;
  revoked?: boolean;
};

export type Settings = {
  /** Blur income figures until tapped. */
  hideIncome: boolean;
  /** Show the time of day on an expense, not just the date. */
  showTime: boolean;
  /** Day of the month a budget period begins (payday budgeting).
   *  1 means calendar months; 28 means the 28th through the 27th. */
  monthStart: number;
  /** The first-run walkthrough has been seen. */
  toured: boolean;
  /** HMAC of the app PIN; absent means no PIN. */
  pinHash?: string;
  /** Their name, as Google gave it; the assistant greets with it. */
  name?: string;
  /** Which face from the avatar pack, by id. */
  avatar?: string;
  /** Links they have published, newest first, so they can revoke
   *  one later. The pages themselves live in storage. */
  shares?: ShareIndexEntry[];
};

export const DEFAULTS: Settings = {
  hideIncome: false,
  showTime: true,
  monthStart: 1,
  toured: false,
};

export const getSettings = cache(async (): Promise<Settings> => {
  const uid = await viewerId();
  const row = await profileRow(uid);
  const s = (row?.settings ?? {}) as Partial<Settings>;
  const monthStart = Number(s.monthStart);
  return {
    ...DEFAULTS,
    ...s,
    monthStart:
      Number.isInteger(monthStart) && monthStart >= 1 && monthStart <= 28
        ? monthStart
        : 1,
  };
});

export async function saveSettings(patch: Partial<Settings>) {
  const uid = await viewerId();
  const current = await getSettings();
  const next = { ...current, ...patch };
  // pinHash: undefined in the patch means "leave"; null means "clear".
  if ((patch as Record<string, unknown>).pinHash === null) delete next.pinHash;
  const { error } = await db()
    .from("profiles")
    .update({ settings: next })
    .eq("id", uid);
  if (error) throw new Error(`Could not save settings: ${error.message}`);
  return next;
}
