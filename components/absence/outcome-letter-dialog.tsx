"use client";

/**
 * Be Care Compliant — the outcome letter for a recorded absence meeting (Phil, 2026-09-29, Absence
 * round 2 item 3). Two steps, like the meeting letters:
 *   1. The outcome in words: "Draft the outcome letter" (AI, from the meeting record, saved so it
 *      is never paid for twice) or written by hand, edited freely.
 *   2. The whole letter as the employee will get it, read only, with the company's fixed wording
 *      around it. Nothing goes until Approve and send; Back keeps the words.
 * Offered straight after Save meeting, and from the meeting on the person's record until sent.
 */

import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IDLE_STATE } from "@/lib/forms";
import {
  draftOutcomeLetter,
  previewOutcomeLetter,
  sendOutcomeLetter,
} from "@/lib/absence/outcome-letter-actions";
import type { LetterPreview } from "@/lib/absence/letter-preview";
import LetterPreviewPanel from "@/components/absence/letter-preview-panel";
import { AiIcon } from "@/components/ai-icon";

type Props = {
  meetingId: string;
  personName: string;
  /** A saved draft (or the approved words of a send that failed), so no second credit is spent. */
  initialBody?: string | null;
};

/** A button that opens the letter, for the meeting on a person's record. */
export function OutcomeLetterButton(props: Props & { label?: string; className?: string }) {
  const [openInstance, setOpenInstance] = useState(0);
  return (
    <>
      <button
        type="button"
        className={props.className ?? "btn-outline px-2.5 py-1 text-[11px]"}
        onClick={() => setOpenInstance((n) => n + 1)}
      >
        {props.label ?? "Outcome letter"}
      </button>
      {openInstance > 0 ? (
        <OutcomeLetterDialog key={openInstance} {...props} onClose={() => setOpenInstance(0)} />
      ) : null}
    </>
  );
}

export default function OutcomeLetterDialog({
  meetingId,
  personName,
  initialBody,
  onClose,
}: Props & { onClose: () => void }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [body, setBody] = useState(initialBody ?? "");
  const [letters, setLetters] = useState<LetterPreview[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, startPreview] = useTransition();
  const [draftState, draftAction, drafting] = useActionState(draftOutcomeLetter, IDLE_STATE);
  const [sendState, sendAction, sending] = useActionState(sendOutcomeLetter, IDLE_STATE);
  const [draftPressed, setDraftPressed] = useState(false);
  /* One close, one refresh. The caller's onClose can be a fresh function on every render, and a
     success effect that lists it re-runs on every refresh (DEF-079). Held in a ref instead. */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    setDraftPressed(false);
    const drafted = draftState.data?.body;
    if (drafted) setBody((prev) => (prev.trim() ? prev : drafted));
  }, [draftState]);

  useEffect(() => {
    if (!sendState.ok) return;
    router.refresh();
    const t = setTimeout(() => closeRef.current(), 1800);
    return () => clearTimeout(t);
  }, [sendState.ok, router]);

  const fd = () => {
    const f = new FormData();
    f.set("meeting_id", meetingId);
    f.set("body", body);
    return f;
  };

  function draft() {
    setDraftPressed(true);
    const f = new FormData();
    f.set("meeting_id", meetingId);
    startTransition(() => draftAction(f));
  }

  function check() {
    setPreviewError(null);
    const f = fd();
    startPreview(async () => {
      const result = await previewOutcomeLetter(f);
      if (result.letters) setLetters(result.letters);
      else setPreviewError(result.error ?? "The letter could not be prepared.");
    });
  }

  const busy = drafting || draftPressed || previewing || sending;
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div
        className={`max-h-[94vh] w-full overflow-y-auto rounded-2xl border border-white/15 bg-navy-900 p-5 shadow-2xl ${
          letters ? "max-w-2xl" : "max-w-xl"
        }`}
      >
        <h2 className="text-sm font-semibold text-white">
          {letters ? "Check the letter" : "Outcome letter"}: {personName}
        </h2>

        {letters ? (
          <LetterPreviewPanel
            letters={letters}
            intro="This is the letter that will go, with a PDF copy that is also kept on the meeting. Once approved it cannot be changed."
            approveLabel="Approve and send"
            workingLabel="Sending…"
            pending={sending}
            error={sendState.error}
            ok={sendState.ok}
            onBack={() => setLetters(null)}
            onApprove={() => {
              const f = fd();
              startTransition(() => sendAction(f));
            }}
            onClose={onClose}
          />
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-white/60">
              The middle of the letter: what the meeting covered and what was decided. Your
              company&apos;s own opening, right of appeal and sign off go around it (Settings,
              Letters).
            </p>
            {!body.trim() ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-white/70">
                    Draft it from the meeting record. You can change every word before anything is
                    sent, and the draft is kept, so opening this again costs nothing.
                  </p>
                  <button type="button" className="btn-outline px-3 py-1.5 text-xs" disabled={busy} onClick={draft}>
                    {drafting || draftPressed ? (
                      <>
                        <span
                          aria-hidden
                          className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                        />
                        Drafting…
                      </>
                    ) : (
                      <>
                        <AiIcon />
                        Draft the outcome letter
                      </>
                    )}
                  </button>
                </div>
                {drafting || draftPressed ? (
                  <p className="mt-2 animate-pulse text-sm text-white/70">
                    Writing the outcome from the meeting record. This takes a few seconds.
                  </p>
                ) : null}
                {draftState.error ? <p className="form-error">{draftState.error}</p> : null}
              </div>
            ) : null}
            <div>
              <label htmlFor={`ol-${meetingId}`} className="form-label">
                The outcome
              </label>
              <textarea
                id={`ol-${meetingId}`}
                rows={12}
                value={body}
                disabled={busy}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Or write it yourself. Leave a blank line between paragraphs."
              />
            </div>
            {previewError ? <p className="form-error">{previewError}</p> : null}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button type="button" className="btn-primary text-xs" disabled={busy || !body.trim()} onClick={check}>
                {previewing ? "Preparing the letter…" : "Check the letter"}
              </button>
              <button type="button" className="btn-ghost text-xs" disabled={busy} onClick={onClose}>
                {sendState.ok ? "Close" : "Not now"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
