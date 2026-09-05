"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowSquareOut,
  ArrowUp,
  Camera,
  CaretDown,
  Check,
  CircleNotch,
  FileText,
  Microphone,
  Plus,
  Question,
  Receipt,
  Stop,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import { dayLabel, naira } from "@/lib/format";
import { Sheet } from "@/components/ui/Sheet";
import { Label } from "@/components/ui/Text";
import { prepareUploads, resolveApproval, sendMessage } from "@/app/actions";
import { feel, receivedSound, sentSound } from "@/lib/feedback";
import type { Attachment, Message } from "@/lib/schema";
import { cn } from "@/lib/cn";
import { joinTranscript, mergeTranscript, readResults } from "@/lib/transcript";

/* ============================================================
   The whole input surface of Biblo.

   You send a line, the app answers what it can read on its own
   straight away, and anything it cannot read stays pending until
   Claude replies into the same thread. Files go through
   /api/upload rather than a Server Action, which caps bodies at
   1MB and quietly kills every photo a phone takes.
   ============================================================ */

type Pending = { file: File; url?: string; error?: string; preview?: string };

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

export type ExpenseLite = {
  label: string;
  amount: number;
  date: string;
  category: string;
  items: number;
};

export function Chat({
  messages,
  expenses = {},
}: {
  messages: Message[];
  expenses?: Record<string, ExpenseLite>;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();

  const [attachOpen, setAttachOpen] = useState(false);
  /* An image tapped anywhere in the chat opens full screen. */
  const [viewer, setViewer] = useState<string | null>(null);
  /* The one reply that just arrived and should type itself out. */
  const [revealId, setRevealId] = useState<string | null>(null);
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

  /* While recording with words on screen, the composer always takes
     the two-row shape: text on its own full row, and the button row
     underneath holding plus, the ripple, stop and send - the ripple
     never leaves that slot. */
  const rowWrapped = wrapped || (listening && text.trim().length > 0);

  function toggleMic() {
    if (listening) {
      stop();
      // Re-judge the layout without the ripple in the row.
      measureWrap(text);
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
      if (tail.from !== "you") {
        receivedSound();
        // A reply that lands while you watch types itself out.
        setRevealId(tail.id);
      }
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
      /* The field lives inside a positioning span now, so "the
         field's own slot" means any child containing it - counting
         that span as an occupied neighbour subtracted the field's
         width from itself, shrank the mirror to 40px, and ten thin
         letters "filled" the line. The listening ripple is skipped
         too: it borrows the field's slot, it does not occupy one. */
      if (child === field || child === mirrorRef.current) continue;
      if (child.contains(field)) continue;
      if (child.getAttribute("aria-hidden") === "true") continue;
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
     the layout in step - and the draft survives leaving the page. */
  function applyText(next: string) {
    setText(next);
    measureWrap(next);
    try {
      if (next) localStorage.setItem("biblo-draft", next);
      else localStorage.removeItem("biblo-draft");
    } catch {}
  }

  /* Two seconds away or two hours, coming back finds your words
     where you left them. Sending clears it; a failed send restores
     it through the same applyText, so the draft follows the truth. */
  useEffect(() => {
    try {
      const saved = localStorage.getItem("biblo-draft");
      if (saved) applyText(saved);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* One door for files however they arrive - picked, shot, pasted. */
  function stage(picked: File[]) {
    if (picked.length === 0) return;
    setFiles((p) => [
      ...p,
      ...picked.map((file) => ({
        file,
        // Images show as themselves, not as filenames.
        preview: file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined,
      })),
    ]);
  }

  function take(e: React.ChangeEvent<HTMLInputElement>) {
    stage(Array.from(e.target.files ?? []));
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
        } else {
          // Sent for real; the local previews have done their job.
          for (const f of sentFiles) {
            if (f.preview) URL.revokeObjectURL(f.preview);
          }
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

  /* An open approval takes over the composer entirely - his ask: the
     input goes, the question and its two buttons stand in its place.
     "Leave it" is always the way back to the keyboard. */
  const openAsk = [...thread]
    .reverse()
    .find((m) => m.from !== "you" && m.meta?.approval?.state === "open");

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
          thread.map((m) =>
            // The open question lives in the composer card, not here.
            m.id === openAsk?.id ? null : (
              <Bubble
                key={m.id}
                message={m}
                sending={m.id === PENDING_ID}
                onView={setViewer}
                expense={m.expenseId ? expenses[m.expenseId] : undefined}
                reveal={m.id === revealId}
              />
            ),
          )
        )}
        {oldestPending ? (
          <ThinkingLine
            key={oldestPending.id}
            message={oldestPending}
            since={new Date(oldestPending.at).getTime()}
          />
        ) : null}
        <div ref={endRef} />
      </div>

      {viewer ? <Lightbox url={viewer} onClose={() => setViewer(null)} /> : null}

      {/* ---- composer ------------------------------------------ */}
      <div className="sticky bottom-0 border-t border-rule bg-bone">
        {openAsk ? <ApprovalCard key={openAsk.id} m={openAsk} /> : null}

        {/* Hidden, not unmounted, while a question is up: the draft,
            the staged files and the caret all survive the card. */}
        <div hidden={Boolean(openAsk)}>
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
              <li key={i} className="relative">
                {f.preview ? (
                  <button
                    type="button"
                    aria-label={`View ${f.file.name}`}
                    onClick={() => setViewer(f.preview!)}
                    className="block border border-rule"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={f.preview}
                      alt={f.file.name}
                      className="size-14 object-cover"
                    />
                  </button>
                ) : (
                  <span className="flex items-center gap-2 border border-rule bg-bone-lift py-1.5 pl-2 pr-6">
                    <FileText size={14} className="text-ink/60" />
                    <span className="max-w-[9rem] truncate text-label text-ink/70">
                      {f.file.name}
                    </span>
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${f.file.name}`}
                  onClick={() => {
                    if (f.preview) URL.revokeObjectURL(f.preview);
                    setFiles((p) => p.filter((_, j) => j !== i));
                  }}
                  className={cn(
                    "absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-ink text-bone",
                    !f.preview && "bg-transparent text-ink/50 hover:text-ink right-0.5 top-1/2 -translate-y-1/2",
                  )}
                >
                  <X size={11} weight="bold" />
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
            rowWrapped && "flex-wrap gap-y-2",
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
              rowWrapped && "order-2",
            )}
          >
            <Plus size={20} weight="bold" />
          </button>

          {/* No box, no outline: the field is the surface it sits on.
              The span exists so the listening ripple can sit exactly
              where the placeholder would, until words replace it. */}
          <span
            className={cn(
              // flex, not inline: an inline span adds baseline space
              // under the field and knocked the placeholder off-centre.
              "relative flex items-center",
              rowWrapped ? "order-1 w-full basis-full" : "flex-1 self-center",
              // Recording with nothing said yet: the ripple holds the
              // middle of the row alone; no empty text line above it.
              listening && !text.trim() && "hidden",
            )}
          >
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
            onPaste={(e) => {
              /* A screenshot pasted straight into the box stages
                 like any picked photo. Text pastes fall through. */
              const imgs = Array.from(e.clipboardData?.files ?? []).filter(
                (f) => f.type.startsWith("image/"),
              );
              if (imgs.length > 0) {
                e.preventDefault();
                stage(imgs);
              }
            }}
            enterKeyHint="send"
            autoCapitalize="sentences"
            placeholder={listening ? "" : "Type an expense, or say something"}
            aria-label="Message"
            className="chat-field max-h-[32dvh] min-h-[2.5rem] w-full resize-none bg-transparent py-2 text-body text-ink outline-none placeholder:text-ink/30"
          />
          </span>

          {/* The ripple lives between plus and stop for the whole
              take - whether words exist yet or not - and leaves only
              when recording stops. */}
          {listening ? (
            <Wave
              className={cn(
                "mx-1 mb-2 min-w-0 flex-1 justify-between self-center px-1",
                rowWrapped && "order-2",
              )}
            />
          ) : null}

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
                rowWrapped && "order-3",
                wrapped && !listening && "ml-auto",
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
              rowWrapped && (supported ? "order-4" : "order-3"),
              wrapped && !supported && !listening && "ml-auto",
            )}
          >
            {working && !text.trim() && files.length === 0 ? (
              <CircleNotch
                size={20}
                weight="bold"
                className="motion-safe:animate-spin"
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
  onView,
  expense,
  reveal = false,
}: {
  message: Message;
  sending?: boolean;
  onView?: (url: string) => void;
  expense?: ExpenseLite;
  reveal?: boolean;
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
                  <button
                    type="button"
                    aria-label={`View ${a.name} full screen`}
                    onClick={() => onView?.(a.url)}
                    disabled={!a.url}
                    className="block"
                  >
                    <Image
                      src={a.url}
                      alt={a.name}
                      width={200}
                      height={200}
                      unoptimized
                      className="max-h-48 w-auto object-cover"
                    />
                  </button>
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

        {m.text ? (
          mine ? (
            <p className="whitespace-pre-wrap text-body">{m.text}</p>
          ) : (
            <Reply text={m.text} reveal={reveal} id={m.id} />
          )
        ) : null}
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
      </span>

      {/* What this message did to the money, as a thing you can
          open rather than a word you have to spot. */}
      {expense && m.expenseId && !mine ? (
        <ExpenseCard id={m.expenseId} e={expense} />
      ) : null}

      {/* A question that has been answered keeps its outcome. */}
      {m.meta?.approval && m.meta.approval.state !== "open" ? (
        <span className="mt-1 px-0.5 text-label uppercase text-ink/40">
          {m.meta.approval.state === "approved" ? "Approved" : "Left as is"}
        </span>
      ) : null}
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

/* ---- full-screen image viewer ---------------------------------
   Any image in the chat, sent or about to be, opens over everything
   on tap. Tapping anywhere, or the X, puts it away. */
function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/92 motion-safe:animate-[rise_180ms_var(--ease-out-strong)]"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-bone/10 text-bone"
        style={{ marginTop: "env(safe-area-inset-top)" }}
      >
        <X size={20} weight="bold" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="max-h-[88dvh] max-w-[94vw] object-contain"
      />
    </div>
  );
}

/* ---- assistant replies with real links ------------------------
   The searching reader cites the web in markdown: inline links and
   trailing "([site](url))" citation groups. Citations leave the
   prose and become source chips underneath, favicon and domain,
   the way search products show references; whatever links remain
   inline become actual links. */
/* Absolute links from web citations, and root-relative ones so the
   assistant can hand out in-app doors like /api/export. */
const MD_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g;
const CITATION_GROUP =
  /\s*\(\s*((?:\[[^\]]+\]\(https?:\/\/[^\s)]+\)(?:[,;]\s*)?)+)\)/g;

/** Replies that already typed themselves out once, so a refresh
 *  never replays the reveal. */
const REVEALED = new Set<string>();

const favicon = (url: string) => {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`;
  } catch {
    return "";
  }
};

function Reply({
  text,
  reveal = false,
  id = "",
}: {
  text: string;
  reveal?: boolean;
  id?: string;
}) {
  const sources: { label: string; url: string }[] = [];
  const prose = text
    .replace(CITATION_GROUP, (_, group: string) => {
      for (const m of group.matchAll(MD_LINK)) {
        if (!sources.some((s) => s.url === m[2]))
          sources.push({ label: m[1], url: m[2] });
      }
      return "";
    })
    .replace(/[ \t]+([.,;!?])/g, "$1");

  /* Tokenised once so the typewriter can cut anywhere without ever
     showing raw markdown mid-link. */
  const toks: { text: string; url?: string }[] = [];
  let at = 0;
  for (const m of prose.matchAll(MD_LINK)) {
    if (m.index > at) toks.push({ text: prose.slice(at, m.index) });
    toks.push({ text: m[1], url: m[2] });
    at = m.index + m[0].length;
  }
  if (at < prose.length) toks.push({ text: prose.slice(at) });
  const total = toks.reduce((n, t) => n + t.text.length, 0);

  const wants = reveal && id !== "" && !REVEALED.has(id);
  const [budget, setBudget] = useState(Number.POSITIVE_INFINITY);
  const [srcOpen, setSrcOpen] = useState(false);

  /* A reply that lands while you watch types itself out, about a
     character every 12ms - the reassurance of seeing it happen,
     without pretending to stream. Layout effect so the full text
     never flashes first. Reduced motion shows it whole. */
  useLayoutEffect(() => {
    if (!wants) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      REVEALED.add(id);
      return;
    }
    setBudget(0);
    const t0 = Date.now();
    const iv = window.setInterval(() => {
      const b = Math.floor((Date.now() - t0) / 12);
      setBudget(b);
      if (b >= total) {
        window.clearInterval(iv);
        REVEALED.add(id);
      }
    }, 35);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wants]);

  const done = budget >= total;
  const parts: React.ReactNode[] = [];
  let remaining = budget;
  toks.forEach((t, i) => {
    if (remaining <= 0) return;
    const chunk = t.text.slice(0, Math.min(t.text.length, remaining));
    remaining -= t.text.length;
    parts.push(
      t.url ? (
        <a
          key={i}
          href={t.url}
          target={t.url.startsWith("http") ? "_blank" : undefined}
          rel={t.url.startsWith("http") ? "noreferrer" : undefined}
          className="underline decoration-ink/35 underline-offset-2 hover:decoration-ink"
        >
          {chunk}
        </a>
      ) : (
        <span key={i}>{chunk}</span>
      ),
    );
  });

  /* Three at most, per Femi: past that the row stops informing. */
  const shown = sources.slice(0, 3);

  return (
    <>
      <p className="whitespace-pre-wrap text-body">{parts}</p>
      {done && shown.length > 0 ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setSrcOpen((o) => !o)}
            aria-expanded={srcOpen}
            className="flex items-center gap-2 text-label uppercase text-ink/55 transition-colors duration-press hover:text-ink"
          >
            <span className="flex">
              {shown.map((s, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={s.url}
                  src={favicon(s.url)}
                  alt=""
                  width={16}
                  height={16}
                  className={cn(
                    "size-4 rounded-full ring-2 ring-bone",
                    i > 0 && "-ml-1.5",
                  )}
                />
              ))}
            </span>
            {shown.length} {shown.length === 1 ? "source" : "sources"}
            <CaretDown
              size={11}
              weight="bold"
              className={cn(
                "transition-transform duration-press ease-out-strong",
                srcOpen && "rotate-180",
              )}
            />
          </button>
          {srcOpen ? (
            <ul className="mt-1.5 border border-rule bg-bone motion-safe:animate-[rise_180ms_var(--ease-out-strong)]">
              {shown.map((s, i) => {
                let host = "";
                try {
                  host = new URL(s.url).hostname.replace(/^www\./, "");
                } catch {
                  return null;
                }
                return (
                  <li key={s.url} className={i > 0 ? "border-t border-rule" : ""}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2.5 px-3 py-2.5 transition-[background-color] duration-press hover:bg-ink/5"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={favicon(s.url)}
                        alt=""
                        width={16}
                        height={16}
                        className="size-4 rounded-[3px]"
                      />
                      <span className="min-w-0 flex-1 truncate text-meta text-ink underline decoration-ink/25 underline-offset-2">
                        {s.label}
                      </span>
                      <span className="shrink-0 text-label text-ink/45">{host}</span>
                      <span className="flex size-4 shrink-0 items-center justify-center bg-ink/8 text-label text-ink/60">
                        {i + 1}
                      </span>
                      <ArrowSquareOut size={13} className="shrink-0 text-ink/45" />
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/* ---- the approval card -----------------------------------------
   From his beui reference: when the assistant holds a change out
   for a yes or no, the card IS the composer - no input field
   underneath, no layer above one. Two buttons; both give the
   keyboard back. */
function ApprovalCard({ m }: { m: Message }) {
  const ap = m.meta!.approval!;
  const [busy, start] = useTransition();
  const [choice, setChoice] = useState<boolean | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const answer = (approved: boolean) => {
    if (busy) return;
    feel();
    setChoice(approved);
    start(async () => {
      await resolveApproval(m.id, approved);
    });
  };

  const p = ap.proposal as {
    expenses: { label?: string; amount?: number; categoryId?: string }[];
    edits: { id: string; set: Record<string, unknown> }[];
    deletes: string[];
  };
  const lines = [
    ...p.expenses.map(
      (e) =>
        `File ${naira(Math.abs(Number(e.amount ?? 0)), { decimals: 0 })} · ${e.label ?? ""} → ${e.categoryId ?? ""}`,
    ),
    ...p.edits.map(
      (ed) =>
        `Update ${ed.id}: ${Object.entries(ed.set)
          .map(([k, v]) => `${k} → ${Array.isArray(v) ? `${v.length} items` : String(v)}`)
          .join(", ")}`,
    ),
    ...p.deletes.map((d) => `Remove ${d}`),
  ];

  return (
    <div className="px-4 py-4 motion-safe:animate-[rise_200ms_var(--ease-out-strong)]">
      <div className="flex items-start gap-3">
        <Question size={18} weight="bold" className="mt-0.5 shrink-0 text-ink/60" />
        <div className="min-w-0 flex-1">
          <p className="text-body text-ink">{m.text}</p>
          {ap.detail ? (
            <p className="mt-1 text-meta text-ink/60">{ap.detail}</p>
          ) : null}
          {lines.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => setDetailOpen((o) => !o)}
                aria-expanded={detailOpen}
                className="mt-1.5 flex items-center gap-1 text-label uppercase text-ink/50 transition-colors duration-press hover:text-ink"
              >
                View details
                <CaretDown
                  size={10}
                  weight="bold"
                  className={cn(
                    "transition-transform duration-press ease-out-strong",
                    detailOpen && "rotate-180",
                  )}
                />
              </button>
              {detailOpen ? (
                <ul className="mt-1.5 space-y-1 border-l-2 border-rule pl-2.5 text-meta text-ink/70 motion-safe:animate-[rise_160ms_var(--ease-out-strong)]">
                  {lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-3.5 flex items-center gap-2 pl-[30px]">
        <button
          type="button"
          disabled={busy}
          onClick={() => answer(true)}
          className="inline-flex items-center gap-2 bg-ink px-5 py-3 text-label uppercase text-bone transition-transform duration-press ease-out-strong active:scale-[0.97] disabled:opacity-60"
        >
          {busy && choice === true ? (
            <CircleNotch size={14} weight="bold" className="animate-spin" />
          ) : (
            <Check size={14} weight="bold" />
          )}
          Go ahead
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => answer(false)}
          className="inline-flex items-center gap-2 px-4 py-3 text-label uppercase text-ink/60 transition-colors duration-press hover:text-ink disabled:opacity-60"
        >
          {busy && choice === false ? (
            <CircleNotch size={14} weight="bold" className="animate-spin" />
          ) : (
            <X size={14} weight="bold" />
          )}
          Leave it
        </button>
      </div>
    </div>
  );
}

/* ---- what a message did to the money ---------------------------
   Filed or corrected an entry? The message carries a small card:
   amount and name at a glance, tap for the rest and the way in. */
function ExpenseCard({ id, e }: { id: string; e: ExpenseLite }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5 w-full max-w-[85%] border border-rule bg-bone-lift">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <Receipt size={15} className="shrink-0 text-ink/60" />
        <span className="min-w-0 flex-1 truncate text-meta text-ink">
          {naira(Math.abs(e.amount), { decimals: 0 })} · {e.label}
        </span>
        <CaretDown
          size={13}
          weight="bold"
          className={cn(
            "shrink-0 text-ink/45 transition-transform duration-press ease-out-strong",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="border-t border-rule px-3 py-2.5 motion-safe:animate-[rise_180ms_var(--ease-out-strong)]">
          <p className="text-meta text-ink/70">
            {e.category} · {dayLabel(e.date)}
            {e.items > 0 ? ` · ${e.items} items` : ""}
          </p>
          <Link
            href={`/expenses/${id}`}
            className="mt-2 inline-flex items-center gap-1.5 text-meta font-medium text-ink underline underline-offset-2"
          >
            Open
            <ArrowSquareOut size={13} />
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/* ---- the listening ripple --------------------------------------
   Sits exactly where the placeholder sits, while dictation waits
   for words; the first word replaces it. Deliberately NOT a real
   microphone meter: opening a second mic stream knocks Android's
   recogniser over, which silently ate Femi's words for an evening.
   A quiet idle sway says "listening" and costs nothing. */
function Wave({ bars = 26, className }: { bars?: number; className?: string }) {
  return (
    <span
      className={cn("flex h-6 items-center gap-[3px]", className)}
      aria-hidden="true"
    >
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className="h-4 w-[3px] origin-center rounded-full bg-ink/30 motion-safe:animate-[wave-idle_1.3s_ease-in-out_infinite]"
          style={{ animationDelay: `${(i % 7) * 0.13}s` }}
        />
      ))}
    </span>
  );
}

const LONG_HAUL =
  "This one needs a proper look. Still on it. The answer lands right here when it's done.";

/* The narration reads the message it is thinking about - how many
   files, photo or PDF - and varies its wording per message (seeded
   by the id, so a reload tells the same story) instead of playing
   one fixed reel every time. */
function thinkScript(m: Message): [string, number][] {
  const n = m.attachments.length;
  const imgs = m.attachments.filter((a) => a.type.startsWith("image/")).length;
  const pdfs = m.attachments.filter((a) => a.type === "application/pdf").length;
  const seed = (s: string) => {
    let x = 5381;
    for (const c of s) x = ((x * 33) ^ c.charCodeAt(0)) >>> 0;
    return x;
  };
  const pick = (stage: number, pool: string[]) =>
    pool[seed(`${m.id}:${stage}`) % pool.length];

  if (n > 0) {
    const what =
      n > 1
        ? `${n} files`
        : imgs === 1
          ? "the image you sent"
          : pdfs === 1
            ? "the PDF"
            : "the file";
    return [
      [
        n === 1
          ? `Got your ${imgs === 1 ? "photo" : "file"}. Opening it…`
          : `Got ${n} files. Opening them…`,
        0,
      ],
      [pick(1, [`Analyzing ${what}…`, `Reading ${what}…`, `Going through ${what}…`]), 2500],
      [
        pick(2, [
          "Pulling out the numbers…",
          "Picking out amounts and dates…",
          "Making sense of the figures…",
        ]),
        6500,
      ],
      [
        pick(3, [
          "Working out where it fits…",
          "Matching it to your categories…",
          "Placing it in your month…",
        ]),
        10500,
      ],
      [pick(4, ["Drafting a reply…", "Writing back…"]), 14000],
      ["Taking longer than usual…", 30000],
      [LONG_HAUL, 120000],
    ];
  }

  return [
    [
      pick(0, ["Reading your message…", "Taking that in…", "Going through what you said…"]),
      0,
    ],
    [
      pick(1, [
        "Working out what to do…",
        "Deciding what this needs…",
        "Checking it against your month…",
      ]),
      2200,
    ],
    [pick(2, ["Drafting a reply…", "Putting an answer together…"]), 8000],
    ["Taking longer than usual…", 30000],
    [LONG_HAUL, 120000],
  ];
}

/* Unresolved positions cycle these while the statement settles in,
   from the beui TextScramble glyph set. */
const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&@$?/";

function ThinkingLine({ message, since }: { message: Message; since: number }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const script = useMemo(() => thinkScript(message), [message.id]);
  const [stage, setStage] = useState(0);
  const [shown, setShown] = useState(script[0][0]);
  const target = script[stage][0];

  /* Scramble toward the current statement: settled characters hold,
     the rest cycle random glyphs, resolving left to right. Timing
     per the reference: length x 32ms clamped to 420-760ms, a frame
     every 40ms. Constant motion runs linear; reduced motion swaps
     the text plainly. */
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(target);
      return;
    }
    const duration = Math.min(760, Math.max(420, target.length * 32));
    const t0 = Date.now();
    const id = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / duration);
      const settled = Math.floor(p * target.length);
      let out = target.slice(0, settled);
      for (let i = settled; i < target.length; i++) {
        out +=
          target[i] === " "
            ? " "
            : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      setShown(out);
      if (p >= 1) window.clearInterval(id);
    }, 40);
    return () => window.clearInterval(id);
  }, [target]);

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
      <span className="thinking-shimmer text-body">{shown}</span>
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
    /* One long session everywhere. The short-session Android
       workaround made the OS play its recognition beep at every
       pause, which read as random clicking; the doubled words it
       dodged are now handled by deduping re-emitted finals in
       lib/transcript.ts instead. */
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-NG";

    /* Rebuilt from the full results list every time, never appended
       to. Android's engine re-emits and grows its entries, so there
       the chunks are overlap-merged; desktop concatenates plainly and
       keeps every word exactly as spoken. See lib/transcript.ts. */
    const merge = /Android/i.test(navigator.userAgent);
    r.onresult = (e) => {
      const { settled, interim } = readResults(e.results, { merge });
      sessionFinal.current = settled;
      cb.current(joinTranscript(carried.current, settled, interim, { merge }));
    };

    r.onend = () => {
      // The results list resets on restart, so bank this session's
      // finals before they disappear.
      if (sessionFinal.current.trim()) {
        carried.current = merge
          ? mergeTranscript(carried.current, sessionFinal.current).trimEnd() + " "
          : (carried.current + sessionFinal.current).trimEnd() + " ";
      }
      sessionFinal.current = "";

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
