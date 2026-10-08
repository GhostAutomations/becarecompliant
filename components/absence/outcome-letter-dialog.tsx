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
  outcomeLetterPdfPreview,
  sendOutcomeLetter,
} from "@/lib/absence/outcome-letter-actions";
import { AiIcon } from "@/components/ai-icon";
import PolicyReader from "@/components/staff/policy-reader";

function toBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

type FinalLook = { bytes: Uint8Array; to: string | null; name: string; fileName: string };

type Props = {
  meetingId: string;
  personName: string;
  /** A saved draft (or the approved words of a send that failed), so no second credit is spent. */
  initialBody?: string | null;
  /** After a dismissal (Phil, 2026-10-08): the leaver form on their record, with the date set. */
  leaverHref?: string | null;
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
  leaverHref,
  onClose,
}: Props & { onClose: () => void }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [body, setBody] = useState(initialBody ?? "");
  /* THE FINAL LOOK (Phil, 2026-10-07): the real PDF, then Approve and send, Save to file, or Return
     and edit. A letter already written and checked in the meeting form opens straight on it. */
  const [finalLook, setFinalLook] = useState<FinalLook | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
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
    setSavedNote(null);
    const f = fd();
    startPreview(async () => {
      const result = await outcomeLetterPdfPreview(f);
      if (result.pdf) {
        setFinalLook({
          bytes: toBytes(result.pdf),
          to: result.to ?? null,
          name: result.name ?? personName,
          fileName: result.fileName ?? "Outcome letter.pdf",
        });
      } else setPreviewError(result.error ?? "The letter could not be prepared.");
    });
  }

  // Opened on a letter written in the meeting form: straight to the final look.
  const openedOnFinal = useRef(false);
  useEffect(() => {
    if (openedOnFinal.current || !initialBody?.trim()) return;
    openedOnFinal.current = true;
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Save to file: the PDF, downloaded, nothing sent. The letter stays a draft on the meeting. */
  async function saveToFile() {
    if (!finalLook) return;
    setSaving(true);
    const f = fd();
    f.set("download", "1");
    const result = await outcomeLetterPdfPreview(f); // logs the download
    setSaving(false);
    const bytes = result.pdf ? toBytes(result.pdf) : finalLook.bytes;
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = result.fileName ?? finalLook.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setSavedNote("Saved to your downloads. The letter has not been sent and stays as a draft on the meeting.");
  }

  const busy = drafting || draftPressed || previewing || sending || saving;
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div
        className={`max-h-[94vh] w-full overflow-y-auto rounded-2xl border border-white/15 bg-navy-900 p-5 shadow-2xl ${
          finalLook ? "max-w-3xl" : "max-w-xl"
        }`}
      >
        <h2 className="text-sm font-semibold text-white">
          {finalLook ? "Check the letter" : "Outcome letter"}: {personName}
        </h2>

        {/* A dismissal was recorded: one press to the leaver form, the leaving date already the
            last day of employment. Nothing changes until it is saved there (Phil, 2026-10-08). */}
        {leaverHref ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-xs text-white/70">This meeting ended in dismissal. When you are ready, make them a leaver.</p>
            <a href={leaverHref} className="btn-outline px-3 py-1.5 text-xs">
              Make them a leaver
            </a>
          </div>
        ) : null}

        {finalLook ? (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-white/60">
              {finalLook.to
                ? `This is the letter as it will go. Approve and send emails it to ${finalLook.to} with this PDF attached, and keeps the PDF on the meeting. Once sent it cannot be changed.`
                : `${finalLook.name} has no email address, so this letter will not be emailed. Approving keeps it as a PDF on the meeting, marked not emailed, for you to print and hand over.`}
            </p>
            <div className="h-[60vh] w-full overflow-y-auto rounded-lg border border-white/10 bg-navy-950/40">
              <PolicyReader url="" data={finalLook.bytes} onRendered={() => {}} onFailed={() => {}} />
            </div>
            {sendState.error ? <p className="form-error">{sendState.error}</p> : null}
            {sendState.ok ? <p className="text-sm text-emerald-300">{sendState.ok}</p> : null}
            {savedNote ? <p className="text-sm text-emerald-300">{savedNote}</p> : null}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                className="btn-primary text-xs"
                disabled={busy || !!sendState.ok}
                onClick={() => {
                  const f = fd();
                  startTransition(() => sendAction(f));
                }}
              >
                {sending ? "Sending…" : finalLook.to ? "Approve and send" : "Approve and keep"}
              </button>
              <button type="button" className="btn-outline text-xs" disabled={busy || !!sendState.ok} onClick={saveToFile}>
                {saving ? "Saving…" : "Save to file"}
              </button>
              <button
                type="button"
                className="btn-outline text-xs"
                disabled={busy || !!sendState.ok}
                onClick={() => {
                  setFinalLook(null);
                  setSavedNote(null);
                }}
              >
                Return and edit
              </button>
              <button type="button" className="btn-ghost ml-auto text-xs" disabled={sending} onClick={onClose}>
                {sendState.ok ? "Close" : "Not now"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-white/60">
              The whole letter between Dear and Yours sincerely: your company&apos;s opening and
              right of appeal (Settings, Letters) with what the meeting covered and decided in the
              middle. The letterhead, address, Dear and sign off are added as the letter is laid out.
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
                The letter
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
