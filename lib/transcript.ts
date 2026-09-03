/* Turning speech-recognition results into a string.

   Pulled out of the component because getting it wrong is invisible
   until you read the output: an earlier version appended each event's
   text to a running total, and since the engine re-reports results it
   has already sent, "okay let me send this" came out as
   "okayokay letokay let me send...".

   The rule is that this must be idempotent. The same results object
   handed in twice has to give the same string.

   Desktop Chrome behaves: each list entry is one utterance, reported
   once. Android's engine re-emits and grows entries, so there the
   chunks are folded together with overlap merging instead of plain
   concatenation - see mergeTranscript. */

export type SpeechResults = ArrayLike<
  ArrayLike<{ transcript: string }> & { isFinal: boolean }
>;

/** Folds a new chunk onto what we already have, absorbing the ways
 *  Android repeats itself: an exact re-emit vanishes, a cumulative
 *  superset replaces, a partial overlap is joined once. The cost,
 *  accepted knowingly: a phrase repeated verbatim as its own
 *  separate chunk merges too - on Android that is nearly always the
 *  engine, not the speaker. Desktop never uses this. */
export function mergeTranscript(base: string, add: string): string {
  if (!add.trim()) return base;
  if (!base.trim()) return add;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const bn = norm(base);
  const an = norm(add);
  if (an === bn || bn.endsWith(an)) return base;
  if (an.startsWith(bn)) return add;
  const b = base.toLowerCase();
  const a = add.toLowerCase();
  const max = Math.min(b.length, a.length) - 1;
  for (let k = max; k > 0; k--) {
    if (a.slice(0, k).trim() && b.endsWith(a.slice(0, k))) {
      return base + add.slice(k);
    }
  }
  return base.trimEnd() + " " + add.trimStart();
}

/** Splits a results list into what the engine has committed to and
 *  what it is still revising. Reads the whole list, never a slice.
 *  merge: true folds chunks with overlap-merging (Android). */
export function readResults(
  results: SpeechResults,
  opts: { merge?: boolean } = {},
) {
  const put = opts.merge
    ? mergeTranscript
    : (acc: string, chunk: string) => acc + chunk;
  let settled = "";
  let interim = "";
  for (let i = 0; i < results.length; i++) {
    const chunk = results[i][0].transcript;
    if (results[i].isFinal) settled = put(settled, chunk);
    else interim = put(interim, chunk);
  }
  return { settled, interim };
}

/** `carried` is what earlier sessions produced, since the engine
 *  clears its results list every time it restarts. */
export function joinTranscript(
  carried: string,
  settled: string,
  interim: string,
  opts: { merge?: boolean } = {},
) {
  const put = opts.merge
    ? mergeTranscript
    : (acc: string, chunk: string) => acc + chunk;
  return put(put(carried, settled), interim).replace(/\s+/g, " ").trim();
}
