import { NextResponse, type NextRequest } from "next/server";
import { viewerId } from "@/lib/viewer";

/* The pass that makes dictation feel like typing.

   A transcriber writes down what was said. Nobody speaks the way
   they would type: there are ums, false starts, a figure read out
   three times while the speaker finds it, and corrections made
   halfway through a sentence. Leaving all of that in the box and
   calling it dictation is what makes voice input feel broken, even
   when every word was heard correctly.

   So the transcript goes through a model on its way to the box:
   corrections applied, stumbles removed, nothing added. This is the
   part people mean when they say another app's dictation "just
   works" - the listening was never the hard bit. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SYSTEM = `You tidy dictation. The person spoke into a budgeting app; what you get is the raw transcript of their voice, and what you return is what they meant to type.

Do exactly this and nothing else:
- Apply spoken corrections. "5,000, no sorry, 6,000" becomes 6,000. "the 4th, I mean the 5th" becomes the 5th. The correction wins and the mistake disappears.
- Remove filler and stumbles: um, uh, like, you know, "right?", repeated words, false starts, and the speaker reading their own words back.
- Repair words the transcriber clearly mangled from speech, using context: a price said as "200500 200 naira 2500 naira" where one figure is meant is that one figure.
- Punctuate and capitalise so it reads as typed prose.

Never do these:
- Never add a fact, an amount, a date, a name or a category that was not spoken.
- Never drop a fact that was spoken. Every distinct amount and thing survives unless it was explicitly corrected away.
- Never answer, summarise, comment or acknowledge. Return only the tidied text.
- When you cannot tell what was meant, keep the words as they are rather than guessing.

Return the tidied text alone.`;

export async function POST(req: NextRequest) {
  await viewerId();

  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  const raw = (text ?? "").trim();

  /* Too short to have anything to tidy, and too long to be one
     person talking into a phone - either way, hand it back
     untouched rather than spending a model call on it. */
  if (raw.length < 12 || raw.length > 8000) {
    return NextResponse.json({ text: raw });
  }

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const key = process.env.AZURE_OPENAI_KEY;
  const model = process.env.AZURE_OPENAI_DEPLOYMENT;
  if (!endpoint || !key || !model) return NextResponse.json({ text: raw });

  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/openai/v1/responses`, {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions: SYSTEM,
        input: [{ role: "user", content: [{ type: "input_text", text: raw }] }],
        reasoning: { effort: "low" },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return NextResponse.json({ text: raw });

    const j = (await res.json()) as {
      output?: { content?: { text?: string }[] }[];
    };
    const out = (j.output ?? [])
      .flatMap((o) => o.content ?? [])
      .map((c) => c.text)
      .filter(Boolean)
      .join("")
      .trim();

    /* A tidy that comes back empty, or wildly shorter than what was
       said, has lost something. The raw words are always better than
       a confident summary of them. */
    if (!out || out.length < raw.length * 0.4) {
      return NextResponse.json({ text: raw });
    }
    return NextResponse.json({ text: out });
  } catch {
    return NextResponse.json({ text: raw });
  }
}
