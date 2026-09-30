"use client";

import { useCallback, useRef, useState } from "react";

/** How many bars of history the meter keeps: one per bar drawn. */
export const WAVE_BARS = 26;

/* Recording, not "recognition".

   The browser's SpeechRecognition is what made dictation flaky: it
   beeps on every pause, re-emits words, needs a network of its own,
   and does not exist at all on an iPhone. This records the audio and
   hands it to a transcription model on the way out, which is what
   every serious voice input does. One mic stream, no beeps, and the
   text arrives punctuated.

   The trade is honest: words appear when you stop, not as you speak. */

export type VoiceState = "idle" | "recording" | "working";

/* Live dictation.

   The words appear while you are still talking. The browser sends its
   microphone straight to the transcription service over a peer
   connection, and phrases come back as you finish them - so a name it
   mishears is visible immediately, not two minutes later.

   Our API key is never involved: the server hands out a secret that
   expires in about a minute and can do nothing but transcribe.

   If any of it fails to set up, the caller falls back to recording
   the clip and sending it at the end, which always works. */
type Live = {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
};

async function openLive(
  stream: MediaStream,
  onPhrase: (settled: string, partial: string) => void,
): Promise<Live | null> {
  let key: string;
  let url: string;
  try {
    const r = await fetch("/api/voice/session", { method: "POST" });
    if (!r.ok) return null;
    const j = (await r.json()) as { key?: string; url?: string };
    if (!j.key || !j.url) return null;
    key = j.key;
    url = j.url;
  } catch {
    return null;
  }

  try {
    const pc = new RTCPeerConnection();
    const dc = pc.createDataChannel("oai-events");

    /* Everything finished so far, and the phrase being spoken now.
       They are kept apart so the live words can be replaced by the
       tidier final version without eating what came before. */
    let settled = "";
    let partial = "";
    dc.onmessage = (e) => {
      let m: { type?: string; delta?: string; transcript?: string };
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (!m.type?.includes("input_audio_transcription")) return;
      if (m.type.endsWith(".delta") && m.delta) {
        partial += m.delta;
        onPhrase(settled, partial);
      } else if (m.type.endsWith(".completed") && m.transcript) {
        settled = (settled ? settled + " " : "") + m.transcript.trim();
        partial = "";
        onPhrase(settled, "");
      }
    };

    for (const track of stream.getAudioTracks()) pc.addTrack(track, stream);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/sdp" },
      body: offer.sdp,
    });
    if (!res.ok) {
      pc.close();
      return null;
    }
    await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
    return { pc, dc };
  } catch {
    return null;
  }
}

