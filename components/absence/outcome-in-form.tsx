"use client";

/**
 * Be Care Compliant — Generate outcome inside the absence meeting form (Phil, 2026-10-07).
 *
 * Once the manager has filled in the meeting, Generate outcome at the bottom of the form writes the
 * outcome letter from what is on screen. The words show on the left to edit (a blank line between
 * paragraphs, Enter for extra space), and the real PDF of the whole letter on the right (drawn with
 * pdf.js), redrawn a
 * second after they stop typing. On a phone the PDF sits under the words.
 *
 * Nothing is saved here. The words go with Save meeting as the meeting's draft letter, and the
 * existing Check the letter, then Approve and send, follows.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Answers } from "@/lib/form-schema";
import { draftOutcomeFromForm, previewOutcomePdfFromForm } from "@/lib/absence/outcome-letter-actions";
import { AiIcon } from "@/components/ai-icon";
import PolicyReader from "@/components/staff/policy-reader";

type Ctx = {
  answers: Answers;
  busy: boolean;
  extras: Record<string, string>;
  setExtra: (key: string, value: string) => void;
  setWide: (wide: boolean) => void;
};

/** The answers the letter's wording depends on, so the PDF redraws when one of them changes. */
const LETTER_KEYS = ["meeting_type", "date_of_meeting", "manager_conducting"];

function toBlobUrl(base64: string): string {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

export default function OutcomeInForm({
  personId,
  meetingId,
  ctx,
}: {
  personId: string;
  /** The booking this form records, if any: the letter takes its time and place. */
  meetingId: string | null;
  ctx: Ctx;
}) {
  const { answers, busy, extras, setExtra, setWide } = ctx;
  const [body, setBody] = useState(extras.outcome_body ?? "");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const urlRef = useRef<string | null>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const extrasRef = useRef(extras);
  extrasRef.current = extras;
  const hasLetter = body.trim() !== "";

  // The words go with Save meeting, and stay while the box is closed and opened again.
  useEffect(() => setExtra("outcome_body", body), [body, setExtra]);
  useEffect(() => setWide(hasLetter), [hasLetter, setWide]);

  const letterSig = useMemo(
    () => LETTER_KEYS.map((k) => (typeof answers[k] === "string" ? answers[k] : "")).join("|"),
    [answers],
  );

  function formData(): FormData {
    const f = new FormData();
    f.set("person_id", personId);
    if (meetingId) f.set("meeting_id", meetingId);
    f.set("answers", JSON.stringify(answersRef.current));
    // The absences ticked above as not counting, so the letter can say so.
    if (extrasRef.current.discount_note) f.set("discount_note", extrasRef.current.discount_note);
    return f;
  }

  // Redraw the PDF a second after the typing stops (Phil, 2026-10-07).
  useEffect(() => {
    if (!hasLetter) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setDrawing(true);
      const f = formData();
      f.set("body", body);
      const res = await previewOutcomePdfFromForm(f);
      if (cancelled) return;
      setDrawing(false);
      if (res.pdf) {
        const url = toBlobUrl(res.pdf);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setPdfUrl(url);
        setPdfError(null);
      } else {
        setPdfError(res.error ?? "The preview could not be made.");
      }
    }, 1000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, letterSig, hasLetter]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  async function generate() {
    setDraftError(null);
    setDrafting(true);
    const res = await draftOutcomeFromForm(formData());
    setDrafting(false);
    if (res.body) setBody(res.body);
    else setDraftError(res.error ?? "The outcome could not be generated.");
  }

  const generateButton = (label: string) => (
    <button type="button" className="btn-outline px-3 py-1.5 text-xs" disabled={busy || drafting} onClick={generate}>
      {drafting ? (
        <>
          <span
            aria-hidden
            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          Generating…
        </>
      ) : (
        <>
          <AiIcon />
          {label}
        </>
      )}
    </button>
  );

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h3 className="text-sm font-semibold text-white">Outcome letter</h3>
      {!hasLetter ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-white/70">
            Once the meeting is filled in, generate the outcome letter from it. You can change every
            word and see the letter as a PDF before you save. Nothing is sent until you approve it.
          </p>
          {generateButton("Generate outcome")}
        </div>
      ) : (
        <>
          <p className="mt-1 text-xs text-white/60">
            Edit the outcome on the left. Leave a blank line between paragraphs, or press Enter for
            more space. The PDF on the right is the whole letter and updates as you type. It is kept
            with the meeting when you save, then you check it and send it.
          </p>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <div>
              <label htmlFor={`oif-${personId}`} className="form-label">
                The outcome
              </label>
              <textarea
                id={`oif-${personId}`}
                rows={18}
                value={body}
                disabled={busy}
                onChange={(e) => setBody(e.target.value)}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {generateButton("Generate again")}
                <span className="text-xs text-white/40">Generating again uses another AI credit and replaces the words.</span>
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="form-label">The letter as a PDF</span>
                <span className="text-xs text-white/50">
                  {drawing ? "Updating…" : pdfUrl ? (
                    <a href={pdfUrl} target="_blank" rel="noreferrer" className="underline">
                      Open full size
                    </a>
                  ) : null}
                </span>
              </div>
              {pdfUrl ? (
                /* Drawn page by page with pdf.js, the same reader policies use: a PDF in a frame is
                   blocked by the site's no framing rule, and an iPhone only shows its first page. */
                <div className="h-[560px] w-full overflow-y-auto rounded-lg border border-white/10 bg-navy-950/40">
                  <PolicyReader key={pdfUrl} url={pdfUrl} onRendered={() => {}} onFailed={() => {}} />
                </div>
              ) : (
                <div className="flex h-[560px] w-full items-center justify-center rounded-lg border border-white/10 text-sm text-white/50">
                  {pdfError ?? "Preparing the letter…"}
                </div>
              )}
              {pdfUrl && pdfError ? <p className="form-error">{pdfError}</p> : null}
            </div>
          </div>
        </>
      )}
      {draftError ? <p className="form-error">{draftError}</p> : null}
    </section>
  );
}
