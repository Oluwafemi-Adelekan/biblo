"use client";

import {
  useEffect,
  useLayoutEffect,
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
import { prepareUploads, sendMessage } from "@/app/actions";
import { feel, receivedSound, sentSound } from "@/lib/feedback";
import type { Attachment, Message } from "@/lib/schema";
import { cn } from "@/lib/cn";
import { joinTranscript, readResults } from "@/lib/transcript";

/* ============================================================
   The whole input surface of Biblo.

   You send a line, the app answers what it can read on its own
   straight away, and anything it cannot read stays pending until
   Claude replies into the same thread. Files go through
   /api/upload rather than a Server Action, which caps bodies at
   1MB and quietly kills every photo a phone takes.
   ============================================================ */

type Pending = { file: File; url?: string; error?: string };

/* One retry, because a dropped connection on a phone is usually a
   moment rather than a state. Returns why it failed rather than a
   bare boolean, so the message can say something useful. */
async function put(url: string, file: File): Promise<{ ok: boolean; why: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type || "application/octet-stream" },
      });
      if (res.ok) return { ok: true, why: "" };
      if (attempt === 1) {
        return { ok: false, why: `The storage service said ${res.status}.` };
      }
    } catch {
      if (attempt === 1) {
        return { ok: false, why: "The connection dropped." };
      }
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  return { ok: false, why: "" };
}

/** The id the in-flight copy of your message carries. */
const PENDING_ID = "__sending__";

