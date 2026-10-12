"use client";

/**
 * Be Care Compliant — the outcome letter for a recorded absence meeting (Phil, 2026-09-29, Absence
 * round 2 item 3). Laid out like Book meeting (Phil, 2026-10-12: "the editor next to each other"):
 * the letter's words in the editor on the left, the real PDF on the right, redrawn a second after
 * the words or the signature change, and Approve and send, Save to file or Not now underneath.
 * "Draft the outcome letter" (AI, from the meeting record, saved so it is never paid for twice)
 * fills an empty letter. Nothing goes until Approve and send.
 * Offered straight after Save meeting, and from the meeting on the person's record until sent.
 */

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
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
import SignatureChoice, { type SignatureValue } from "@/components/letters/signature-choice";
import RichLetterEditor from "@/components/letters/rich-letter-editor";

function toBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

type Drawn = { bytes: Uint8Array; url: string; to: string | null; name: string; fileName: string };

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
  /* How the letter is signed (Phil, 2026-10-12): the signer's own saved or drawn signature, or none. */
  const [signature, setSignature] = useState<SignatureValue>({ choice: "none", now: "" });
  const signatureKey = `${signature.choice}:${signature.now.length}`;
  /* THE LETTER AS IT WILL GO (Phil, 2026-10-07, side by side since 2026-10-12): the real PDF of the
     words and signature on screen. Approve and send only once it shows exactly them. */
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const [drawnKey, setDrawnKey] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  /* The PDF did not draw (the absence recheck, 2026-10-08): said, and nothing can be sent from a
     blank box. */
  const [pdfFailed, setPdfFailed] = useState(false);
  /* The letter says nothing beyond the fixed wording (Phil, 2026-10-12, after a Thistle letter was
     saved holding only its opening sentence): told plainly, never sent, and Regenerate redoes it
     at no cost. */
  const [missingOutcome, setMissingOutcome] = useState(false);
  const [draftState, draftAction, drafting] = useActionState(draftOutcomeLetter, IDLE_STATE);
  const [sendState, sendAction, sending] = useActionState(sendOutcomeLetter, IDLE_STATE);
  const [draftPressed, setDraftPressed] = useState(false);
  const regenerating = useRef(false);
  const urlRef = useRef<string | null>(null);
  /* One close, one refresh. The caller's onClose can be a fresh function on every render, and a
     success effect that lists it re-runs on every refresh (DEF-079). Held in a ref instead. */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    setDraftPressed(false);
    const drafted = draftState.data?.body;
    if (!drafted) return;
    if (regenerating.current) {
      // Regenerated: the new letter replaces the one with no outcome.
      regenerating.current = false;
      setBody(drafted);
      setMissingOutcome(false);
    } else setBody((prev) => (prev.trim() ? prev : drafted));
  }, [draftState]);

  useEffect(() => {
    if (!sendState.ok) return;
    router.refresh();
    const t = setTimeout(() => closeRef.current(), 1800);
    return () => clearTimeout(t);
  }, [sendState.ok, router]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const fd = () => {
    const f = new FormData();
    f.set("meeting_id", meetingId);
    f.set("body", body);
    f.set("signature_choice", signature.choice);
    if (signature.choice === "now" && signature.now) f.set("signature_now", signature.now);
    return f;
  };

  function draft() {
    regenerating.current = missingOutcome;
    setDraftPressed(true);
    const f = new FormData();
    f.set("meeting_id", meetingId);
    startTransition(() => draftAction(f));
  }

  // The PDF beside the words: drawn a second after the words or the signature last changed.
  const key = `${body}#${signatureKey}`;
  const hasWords = body.trim() !== "";
  useEffect(() => {
    if (!hasWords) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setDrawing(true);
      setSavedNote(null);
      const result = await outcomeLetterPdfPreview(fd());
      if (cancelled) return;
      setDrawing(false);
      if (result.pdf) {
        const bytes = toBytes(result.pdf);
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setPdfFailed(false);
        setPreviewError(null);
        setMissingOutcome(Boolean(result.missingOutcome));
        setDrawn({
          bytes,
          url,
          to: result.to ?? null,
          name: result.name ?? personName,
          fileName: result.fileName ?? "Outcome letter.pdf",
        });
        setDrawnKey(key);
      } else {
        setPreviewError(result.error ?? "The letter could not be prepared.");
        setDrawnKey(null);
      }
    }, 1000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hasWords]);

  // The PDF on screen is the words and signature as they stand, so what is approved is what goes.
  const current = hasWords && !drawing && drawnKey === key && !previewError && !pdfFailed;

  /** Save to file: the PDF, downloaded, nothing sent. The letter stays a draft on the meeting. */
  async function saveToFile() {
    if (!drawn || !current) return;
    setSaving(true);
    const f = fd();
    f.set("download", "1");
    const result = await outcomeLetterPdfPreview(f); // logs the download
    setSaving(false);
    const bytes = result.pdf ? toBytes(result.pdf) : drawn.bytes;
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = result.fileName ?? drawn.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setSavedNote("Saved to your downloads. The letter has not been sent and stays as a draft on the meeting.");
  }

  const busy = drafting || draftPressed || sending || saving;
  if (!mounted) return null;

  const draftButton = (label: string) => (
    <button type="button" className="btn-outline px-3 py-1.5 text-xs" disabled={busy} onClick={draft}>
      {drafting || draftPressed ? (
        <>
          <span aria-hidden className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Drafting…
        </>
      ) : (
        <>
          <AiIcon />
          {label}
        </>
      )}
    </button>
  );
  const drafting_note =
    drafting || draftPressed ? (
      <p className="mt-2 animate-pulse text-sm text-white/70">Writing the outcome from the meeting record. This takes a few seconds.</p>
    ) : null;
  const hint = "mt-1 text-[10px] text-white/40";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3">
      {/* As wide as two A4 sheets side by side, like Book meeting (Phil, 2026-10-12). */}
      <div className="max-h-[97vh] w-full max-w-[min(95vw,1604px)] overflow-y-auto rounded-2xl border border-white/15 bg-navy-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Outcome letter: {personName}</h2>
            <p className="mt-1 text-xs text-white/50">
              The letter&apos;s words on the left, the letter as it will go on the right. Change the words and the
              letter follows a second later. Nothing is sent until you approve it.
            </p>
          </div>
          <button type="button" className="btn-ghost text-xs" disabled={sending} onClick={onClose}>
            {sendState.ok ? "Close" : "Not now"}
          </button>
        </div>

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

        {hasWords && missingOutcome ? (
          <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-400/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-amber-100">
                This letter is missing what the meeting discussed and decided, so it cannot be sent. Regenerate it
                from the meeting record: there is no charge for this.
              </p>
              {draftButton("Regenerate the letter")}
            </div>
            {drafting_note}
            {draftState.error ? <p className="form-error">{draftState.error}</p> : null}
          </div>
        ) : null}

        {!hasWords ? (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-white/70">
                Draft it from the meeting record. You can change every word before anything is sent, and the draft
                is kept, so opening this again costs nothing.
              </p>
              {draftButton("Draft the outcome letter")}
            </div>
            {drafting_note}
            {draftState.error ? <p className="form-error">{draftState.error}</p> : null}
          </div>
        ) : null}

        {/* The words on the left, the letter on the right (on a phone, the letter underneath). */}
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="flex flex-col">
            <span className="form-label mb-1">The letter</span>
            <div className="h-[68vh] min-h-72 overflow-y-auto rounded-lg border border-white/10 bg-navy-950/40">
              <div className="mx-auto w-full max-w-3xl px-3 pb-4 pt-3 sm:px-4">
                {/* The letter editor (Phil, 2026-10-12, Job 2 Part B), on a sheet the width of the page. */}
                <RichLetterEditor
                  label="The letter"
                  value={body}
                  disabled={busy || !!sendState.ok}
                  onChange={setBody}
                  placeholder="Or write it yourself."
                />
              </div>
            </div>
            <p className={hint}>
              The whole letter between Dear and Yours sincerely: your company&apos;s opening and right of appeal
              (Settings, Letters) with what the meeting covered and decided in the middle. Use the bar above it for
              headings, text size, bold, italic, underline and lists.
            </p>
            <SignatureChoice
              onChange={setSignature}
              disabled={busy || !!sendState.ok}
              className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3"
            />
          </div>

          <div className="flex flex-col">
            <div className="mb-1 flex items-center justify-between">
              <span className="form-label mb-0">The outcome letter</span>
              <span className="text-xs text-white/50">
                {drawing ? "Updating…" : drawn && current ? (
                  <a href={drawn.url} target="_blank" rel="noreferrer" className="underline">
                    Open full size
                  </a>
                ) : null}
              </span>
            </div>
            {drawn && hasWords ? (
              /* Drawn page by page with pdf.js: a PDF in a frame is blocked by the site's no framing
                 rule, and an iPhone shows only page one. */
              <div className="h-[68vh] min-h-72 w-full overflow-y-auto rounded-lg border border-white/10 bg-navy-950/40">
                <PolicyReader
                  key={drawn.url}
                  url={drawn.url}
                  data={drawn.bytes}
                  onRendered={() => setPdfFailed(false)}
                  onFailed={() => setPdfFailed(true)}
                />
              </div>
            ) : (
              <div className="flex h-[68vh] min-h-72 w-full items-center justify-center rounded-lg border border-white/10 p-6 text-center text-sm text-white/50">
                {!hasWords ? "The letter appears here once it has words." : previewError ?? "Preparing the letter…"}
              </div>
            )}
            {drawn && previewError ? <p className="form-error mt-2">{previewError}</p> : null}
            {pdfFailed ? (
              <p className="form-error mt-2">The letter could not be shown. Change a word or close and open it again. Nothing has been sent.</p>
            ) : null}
          </div>
        </div>

        {/* Centred under both. */}
        <div className="mt-5 flex flex-col items-center gap-2 text-center">
          {current && drawn ? (
            <p className="text-xs text-white/60">
              {drawn.to
                ? `Approve and send emails this letter to ${drawn.to} with the PDF attached, and keeps the PDF on the meeting. Once sent it cannot be changed.`
                : `${drawn.name} has no email address, so this letter will not be emailed. Approving keeps it as a PDF on the meeting, marked not emailed, for you to print and hand over.`}
            </p>
          ) : null}
          {sendState.error ? <p className="form-error">{sendState.error}</p> : null}
          {sendState.ok ? <p className="text-sm text-emerald-300">{sendState.ok}</p> : null}
          {savedNote ? <p className="text-sm text-emerald-300">{savedNote}</p> : null}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className="btn-primary text-xs"
              disabled={busy || !current || missingOutcome || !!sendState.ok}
              onClick={() => {
                const f = fd();
                startTransition(() => sendAction(f));
              }}
            >
              {sending ? "Sending…" : drawn?.to === null && current ? "Approve and keep" : "Approve and send"}
            </button>
            <button type="button" className="btn-outline text-xs" disabled={busy || !current || !!sendState.ok} onClick={saveToFile}>
              {saving ? "Saving…" : "Save to file"}
            </button>
            <button type="button" className="btn-ghost text-xs" disabled={sending} onClick={onClose}>
              {sendState.ok ? "Close" : "Not now"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
