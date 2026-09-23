"use client";

/* Photos waiting in the composer, kept where a page change cannot
   lose them.

   The draft text has always survived leaving the chat; the pictures
   did not, and a receipt already thrown away cannot be photographed
   twice. They live in the Cache API (the same store the share sheet
   parks into) because it holds real files without base64 bloat, and
   survives navigation, reloads and force-quits alike. */

const STORE = "biblo-staged";
const META = "/__staged__/meta";

type Meta = { name: string; type: string }[];

async function box() {
  if (typeof caches === "undefined") return null;
  try {
    return await caches.open(STORE);
  } catch {
    return null;
  }
}

/** Replaces whatever was parked with exactly this list. */
export async function keepStaged(files: File[]) {
  const c = await box();
  if (!c) return;
  try {
    for (const k of await c.keys()) await c.delete(k);
    if (files.length === 0) return;
    const meta: Meta = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      await c.put(
        new Request(`/__staged__/${i}`),
        new Response(f, { headers: { "Content-Type": f.type || "application/octet-stream" } }),
      );
      meta.push({ name: f.name, type: f.type });
    }
    await c.put(
      new Request(META),
      new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json" } }),
    );
  } catch {
    // A full or blocked cache must never break sending.
  }
}

/** What was parked, as real Files again. */
export async function takeStaged(): Promise<File[]> {
  const c = await box();
  if (!c) return [];
  try {
    const m = await c.match(META);
    if (!m) return [];
    const meta = (await m.json()) as Meta;
    const out: File[] = [];
    for (let i = 0; i < meta.length; i++) {
      const r = await c.match(`/__staged__/${i}`);
      if (!r) continue;
      const blob = await r.blob();
      out.push(new File([blob], meta[i].name || `photo-${i + 1}`, { type: meta[i].type || blob.type }));
    }
    return out;
  } catch {
    return [];
  }
}

export async function clearStaged() {
  const c = await box();
  if (!c) return;
  try {
    for (const k of await c.keys()) await c.delete(k);
  } catch {}
}