export function Chat({ messages }: { messages: Message[] }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();

  const [attachOpen, setAttachOpen] = useState(false);
  /* Once the message wraps, the field takes a row of its own and the
     buttons drop beneath it, the way every chat composer does. */
  const [wrapped, setWrapped] = useState(false);

  /* Your message shows the instant you send it, greyed, rather than
     vanishing into an empty composer while a photo uploads. React
     drops it again once the real one arrives from the server. */
  const [thread, showSending] = useOptimistic(
    messages,
    (current, sending: Message) => [...current, sending],
  );

  const rowRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  /* What was in the box when recording started. The transcript is
     appended to it live, so dictating never eats what you typed. */
  const beforeDictation = useRef("");

  const { listening, supported, start, stop } = useDictation((heard) => {
    const base = beforeDictation.current;
    applyText(base ? `${base} ${heard}` : heard);
  });

  function toggleMic() {
    if (listening) {
      stop();
      return;
    }
    beforeDictation.current = text.trim();
    start();
  }

  /* Scrolls the container to its true bottom. scrollIntoView on the
     end marker stopped 86px short every time: the sticky composer
     occupies the last stretch of the scroll area, and aligning the
     marker to the viewport edge parks the newest message's tail
     underneath it. */
  const scrollToEnd = () => {
    const scroller = endRef.current?.closest("main");
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    else endRef.current?.scrollIntoView({ block: "end" });
  };

  /* Arriving on this page must land on the latest message, not the
     top of the thread. Before paint, so there is no flash of the
     beginning; then a ResizeObserver holds the view at the end while
     images and fonts settle - guessed timeouts kept coming up 80px
     short. It lets go after two seconds so it can never wrestle the
     user for the scrollbar. */
  useLayoutEffect(() => {
    scrollToEnd();
    const threadEl = endRef.current?.parentElement;
    if (!threadEl) return;
    const ro = new ResizeObserver(scrollToEnd);
    ro.observe(threadEl);
    const stop = window.setTimeout(() => ro.disconnect(), 2000);
    return () => {
      ro.disconnect();
      window.clearTimeout(stop);
    };
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [thread.length]);

  /* The falling pop when a reply arrives. The ref starts at the
     current tail so loading the page never plays a sound. */
  const lastSeen = useRef(messages.at(-1)?.id);
  useEffect(() => {
    const tail = messages.at(-1);
    if (tail && tail.id !== lastSeen.current) {
      lastSeen.current = tail.id;
      if (tail.from !== "you") receivedSound();
    }
  }, [messages]);

  /* Two reasons to re-measure. Dictation sets the text without going
     through onChange, so the box would not grow to fit a transcript.
     And the height is first measured while the field is still narrow;
     once it takes the full width the text reflows to fewer lines, so
     the height measured a moment ago is now too tall. */
  useEffect(() => {
    if (fieldRef.current) grow(fieldRef.current);
  }, [text, wrapped]);

  /* Height follows the content; the ceiling is CSS (max-h below), so
     a tall phone shows more of a long message than a short one. An
     earlier hardcoded 160px cut every message off at seven lines. */
  function grow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  /* Whether the message wraps is measured against the width the
     field has when it is NOT wrapped, using an off-screen copy of
     the text.

     Measuring the live field instead caused a loop: at 236px the
     text took two lines, so the field went full width, where the
     same text is one line, so it collapsed back to 236px, where it
     wraps again. The decision has to be independent of the layout it
     controls, or it feeds itself. */
  function inlineWidth(row: HTMLElement, field: HTMLElement) {
    const cs = getComputedStyle(row);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const gap = parseFloat(cs.columnGap || cs.gap || "0") || 0;
    let others = 0;
    let count = 0;
    for (const child of Array.from(row.children)) {
      if (child === field || child === mirrorRef.current) continue;
      others += (child as HTMLElement).offsetWidth;
      count += 1;
    }
    return Math.max(row.clientWidth - padX - others - gap * count, 40);
  }

  function measureWrap(next: string) {
    const row = rowRef.current;
    const field = fieldRef.current;
    const mirror = mirrorRef.current;
    if (!row || !field || !mirror) return;

    const cs = getComputedStyle(field);
    mirror.style.width = inlineWidth(row, field) + "px";
    mirror.style.font = cs.font;
    mirror.style.letterSpacing = cs.letterSpacing;
    mirror.textContent = next || "";

    /* The mirror carries no padding, so its scrollHeight is pure
       content: one line, two lines, and nothing else mixed in. */
    const line = parseFloat(cs.lineHeight) || 22;
    setWrapped(mirror.scrollHeight > line * 1.5);
  }

  /* One place where text changes, so typing and dictation both keep
     the layout in step. */
  function applyText(next: string) {
    setText(next);
    measureWrap(next);
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
    feel();
    sentSound();
    setError(null);

    // Cleared straight away so the composer feels immediate; the
    // values are captured first in case the send fails and they
    // need putting back.
    const sentText = text;
    const sentFiles = files;
    applyText("");
    setFiles([]);
    if (fieldRef.current) fieldRef.current.style.height = "auto";

    const restore = () => {
      applyText(sentText);
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
        const uploaded: Attachment[] = [];

        if (sentFiles.length > 0) {
          const prepared = await prepareUploads(
            sentFiles.map((f) => ({
              name: f.file.name,
              type: f.file.type,
              size: f.file.size,
            })),
          );
          if (!prepared.ok) {
            setError(prepared.error);
            restore();
            return;
          }

          /* Straight to storage, not through this app. A Vercel
             function caps its body at 4.5MB, which is under what a
             phone camera produces, so the photos most worth sending
             were the ones that failed. */
          for (let i = 0; i < prepared.targets.length; i++) {
            const t = prepared.targets[i];
            const res = await put(t.url, sentFiles[i].file);
            if (!res.ok) {
              setError(
                `Could not upload ${t.name}. ${res.why} Your message is still in the box.`,
              );
              restore();
              return;
            }
            uploaded.push({
              name: t.name,
              type: t.type,
              size: t.size,
              url: `/api/file/${t.key}`,
            });
          }
        }

        const form = new FormData();
        form.set("text", sentText);
        if (uploaded.length) form.set("attachments", JSON.stringify(uploaded));

        const r = await sendMessage(null, form);
        if (!r.ok) {
          setError(r.error);
          restore();
        }
      } catch (e) {
        /* Say what actually went wrong. The old message asked whether
           the server was still running, which is meaningless on
           Vercel and told nobody anything. */
        setError(
          navigator.onLine
            ? `Something went wrong sending that: ${(e as Error).message ?? "unknown error"}. Your message is still in the box.`
            : "You are offline. Your message is still in the box.",
        );
        restore();
      } finally {
        inFlight.current = false;
      }
    });
  }

  /* Work is open until it is actually done. The line under the thread
     stays up for as long as any of Femi's messages is still pending,
     through the quick read and through the long dig alike, and only a
     real reply ends it. The clock runs from the message's own send
     time, so a reload does not reset the story. */
  const oldestPending = thread.find(
    (m) => m.from === "you" && m.status === "pending" && m.id !== PENDING_ID,
  );
  const working = Boolean(oldestPending);

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
          <Empty onPick={(t) => { applyText(t); fieldRef.current?.focus(); }} />
        ) : (
          thread.map((m) => (
            <Bubble key={m.id} message={m} sending={m.id === PENDING_ID} />
          ))
        )}
        {oldestPending ? (
          <ThinkingLine
            key={oldestPending.id}
            hasFiles={oldestPending.attachments.length > 0}
            since={new Date(oldestPending.at).getTime()}
          />
        ) : null}
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

        {/* One element list either way. Rendering two different
            trees would remount the textarea on the switch and drop
            the caret mid-word, so the order and widths change
            instead. */}
        <div
          ref={rowRef}
          className={cn(
            "flex items-end gap-2 px-4 py-3",
            wrapped && "flex-wrap gap-y-2",
          )}
        >
          {/* An off-screen copy of the text at the field's unwrapped
              width. Never shown; it exists only to be measured. */}
          <div
            ref={mirrorRef}
            aria-hidden="true"
            className="pointer-events-none invisible absolute left-0 top-0 -z-10 whitespace-pre-wrap break-words p-0"
          />
          <button
            type="button"
            onClick={() => setAttachOpen(true)}
            aria-label="Add a photo or file"
            aria-expanded={attachOpen}
            className={cn(
              "mb-0.5 inline-flex size-10 shrink-0 items-center justify-center border border-rule text-ink transition-[transform,background-color] duration-press ease-out-strong hover:bg-ink/5 active:scale-[0.92]",
              wrapped && "order-2",
            )}
          >
            <Plus size={20} weight="bold" />
          </button>

          {/* No box, no outline: the field is the surface it sits on. */}
          <textarea
            ref={fieldRef}
            value={text}
            rows={1}
            onChange={(e) => {
              applyText(e.target.value);
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
            placeholder={listening ? "Listening…" : "Type an expense, or say something"}
            aria-label="Message"
            className={cn(
              "chat-field max-h-[32dvh] min-h-[2.5rem] resize-none bg-transparent py-2 text-body text-ink outline-none placeholder:text-ink/30",
              wrapped ? "order-1 w-full basis-full" : "flex-1 self-center",
            )}
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
                // First of the pair, so this is what pushes them right.
                wrapped && "order-3 ml-auto",
              )}
            >
              {listening ? <Stop size={18} weight="fill" /> : <Microphone size={20} />}
            </button>
          ) : null}

          <button
            type="button"
            onClick={send}
            disabled={sending || (!text.trim() && files.length === 0)}
            aria-label={working && !text.trim() && files.length === 0 ? "Working" : "Send"}
            className={cn(
              "mb-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-bone transition-[transform,opacity] duration-press ease-out-strong active:scale-[0.92] disabled:opacity-25 disabled:active:scale-100",
              // While work is open the button is the activity light,
              // full strength even when there is nothing typed.
              working && "disabled:opacity-100",
              // Takes over the push when there is no mic to do it.
              wrapped && (supported ? "order-4" : "order-3 ml-auto"),
            )}
          >
            {working && !text.trim() && files.length === 0 ? (
              <span
                aria-hidden="true"
                className="size-4 rounded-full border-2 border-bone/30 border-t-bone motion-safe:animate-spin"
              />
            ) : (
              <ArrowUp size={18} weight="bold" />
            )}
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
          These get read and filed for you. Nothing lands in your expenses unread.
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
  const fromReader = m.from === "ai";

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
          mine
            ? "max-w-[85%] bg-moss text-bone px-3.5 py-2.5"
            : fromReader || fromClaude
              ? "max-w-[95%] px-0.5 py-1 text-ink"
              : "max-w-[85%] bg-bone text-ink ring-1 ring-inset ring-ink/8 px-3.5 py-2.5",
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
        {/* One assistant, one voice: no name tags on replies. */}
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