/** The format this browser will actually give us. */
function pickType() {
  const wanted = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4", // Safari, iOS
    "audio/ogg;codecs=opus",
  ];
  if (typeof MediaRecorder === "undefined") return null;
  return wanted.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export function useVoice(onText: (text: string) => void, onError: (why: string) => void) {
  /* The wave is drawn from this: a rolling history of how loud the
     room actually is, newest last. It lives in a ref and is read by
     an animation frame, never through React - sixty renders a second
     to move some bars would be absurd. */
  const levels = useRef<number[]>(new Array(WAVE_BARS).fill(0));
  const [state, setState] = useState<VoiceState>("idle");
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  /** Set when the recording is being thrown away rather than sent. */
  const discard = useRef(false);
  /** The loudest moment heard, 0-1. Transcription models invent
   *  plausible sentences out of silence, so a recording with nothing
   *  in it must never reach one: an invented expense is far worse
   *  than a dictation that did not take. */
  const peak = useRef(0);
  /** How many readings the meter actually managed. Zero means we
   *  never measured anything, which is not the same as silence and
   *  must never be treated as it. */
  const reads = useRef(0);
  const audio = useRef<AudioContext | null>(null);
  const meter = useRef<number | null>(null);
  /** The live connection, when one could be opened. */
  const live = useRef<Live | null>(null);
  /** What live dictation has settled on so far, so stopping can use
   *  it immediately instead of uploading the clip again. */
  const heardLive = useRef("");

  const supported =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined";

  const cleanup = () => {
    if (live.current) {
      try {
        live.current.dc.close();
        live.current.pc.close();
      } catch {}
      live.current = null;
    }
    if (meter.current !== null) {
      cancelAnimationFrame(meter.current);
      meter.current = null;
    }
    audio.current?.close().catch(() => {});
    audio.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    rec.current = null;
    chunks.current = [];
  };

  /** Watches the level while recording, so we know afterwards
   *  whether anything was actually said. */
  const listen = (s: MediaStream) => {
    try {
      const ctx = new AudioContext();
      audio.current = ctx;
      // A context born outside a trusted tap starts suspended, and a
      // suspended analyser reports a silent room however loud it is.
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      const node = ctx.createAnalyser();
      node.fftSize = 512;
      ctx.createMediaStreamSource(s).connect(node);
      const buf = new Uint8Array(node.fftSize);
      let since = 0;
      let bucket = 0;
      const tick = (now: number) => {
        node.getByteTimeDomainData(buf);
        let max = 0;
        for (const v of buf) max = Math.max(max, Math.abs(v - 128) / 128);
        if (ctx.state === "running") reads.current++;
        peak.current = Math.max(peak.current, max);
        bucket = Math.max(bucket, max);
        /* One bar every 45ms: fast enough to follow a syllable, slow
           enough that the bars read as a shape rather than a blur. */
        if (now - since > 45) {
          since = now;
          const next = levels.current.slice(1);
          // A touch of floor so a quiet moment still shows a line.
          next.push(Math.min(1, Math.max(0.06, bucket * 1.7)));
          levels.current = next;
          bucket = 0;
        }
        meter.current = requestAnimationFrame(tick);
      };
      meter.current = requestAnimationFrame(tick);
    } catch {
      // No meter at all: trust the recording rather than block it.
      reads.current = 0;
    }
  };

  const start = useCallback(async () => {
    if (!supported || state !== "idle") return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      stream.current = s;
      const type = pickType();
      /* Speech needs far less than music. A lower rate means a much
         smaller upload, which on mobile data is most of the wait. */
      const r = type
        ? new MediaRecorder(s, { mimeType: type, audioBitsPerSecond: 32000 })
        : new MediaRecorder(s);
      chunks.current = [];
      discard.current = false;
      peak.current = 0;
      reads.current = 0;
      listen(s);

      r.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      r.onstop = async () => {
        levels.current = new Array(WAVE_BARS).fill(0);
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        const heard = peak.current;
        const measured = reads.current > 20;
        const said = heardLive.current.trim();
        const usedLive = Boolean(live.current) && said.length > 0;
        cleanup();
        if (discard.current || blob.size < 1200) {
          setState("idle");
          return;
        }
        /* Quieter than this is a room, not a voice. Sending it would
           get back a confident paragraph of something never said. */
        if (measured && heard < 0.02) {
          setState("idle");
          onError("I didn't hear anything that time.");
          return;
        }
        /* Live is a preview, not the record. Opening the connection
           takes a moment, so the first words of a sentence can be
           spoken before it is listening - and losing the opening of
           someone's dictation is worse than making them wait a beat.
           The whole clip is always transcribed at the end, and that
           version replaces whatever the preview showed. */
        if (usedLive) {
          // Keep the preview on screen while the real one is fetched.
          onText(said);
        }

        setState("working");
        try {
          const ext = (r.mimeType || "audio/webm").includes("mp4") ? "mp4" : "webm";
          const fd = new FormData();
          fd.set("audio", new File([blob], `clip.${ext}`, { type: blob.type }));
          const res = await fetch("/api/transcribe", { method: "POST", body: fd });

          /* The words arrive in pieces. Each one is handed over as it
             lands, so the sentence writes itself into the box instead
             of appearing whole after a wait. */
          if (res.ok && res.body && (res.headers.get("content-type") ?? "").includes("event-stream")) {
            const reader = res.body.getReader();
            const dec = new TextDecoder();
            let buf = "";
            let said = "";
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              const lines = buf.split(String.fromCharCode(10));
              buf = lines.pop() ?? "";
              for (const line of lines) {
                if (!line.startsWith("data:")) continue;
                const body = line.slice(5).trim();
                if (!body || body === "[DONE]") continue;
                try {
                  const ev = JSON.parse(body) as { type?: string; delta?: string; text?: string };
                  if (ev.type === "transcript.text.delta" && ev.delta) {
                    said += ev.delta;
                    onText(said.trim());
                  } else if (ev.type === "transcript.text.done" && ev.text) {
                    said = ev.text;
                    onText(said.trim());
                  }
                } catch {}
              }
            }
            if (!said.trim()) onError("Nothing came through.");
          } else {
            const j = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
            if (!res.ok || !j.text) onError(j.error ?? "Nothing came through.");
            else onText(j.text);
          }
        } catch {
          onError("That didn't come through. Try again.");
        } finally {
          setState("idle");
        }
      };

      rec.current = r;
      // Timeslice so a long recording is not one enormous final blob.
      r.start(1000);
      setState("recording");

      /* Then try for live words. The recorder above keeps running
         either way, so if the live connection never opens or drops
         mid-sentence, the clip is still there to fall back on. */
      heardLive.current = "";
      const l = await openLive(s, (done, saying) => {
        const all = (done + (saying ? " " + saying : "")).trim();
        heardLive.current = done.trim();
        if (all) onText(all);
      });
      if (l) live.current = l;
    } catch {
      cleanup();
      setState("idle");
      onError("I couldn't reach the microphone.");
    }
  }, [onError, onText, state, supported]);

  /** Stop and transcribe. */
  const stop = useCallback(() => {
    if (rec.current?.state === "recording") {
      discard.current = false;
      rec.current.stop();
    }
  }, []);

  /** Stop and throw the audio away - sending while recording, leaving. */
  const cancel = useCallback(() => {
    if (rec.current?.state === "recording") {
      discard.current = true;
      rec.current.stop();
    } else {
      cleanup();
      setState("idle");
    }
  }, []);

  return { state, supported, start, stop, cancel, levels };
}
