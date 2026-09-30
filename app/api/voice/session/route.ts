import { NextResponse } from "next/server";
import { getCategories, getExpenses } from "@/lib/data";

/* A short-lived key so the browser can talk to the transcription
   service directly, and hear its own words as it speaks.

   Our real key never leaves the server. What goes out is a secret
   that expires in a minute and can only transcribe - it cannot spend
   anything, read anything, or be reused tomorrow. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HINTS = new Map<string, { at: number; text: string }>();
const HINT_TTL = 10 * 60_000;

async function hintsFor(uid: string) {
  const held = HINTS.get(uid);
  if (held && Date.now() - held.at < HINT_TTL) return held.text;
  const base = ["Nigerian naira amounts", "FiberOne", "PalmPay", "OPay", "Grey", "Mega Mart", "De Prince", "Jendol"];
  let text = base.join(", ");
  try {
    const [cats, expenses] = await Promise.all([getCategories(), getExpenses()]);
    const names = new Set<string>();
    for (const c of cats) names.add(c.name);
    for (const e of expenses.slice(0, 120)) {
      for (const w of e.label.split(/[^A-Za-z'&]+/)) {
        if (w.length > 2 && w[0] === w[0].toUpperCase()) names.add(w);
      }
    }
    text = [...base, ...[...names].slice(0, 90)].join(", ");
  } catch {}
  HINTS.set(uid, { at: Date.now(), text });
  return text;
}

export async function POST() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const key = process.env.AZURE_OPENAI_KEY;
  if (!endpoint || !key) {
    return NextResponse.json({ error: "Dictation is not configured." }, { status: 503 });
  }

  const { viewerId } = await import("@/lib/viewer");
  let uid = "anon";
  try {
    uid = await viewerId();
  } catch {}

  try {
    const r = await fetch(`${endpoint}/openai/v1/realtime/client_secrets`, {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        session: {
          type: "transcription",
          audio: {
            input: {
              format: { type: "audio/pcm", rate: 24000 },
              transcription: {
                model: process.env.AZURE_TRANSCRIBE_DEPLOYMENT ?? "gpt-4o-mini-transcribe",
                language: "en",
                prompt: await hintsFor(uid),
              },
              /* Each pause ends a phrase and sends it to be written
                 down. Shorter than a natural breath, so the words
                 appear while you are still talking. */
              turn_detection: { type: "server_vad", threshold: 0.5, silence_duration_ms: 400 },
            },
          },
        },
      }),
    });
    if (!r.ok) return NextResponse.json({ error: "Could not start dictation." }, { status: 502 });
    const j = (await r.json()) as { value?: string };
    if (!j.value) return NextResponse.json({ error: "Could not start dictation." }, { status: 502 });
    return NextResponse.json({
      key: j.value,
      // The browser posts its connection offer here; it never sees our key.
      url: `${endpoint}/openai/v1/realtime/calls?intent=transcription`,
    });
  } catch {
    return NextResponse.json({ error: "Could not start dictation." }, { status: 502 });
  }
}
