"use client";

import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUp,
  Camera,
  FileText,
  Microphone,
  Plus,
  Stop,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/Sheet";
import { Label } from "@/components/ui/Text";
import { sendMessage } from "@/app/actions";
import type { Attachment, Message } from "@/lib/schema";
import { cn } from "@/lib/cn";

/* ============================================================
   The whole input surface of Biblo.

   You send a line, the app answers what it can read on its own
   straight away, and anything it cannot read stays pending until
   Claude replies into the same thread. Files go through
   /api/upload rather than a Server Action, which caps bodies at
   1MB and quietly kills every photo a phone takes.
   ============================================================ */

type Pending = { file: File; url?: string; error?: string };

/** The id the in-flight copy of your message carries. */
const PENDING_ID = "__sending__";

export function Chat({ messages }: { messages: Message[] }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();

  const [attachOpen, setAttachOpen] = useState(false);

  /* Your message shows the instant you send it, greyed, rather than
     vanishing into an empty composer while a photo uploads. React
     drops it again once the real one arrives from the server. */
  const [thread, showSending] = useOptimistic(
    messages,
    (current, sending: Message) => [...current, sending],
  );

  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  /* What was in the box when recording started. The transcript is
     appended to it live, so dictating never eats what you typed. */
  const beforeDictation = useRef("");

  const { listening, supported, start, stop } = useDictation((heard) => {
    const base = beforeDictation.current;
    setText(base ? `${base} ${heard}` : heard);
  });

  function toggleMic() {
    if (listening) {
      stop();
      return;
    }
    beforeDictation.current = text.trim();
    start();
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [thread.length]);

  /* Dictation sets the text without going through onChange, so the
     box would not grow to fit a long transcript without this. */
  useEffect(() => {
    if (fieldRef.current) grow(fieldRef.current);
  }, [text]);

  function grow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  function take(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setFiles((p) => [...p, ...picked.map((file) => ({ file }))]);
    e.target.value = "";
  }

  /* Set synchronously, before the first await. `sending` comes from
     useTransition and is only true once the transition starts, which
     left the whole upload unguarded: five taps during one slow photo
     upload produced five identical messages. A ref flips before
     anything can yield, so the second tap has something to see. */
  const inFlight = useRef(false);

  function send() {
    if (inFlight.current || sending) return;
    if (!text.trim() && files.length === 0) return;

    inFlight.current = true;
    setError(null);

    // Cleared straight away so the composer feels immediate; the
    // values are captured first in case the send fails and they
    // need putting back.
    const sentText = text;
    const sentFiles = files;
    setText("");
    setFiles([]);
    if (fieldRef.current) fieldRef.current.style.height = "auto";

    const restore = () => {
      setText(sentText);
      setFiles(sentFiles);
    };

    startSending(async () => {
      showSending({
        id: PENDING_ID,
        at: new Date().toISOString(),
        from: "you",
        text: sentText || undefined,
        attachments: sentFiles.map((f) => ({
          name: f.file.name,
          type: f.file.type,
          size: f.file.size,
          url: "",
        })),
        status: "pending",
      });

      try {
        let uploaded: Attachment[] = [];
        if (sentFiles.length > 0) {
          const body = new FormData();
          for (const f of sentFiles) body.append("files", f.file);
          const res = await fetch("/api/upload", { method: "POST", body });
          const json = await res.json();
          if (!res.ok) {
            setError(json.error ?? "Upload failed.");
            restore();
            return;
          }
          uploaded = json.files;
        }

        const form = new FormData();
        form.set("text", sentText);
        if (uploaded.length) form.set("attachments", JSON.stringify(uploaded));

        const r = await sendMessage(null, form);
        if (!r.ok) {
          setError(r.error);
          restore();
        }
      } catch {
        setError("Could not reach the server. Is it still running?");
        restore();
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ---- the thread ---------------------------------------- */}
      <div
        className={cn(
          "flex flex-1 flex-col space-y-3 px-4 py-5",
          thread.length === 0 ? "justify-center" : "justify-end",
        )}
      >
        {thread.length === 0 ? (
          <Empty onPick={(t) => { setText(t); fieldRef.current?.focus(); }} />
        ) : (
          thread.map((m) => (
            <Bubble key={m.id} message={m} sending={m.id === PENDING_ID} />
          ))
        )}
        <div ref={endRef} />
      </div>

      {/* ---- composer ------------------------------------------ */}
      <div className="sticky bottom-0 border-t border-rule bg-bone">
        {error ? (
          <p className="flex items-start gap-2 bg-ember px-4 py-2.5 text-meta text-ink">
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
              <X size={15} weight="bold" />
            </button>
          </p>
        ) : null}

        {files.length > 0 ? (
          <ul className="flex flex-wrap gap-2 px-4 pt-3">
            {files.map((f, i) => (
              <li
                key={i}
                className="flex items-center gap-2 border border-rule bg-bone-lift py-1.5 pl-2 pr-1.5"
              >
                <FileText size={14} className="text-ink/60" />
                <span className="max-w-[9rem] truncate text-label text-ink/70">
                  {f.file.name}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${f.file.name}`}
                  onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                  className="text-ink/50 hover:text-ink"
                >
                  <X size={13} weight="bold" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex items-end gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => setAttachOpen(true)}
            aria-label="Add a photo or file"
            aria-expanded={attachOpen}
            className="mb-0.5 inline-flex size-10 shrink-0 items-center justify-center border border-rule text-ink transition-[transform,background-color] duration-press ease-out-strong hover:bg-ink/5 active:scale-[0.92]"
          >
            <Plus size={20} weight="bold" />
          </button>

          {/* No box, no outline: the field is the surface it sits on. */}
          <textarea
            ref={fieldRef}
            value={text}
            rows={1}
            onChange={(e) => {
              setText(e.target.value);
              grow(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            enterKeyHint="send"
            autoCapitalize="sentences"
            placeholder={listening ? "Listening…" : "5k fuel"}
            aria-label="Message"
            className="chat-field max-h-40 min-h-[2.5rem] flex-1 resize-none self-center bg-transparent py-2 text-body text-ink outline-none placeholder:text-ink/30"
          />

          {supported ? (
            <button
              type="button"
              onClick={toggleMic}
              aria-label={listening ? "Stop dictating" : "Dictate"}
              aria-pressed={listening}
              className={cn(
                "mb-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-[transform,background-color,color] duration-press ease-out-strong active:scale-[0.92]",
                listening
                  ? "bg-ember text-ink motion-safe:animate-[pulse-mic_1.4s_ease-in-out_infinite]"
                  : "text-ink/60 hover:text-ink",
              )}
            >
              {listening ? <Stop size={18} weight="fill" /> : <Microphone size={20} />}
            </button>
          ) : null}

          <button
            type="button"
            onClick={send}
            disabled={sending || (!text.trim() && files.length === 0)}
            aria-label="Send"
            className="mb-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-bone transition-[transform,opacity] duration-press ease-out-strong active:scale-[0.92] disabled:opacity-25 disabled:active:scale-100"
          >
            <ArrowUp size={18} weight="bold" />
          </button>
        </div>

        <input
          ref={pickRef}
          type="file"
          multiple
          accept="image/*,application/pdf,text/*,.csv,.json,.xlsx,.xls,.doc,.docx"
          className="hidden"
          onChange={take}
        />
        {/* capture= opens the camera straight away on a phone. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={take}
        />
      </div>

      <AttachSheet
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        onCamera={() => {
          setAttachOpen(false);
          cameraRef.current?.click();
        }}
        onUpload={() => {
          setAttachOpen(false);
          pickRef.current?.click();
        }}
      />
    </div>
  );
}

/* --- attach ----------------------------------------------------
   A plus, not a paperclip, opening the two things you actually do:
   point the camera at a receipt, or pick a file you already have. */

function AttachSheet({
  open,
  onClose,
  onCamera,
  onUpload,
}: {
  open: boolean;
  onClose: () => void;
  onCamera: () => void;
  onUpload: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} label="Add a photo or file">
      <div className="bg-bone">
        <div className="flex items-center justify-between border-b border-rule px-5 py-4">
          <Label tone="dim">Add to this message</Label>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-9 items-center justify-center rounded-full text-ink/70 transition-transform duration-press ease-out-strong active:scale-[0.92]"
          >
            <X size={20} />
          </button>
        </div>

        <ul className="divide-y divide-rule">
          <li>
            <AttachOption
              icon={<Camera size={22} />}
              title="Take a photo"
              detail="Point at a receipt or a POS slip"
              onClick={onCamera}
            />
          </li>
          <li>
            <AttachOption
              icon={<UploadSimple size={22} />}
              title="Upload files"
              detail="Screenshots, PDFs, statements, spreadsheets"
              onClick={onUpload}
            />
          </li>
        </ul>

        <p className="px-5 py-4 text-meta text-ink/55">
          Claude reads these. Nothing lands in your expenses until it does.
        </p>
        <div className="h-[max(1.25rem,env(safe-area-inset-bottom))]" />
      </div>
    </Sheet>
  );
}

function AttachOption({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 px-5 py-4 text-left transition-[transform,background-color] duration-press ease-out-strong hover:bg-ink/5 active:scale-[0.99]"
    >
      <span className="flex size-11 shrink-0 items-center justify-center bg-moss text-bone">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-body font-medium">{title}</span>
        <span className="mt-0.5 block text-meta text-ink/55">{detail}</span>
      </span>
    </button>
  );
}

/* --- one message ---------------------------------------------- */

function Bubble({
  message: m,
  sending = false,
}: {
  message: Message;
  sending?: boolean;
}) {
  const mine = m.from === "you";
  const fromClaude = m.from === "claude";

  return (
    <div
      className={cn(
        "flex flex-col motion-safe:animate-[rise_260ms_var(--ease-out-strong)]",
        mine ? "items-end" : "items-start",
        // Dimmed until the server has it, so "sent" and "sending"
        // never look the same.
        sending && "opacity-55",
      )}
    >
      <div
        className={cn(
          "max-w-[85%] px-3.5 py-2.5",
          mine
            ? "bg-moss text-bone"
            : fromClaude
              ? "bg-bone-lift text-ink ring-1 ring-inset ring-ink/12"
              : "bg-bone text-ink ring-1 ring-inset ring-ink/8",
        )}
      >
        {m.attachments.length > 0 ? (
          <ul className={cn("space-y-2", m.text ? "mb-2" : "")}>
            {m.attachments.map((a) => (
              <li key={a.url}>
                {a.type.startsWith("image/") ? (
                  <Image
                    src={a.url}
                    alt={a.name}
                    width={200}
                    height={200}
                    unoptimized
                    className="max-h-48 w-auto object-cover"
                  />
                ) : (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      "flex items-center gap-2 border px-2.5 py-2",
                      mine ? "border-bone/25" : "border-rule",
                    )}
                  >
                    <FileText size={16} />
                    <span className="max-w-[12rem] truncate text-meta">{a.name}</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        {m.text ? <p className="whitespace-pre-wrap text-body">{m.text}</p> : null}
      </div>

      <span className="mt-1 flex items-center gap-1.5 px-0.5 text-label uppercase text-ink/40">
        {sending ? (
          <>
            <span className="size-1.5 animate-[pulse-mic_1.1s_ease-in-out_infinite] rounded-full bg-ink/50" />
            {m.attachments.length > 0
              ? `Sending ${m.attachments.length} ${m.attachments.length === 1 ? "file" : "files"}`
              : "Sending"}
          </>
        ) : null}
        {sending ? null : fromClaude ? "Claude · " : ""}
        {/* en-NG is a 24h locale, so midnight reads as "0:21" without
            this. Nobody writes the time that way. */}
        {sending
          ? null
          : new Date(m.at).toLocaleTimeString("en-NG", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })}
        {!sending && mine && m.status === "pending" ? " · waiting" : ""}
        {m.expenseId && !mine ? (
          <Link
            href={`/expenses/${m.expenseId}`}
            className="underline underline-offset-2 hover:text-ink"
          >
            open
          </Link>
        ) : null}
      </span>
    </div>
  );
}

function Empty({ onPick }: { onPick: (t: string) => void }) {
  const EXAMPLES = ["5k fuel", "2,000 lunch", "barber 5000", "paid mum 100k"];
  return (
    <div className="py-10 text-center">
      <p className="text-title">Tell me what you spent.</p>
      <p className="mx-auto mt-2 max-w-[26ch] text-meta text-ink/60">
        Type it, say it, or send a receipt.
      </p>
      <ul className="mt-5 flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((x) => (
          <li key={x}>
            <button
              type="button"
              onClick={() => onPick(x)}
              className="border border-rule px-3 py-1.5 text-meta text-ink/70 transition-[transform,background-color] duration-press ease-out-strong hover:bg-ink/5 active:scale-[0.96]"
            >
              {x}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --- the mic ---------------------------------------------------
   Real speech recognition, run by the browser. It is free, needs no
   key, and hands back text rather than an audio file, which matters
   because an audio file is something neither the app nor Claude can
   read. Unsupported browsers simply do not get the button. */

type SpeechWindow = {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function useDictation(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const ref = useRef<SpeechRecognitionLike | null>(null);
  const cb = useRef(onTranscript);
  /** Everything finalised since the button was pressed. */
  const settled = useRef("");
  /** What the user wants, as opposed to what the engine is doing. */
  const wanted = useRef(false);

  /* Whether the browser can do this is a fixed fact about the
     browser, not state that changes, so it is read through
     useSyncExternalStore. That keeps it out of an effect and still
     renders false on the server, where there is no window. */
  const supported = useSyncExternalStore(
    () => () => {},
    () => {
      const w = window as unknown as SpeechWindow;
      return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
    },
    () => false,
  );

  // Built on first use rather than on mount: nothing is needed until
  // the button is actually pressed.
  function get() {
    if (ref.current) return ref.current;
    const w = window as unknown as SpeechWindow;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return null;

    const r = new Ctor();
    // Keep listening through pauses, and show words as they land
    // rather than only at the end of a sentence.
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-NG";

    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) settled.current += chunk;
        else interim += chunk;
      }
      cb.current((settled.current + interim).replace(/\s+/g, " ").trim());
    };

    /* Engines stop on their own: Safari ignores `continuous`, and
       Chrome times out after a stretch of silence. While the user
       still has the button held down, start it again so it behaves
       like one long recording. */
    r.onend = () => {
      if (!wanted.current) {
        setListening(false);
        return;
      }
      try {
        r.start();
      } catch {
        wanted.current = false;
        setListening(false);
      }
    };

    r.onerror = () => {
      wanted.current = false;
      setListening(false);
    };

    ref.current = r;
    return r;
  }

  const start = () => {
    // Refreshed here rather than during render: a ref written while
    // rendering is a side effect in the render phase.
    cb.current = onTranscript;
    const r = get();
    if (!r) return;
    settled.current = "";
    wanted.current = true;
    try {
      r.start();
      setListening(true);
    } catch {
      wanted.current = false;
      setListening(false);
    }
  };

  const stop = () => {
    cb.current = onTranscript;
    wanted.current = false;
    const r = ref.current;
    if (r) {
      try { r.stop(); } catch {}
    }
    setListening(false);
  };

  return { listening, supported, start, stop };
}
