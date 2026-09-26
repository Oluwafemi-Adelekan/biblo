import { NextResponse, type NextRequest } from "next/server";
import { getCategories, getExpenses } from "@/lib/data";

/* Dictation, done properly.

   The browser's own speech recognition is a toy on phones: it beeps,
   it drops words, and it hears "Fiber One" as "501". This sends the
   actual audio to a real transcription model, which returns the words
   with punctuation and the numbers already grouped.

   It runs on the server because the key lives there, and behind the
   middleware like every other route, so only a signed-in person can
   spend the quota. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Words a stranger would not guess: the person's own categories,
 *  the places they shop, the people they pay. Handing these over as
 *  a prompt is what turns "Fiber One" from a guess into a word. */
async function hints() {
  const base = [
    "Nigerian naira amounts",
    "FiberOne",
    "PalmPay",
    "OPay",
    "Grey",
    "Mega Mart",
    "De Prince",
    "Jendol",
  ];
  try {
    const [cats, expenses] = await Promise.all([getCategories(), getExpenses()]);
    const names = new Set<string>();
    for (const c of cats) names.add(c.name);
    for (const e of expenses.slice(0, 120)) {
      for (const w of e.label.split(/[^A-Za-z'&]+/)) {
        // Proper nouns only: the people and places worth spelling right.
        if (w.length > 2 && w[0] === w[0].toUpperCase()) names.add(w);
      }
    }
    return [...base, ...[...names].slice(0, 90)].join(", ");
  } catch {
    return base.join(", ");
  }
}

export async function POST(req: NextRequest) {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const key = process.env.AZURE_OPENAI_KEY;
  const model = process.env.AZURE_TRANSCRIBE_DEPLOYMENT ?? "gpt-4o-mini-transcribe";
  if (!endpoint || !key) {
    return NextResponse.json({ error: "Dictation is not configured." }, { status: 503 });
  }

  const form = await req.formData();
  const clip = form.get("audio");
  if (!(clip instanceof File) || clip.size === 0) {
    return NextResponse.json({ error: "No audio." }, { status: 400 });
  }
  // The model's own ceiling is 25MB; a minute of speech is nowhere near.
  if (clip.size > 24 * 1024 * 1024) {
    return NextResponse.json({ error: "That recording is too long." }, { status: 413 });
  }

  const out = new FormData();
  out.set("file", clip, clip.name || "clip.webm");
  out.set("model", model);
  out.set("language", "en");
  out.set("prompt", await hints());
  // No creative licence: these models will otherwise narrate their way
  // through a passage of noise rather than return nothing.
  out.set("temperature", "0");

  try {
    const r = await fetch(
      `${endpoint}/openai/deployments/${model}/audio/transcriptions?api-version=2025-03-01-preview`,
      { method: "POST", headers: { "api-key": key }, body: out },
    );
    if (!r.ok) {
      return NextResponse.json(
        { error: "That didn't come through. Try again." },
        { status: 502 },
      );
    }
    const j = (await r.json()) as { text?: string };
    return NextResponse.json({ text: (j.text ?? "").trim() });
  } catch {
    return NextResponse.json({ error: "That didn't come through. Try again." }, { status: 502 });
  }
}
