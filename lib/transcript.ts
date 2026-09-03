/* Turning speech-recognition results into a string.

   Pulled out of the component because getting it wrong is invisible
   until you read the output: an earlier version appended each event's
   text to a running total, and since the engine re-reports results it
   has already sent, "okay let me send this" came out as
   "okayokay letokay let meokay let me send...".

   The rule is that this must be idempotent. The same results object
   handed in twice has to give the same string. */

export type SpeechResults = ArrayLike<
  ArrayLike<{ transcript: string }> & { isFinal: boolean }
>;

/** Splits a results list into what the engine has committed to and
 *  what it is still revising. Reads the whole list, never a slice. */
export function readResults(results: SpeechResults) {
  let settled = "";
  let interim = "";
  for (let i = 0; i < results.length; i++) {
    const chunk = results[i][0].transcript;
    if (results[i].isFinal) {
      /* Android's engine re-emits finals it already delivered as
         fresh entries in the same list, which is where the doubled
         words came from. A person saying a word twice lands inside
         ONE chunk; a whole chunk identical to what the transcript
         already ends with is the engine repeating itself. */
      const t = chunk.trim();
      if (t && settled.trimEnd().endsWith(t)) continue;
      settled += chunk;
    } else {
      interim += chunk;
    }
  }
  return { settled, interim };
}

/** `carried` is what earlier sessions produced, since the engine
 *  clears its results list every time it restarts. */
export function joinTranscript(carried: string, settled: string, interim: string) {
  return (carried + settled + interim).replace(/\s+/g, " ").trim();
}
