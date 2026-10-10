import "server-only";
import { files, BUCKET } from "./supabase";
import { viewerId } from "./viewer";
import { getSettings, saveSettings, type ShareIndexEntry } from "./settings";

/* ============================================================
   SHARED LINKS

   A page of your books that someone without an account can open.
   Built for the case that keeps coming up: a trip everyone chipped
   into, and nine people who need to see the same arithmetic without
   being handed a spreadsheet or signing into anything.

   A share is a SNAPSHOT, not a live view. What the link shows is
   written once, when the link is made, and never re-read from the
   books. That is the whole safety story: revoking a link cannot
   leak anything it had not already shown, and a stale link cannot
   start showing entries filed after it.

   Where it lives: the payload is a JSON object in the attachments
   bucket under a `share--` key, and the owner's profile settings
   keep a small index of what they have shared so they can revoke it.
   No new table, because DDL on this project needs a management token
   the owner mints by hand and which expires within the hour.
   ============================================================ */

export type SharedLine = {
  label: string;
  /** In the document's currency, already converted. */
  amount: number;
  /** As it was actually spent, when that was a different currency. */
  original?: { amount: number; currency: string };
  /** Who the line belongs to. Empty means everyone. */
  who?: string[];
  note?: string;
};

export type SharedPerson = {
  name: string;
  paidIn: number;
  used: number;
  /** paidIn - used. Positive is owed back to them. */
  balance: number;
};

/** A pot several people paid into, spent down, and now have to settle. */
export type LedgerDoc = {
  kind: "ledger";
  people: SharedPerson[];
  lines: SharedLine[];
  totalIn: number;
  totalSpent: number;
  /** Credited to every person for money the pot did not spend, so a
   *  single person's lines add up to what they actually used. */
  creditEach?: number;
  /** Anything the arithmetic could not place, said plainly. */
  open?: string[];
  /** A receipt nobody has finished claiming, by group: what is on
   *  it, who has said what is theirs, and how many are left. */
  unclaimed?: {
    group: string;
    items: {
      name: string;
      qty: number;
      unit: number;
      claimed: string[];
      left: number;
    }[];
  }[];
};

/** A stretch of one person's own books. */
export type PeriodDoc = {
  kind: "period";
  from: string;
  to: string;
  rows: {
    date: string;
    label: string;
    category: string;
    amount: number;
    note?: string;
  }[];
  totalOut: number;
  totalIn: number;
};

export type SharePayload = {
  v: 1;
  token: string;
  /** Who made it. Carried so a revoke can check ownership without
   *  reading every profile in the database. */
  owner: string;
  by: string;
  title: string;
  note?: string;
  createdAt: string;
  revoked?: boolean;
  doc: LedgerDoc | PeriodDoc;
};

export type { ShareIndexEntry };

const key = (token: string) => `share--${token}.json`;

/* 22 characters of base62: unguessable, and short enough to read
   out over the phone if it comes to that. Deliberately not a uuid -
   a uuid in a URL looks like something that might be enumerable. */
const ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(22));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export const TOKEN = /^[0-9A-Za-z]{22}$/;

/** Read a share. Public: no session, no ownership check, because
 *  holding the link is the permission. Returns null for a token
 *  that never existed and for one that has been revoked - those
 *  two cases look identical from outside on purpose. */
export async function readShare(token: string): Promise<SharePayload | null> {
  if (!TOKEN.test(token)) return null;

  const { data, error } = await files().storage.from(BUCKET).download(key(token));
  if (error || !data) return null;

  try {
    const payload = JSON.parse(await data.text()) as SharePayload;
    if (payload.v !== 1 || payload.revoked) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Publish a document and return its token. */
export async function createShare(input: {
  title: string;
  note?: string;
  by: string;
  doc: LedgerDoc | PeriodDoc;
}): Promise<string> {
  const uid = await viewerId();
  const token = newToken();

  const payload: SharePayload = {
    v: 1,
    token,
    owner: uid,
    by: input.by,
    title: input.title,
    note: input.note,
    createdAt: new Date().toISOString(),
    doc: input.doc,
  };

  await write(payload);

  const settings = await getSettings();
  const index = [
    {
      token,
      title: input.title,
      kind: input.doc.kind,
      createdAt: payload.createdAt,
    },
    ...(settings.shares ?? []),
  ].slice(0, 50);
  await saveSettings({ shares: index });

  return token;
}

/** Stop a link working. The payload stays, flagged, so a link that
 *  is quietly turned off reads the same as one that never was. */
export async function revokeShare(token: string): Promise<boolean> {
  if (!TOKEN.test(token)) return false;
  const uid = await viewerId();

  const { data } = await files().storage.from(BUCKET).download(key(token));
  if (!data) return false;

  let payload: SharePayload;
  try {
    payload = JSON.parse(await data.text()) as SharePayload;
  } catch {
    return false;
  }
  if (payload.owner !== uid) return false;

  await write({ ...payload, revoked: true });

  const settings = await getSettings();
  await saveSettings({
    shares: (settings.shares ?? []).map((s) =>
      s.token === token ? { ...s, revoked: true } : s,
    ),
  });
  return true;
}

/** The viewer's own links, newest first. */
export async function listShares(): Promise<ShareIndexEntry[]> {
  return (await getSettings()).shares ?? [];
}

async function write(payload: SharePayload) {
  const { error } = await files()
    .storage.from(BUCKET)
    .upload(key(payload.token), JSON.stringify(payload), {
      contentType: "application/json",
      upsert: true,
    });
  if (error) throw new Error(`Could not save that link: ${error.message}`);
}