/* The waiting line narrates the actual pipeline rather than a
   generic "thinking": the attachment is downloaded and read first,
   the month context and categories are weighed next, and the reply
   is written last. The stage clock mirrors those phases - inside the
   single model call the phases cannot be observed from outside, so
   the timing is honest pacing, not telemetry. Past thirty seconds it
   stops pretending to know and just says so. */

const SCRIPT_FILES: [string, number][] = [
  ["Reading what you sent…", 0],
  ["Going through the receipt…", 2500],
  ["Working out where it fits…", 6500],
  ["Drafting a reply…", 12000],
  ["Taking longer than usual…", 30000],
  ["This one needs a proper look. Still on it. The answer lands right here when it's done.", 120000],
];

const SCRIPT_TEXT: [string, number][] = [
  ["Reading your message…", 0],
  ["Working out what to do…", 2200],
  ["Drafting a reply…", 8000],
  ["Taking longer than usual…", 30000],
  ["This one needs a proper look. Still on it. The answer lands right here when it's done.", 120000],
];

function ThinkingLine({ hasFiles, since }: { hasFiles: boolean; since: number }) {
  const script = hasFiles ? SCRIPT_FILES : SCRIPT_TEXT;
  const [stage, setStage] = useState(0);

  useEffect(() => {
    /* Staged off the message's real age, not this component's mount,
       so reopening the page mid-dig resumes the story where it truly
       is instead of pretending to start reading again. */
    const compute = () => {
      const elapsed = Math.max(0, Date.now() - since);
      let s = 0;
      for (let i = 0; i < script.length; i++) {
        if (elapsed >= script[i][1]) s = i;
      }
      setStage(s);
    };
    compute();
    const id = window.setInterval(compute, 1000);
    return () => window.clearInterval(id);
  }, [script, since]);

  return (
    <div className="flex flex-col items-start px-0.5">
      <span
        key={stage}
        className="thinking-shimmer text-body motion-safe:animate-[rise_260ms_var(--ease-out-strong)]"
      >
        {script[stage][0]}
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
  /** Transcript from sessions that have already ended and restarted. */
  const carried = useRef("");
  /** The finalised part of the session running right now. */
  const sessionFinal = useRef("");
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

    /* Rebuilt from the full results list every time, never appended
       to. See lib/transcript.ts for why. */
    r.onresult = (e) => {
      const { settled, interim } = readResults(e.results);
      sessionFinal.current = settled;
      cb.current(joinTranscript(carried.current, settled, interim));
    };

    r.onend = () => {
      // The results list resets on restart, so bank this session's
      // finals before they disappear.
      if (sessionFinal.current) {
        carried.current = (carried.current + sessionFinal.current).trimEnd() + " ";
        sessionFinal.current = "";
      }

      if (!wanted.current) {
        setListening(false);
        return;
      }

      // A restart inside onend can throw or loop; a beat of delay
      // keeps it to one chime rather than a stutter.
      window.setTimeout(() => {
        if (!wanted.current) return;
        try {
          r.start();
        } catch {
          wanted.current = false;
          setListening(false);
        }
      }, 250);
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
    carried.current = "";
    sessionFinal.current = "";
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
