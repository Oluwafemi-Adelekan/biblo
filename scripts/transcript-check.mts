import { joinTranscript, readResults } from "../lib/transcript";

/* Replays the shape of events Chrome actually sends: a result is
   reported as interim, revised, then finalised, and the whole list is
   re-sent each time. The old code appended, so the same words landed
   over and over. */

type R = { transcript: string };
const results = (rows: [string, boolean][]) => {
  const arr = rows.map(([t, isFinal]) => {
    const r = [{ transcript: t }] as unknown as ArrayLike<R> & { isFinal: boolean };
    (r as { isFinal: boolean }).isFinal = isFinal;
    return r;
  });
  return arr as unknown as Parameters<typeof readResults>[0];
};

let bad = 0;
const check = (name: string, got: string, want: string) => {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}\n       got  "${got}"${ok ? "" : `\n       want "${want}"`}`);
};

// the engine revises the same utterance, re-sending the full list
const events: [string, boolean][][] = [
  [["okay", false]],
  [["okay let me", false]],
  [["okay let me send", false]],
  [["okay let me send this", false]],
  [["okay let me send this", true]],
];
let last = "";
for (const e of events) {
  const { settled, interim } = readResults(results(e));
  last = joinTranscript("", settled, interim);
}
check("one revised utterance", last, "okay let me send this");

// the same event delivered twice must not change anything
const e = results([["okay let me send this", true]]);
const a = joinTranscript("", ...Object.values(readResults(e)) as [string, string]);
const b = joinTranscript("", ...Object.values(readResults(e)) as [string, string]);
check("idempotent on replay", b, a);

// finals from an earlier session, carried across a restart
const { settled, interim } = readResults(results([["and then some more", false]]));
check(
  "carries across a restart",
  joinTranscript("okay let me send this ", settled, interim),
  "okay let me send this and then some more",
);

// finals and interim together
const mixed = readResults(results([["the voice ", true], ["keeps going", false]]));
check("final plus interim", joinTranscript("", mixed.settled, mixed.interim), "the voice keeps going");

/* ---- Android merge mode ---------------------------------------- */

// cumulative finals (the engine grows one entry across re-reports)
const cum = readResults(
  results([["okay", true], ["okay let", true], ["okay let me send this", true]]),
  { merge: true },
);
check("merge: cumulative finals", cum.settled, "okay let me send this");

// the same final delivered twice as separate entries
const dbl = readResults(
  results([["buy rice ", true], ["buy rice ", true], ["and beans", true]]),
  { merge: true },
);
check("merge: double-fired final", dbl.settled, "buy rice and beans");

// distinct chunks still concatenate
const dist = readResults(
  results([["five k fuel ", true], ["two k lunch", true]]),
  { merge: true },
);
check("merge: distinct chunks survive", dist.settled, "five k fuel two k lunch");

// desktop plain mode keeps a genuinely repeated chunk
const rep = readResults(
  results([["I'm saying that ", true], ["I'm saying that ", true]]),
);
check("plain: real repeat kept", rep.settled, "I'm saying that I'm saying that ");

// merged banking across a restart never doubles
const banked = joinTranscript("okay let me send this ", "okay let me send this and rice", "", { merge: true });
check("merge: restart re-report", banked, "okay let me send this and rice");

console.log(bad === 0 ? "\nall transcript checks passed" : `\n${bad} failed`);
process.exit(bad ? 1 : 0);
