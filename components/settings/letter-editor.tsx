"use client";

/**
 * One letter's editor: subject, wording, a palette of placeholders that insert at the
 * cursor, and a live preview with example values so an Admin can see what an employee
 * will actually receive before saving. The preview uses the same pure merge the sender
 * uses, so what is shown is what goes out.
 *
 * SAVE IS NOT AN ActionForm, and it cannot be (Phil, 2026-09-09, found on the funding options
 * next door). ActionForm submits through <form action={...}>, and React 19 resets a form's
 * fields once its action resolves. Subject and Wording are controlled by state here — they have
 * to be, the live preview reads them — so the reset emptied both boxes on screen the moment
 * Save turned green, while the letter itself saved perfectly. It looked exactly like pressing
 * Save had wiped the letter. A transition and an ordinary button instead: nothing to reset.
 *
 * "Use the standard wording" below stays on ActionForm: it has no fields to lose, and it wants
 * ActionForm's confirmation dialog.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import ActionForm from "@/components/action-form";
import { useSavedFlash } from "@/lib/use-saved-flash";
import {
  mergeLetterText,
  placeholdersFor,
  renderLetterHtml,
  type LetterDefinition,
} from "@/lib/letters/letters";
import type { ActionState } from "@/lib/forms";
import RichLetterEditor, { type RichLetterEditorHandle } from "@/components/letters/rich-letter-editor";
import PolicyReader from "@/components/staff/policy-reader";
import { previewLetterTemplatePdf } from "@/lib/letters/actions";

/** The two templates that become PDF letters: their preview is the letter as a PDF. */
const PDF_TEMPLATES = new Set(["absence_meeting_invite_employee", "absence_meeting_outcome"]);

function toBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;


export default function LetterEditor({
  letter,
  save,
  reset,
}: {
  letter: {
    key: string;
    subject: string;
    body: string;
    customised: boolean;
    updatedAt: string | null;
    definition: LetterDefinition;
  };
  save: ServerAction;
  reset: ServerAction;
}) {
  const def = letter.definition;
  // The common details plus any this letter has of its own (the outcome letter's drafted middle).
  const placeholders = placeholdersFor(def);
  const EXAMPLE: Record<string, string> = Object.fromEntries(placeholders.map((p) => [p.token, p.example]));
  const hasSubject = def.key !== "absence_meeting_rearranged";
  const [subject, setSubject] = useState(letter.subject);
  const [body, setBody] = useState(letter.body);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [saved, flash, resetFlash] = useSavedFlash();
  const [error, setError] = useState<string | null>(null);

  /* FOLLOW THE LETTER WHEN THE SERVER CHANGES IT UNDER US (found in Chrome, 2026-09-09).
     "Use the standard wording" writes the standard text and revalidates, so the page
     re-renders with the new letter — but useState only reads its initial value once, so the
     boxes and the preview carried on showing the wording that had just been thrown away,
     while the heading above said "Standard wording". A screen disagreeing with itself.

     React's documented way to reset state when a prop changes: compare against what we last
     took from the props, and adjust during render rather than in an effect (an effect renders
     the stale text first, then flips it). It only fires when the SERVER's copy moves, so it
     never eats what somebody is part way through typing. */
  const [loaded, setLoaded] = useState({ subject: letter.subject, body: letter.body });
  if (loaded.subject !== letter.subject || loaded.body !== letter.body) {
    setLoaded({ subject: letter.subject, body: letter.body });
    setSubject(letter.subject);
    setBody(letter.body);
  }
  const editorRef = useRef<RichLetterEditorHandle | null>(null);
  const isPdf = PDF_TEMPLATES.has(def.key);

  /* An email's wording, previewed as the email shows it: only the formatting a letter allows, all
     text escaped (renderLetterHtml), so it is safe to draw. */
  const preview = useMemo(() => renderLetterHtml(body, EXAMPLE), [body]);
  const previewSubject = useMemo(() => mergeLetterText(subject, EXAMPLE), [subject]);

  /* A letter's wording, previewed as the PDF (Phil, 2026-10-12, Job 2 Part B): redrawn a second
     after the last change, with example details and this company's letterhead. */
  const [pdf, setPdf] = useState<Uint8Array | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  useEffect(() => {
    if (!open || !isPdf) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const fd = new FormData();
      fd.set("letter_key", letter.key);
      fd.set("body", body);
      setDrawing(true);
      const res = await previewLetterTemplatePdf(fd);
      if (cancelled) return;
      setDrawing(false);
      if (res.pdf) {
        setPdf(toBytes(res.pdf));
        setPdfError(null);
      } else setPdfError(res.error ?? "The letter could not be drawn.");
    }, 1000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [body, open, isPdf, letter.key]);

  function saveLetter() {
    const fd = new FormData();
    fd.set("letter_key", letter.key);
    fd.set("subject", hasSubject ? subject : "");
    fd.set("body", body);
    startTransition(async () => {
      const result = await save({}, fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      flash();
    });
  }

  /** Drop a placeholder in at the cursor rather than making them type the braces. */
  function insert(token: string) {
    const chunk = `{{${token}}}`;
    if (editorRef.current) editorRef.current.insertText(chunk);
    else setBody((b) => `${b}${chunk}`);
  }

  return (
    <section className="glass-card p-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-4 text-left"
      >
        <span className="min-w-0">
          <span className="block text-base font-semibold text-white">{def.name}</span>
          <span className="mt-1 block text-sm text-white/60">{def.description}</span>
          <span className="mt-1 block text-xs text-white/40">Goes to: {def.sentTo}</span>
        </span>
        <span className="shrink-0 text-xs text-white/50">
          {letter.customised ? "Your wording" : "Standard wording"} · {open ? "Close" : "Edit"}
        </span>
      </button>

      {open ? (
        <div className="mt-5 space-y-5 border-t border-white/10 pt-5">
          {/* The wording on the left, the letter on the right (on a phone, underneath). */}
          <div className="grid gap-5 lg:grid-cols-2">
          <div className="min-w-0 space-y-2">
            {hasSubject ? (
              <div>
                <label htmlFor={`${letter.key}-subject`} className="form-label">
                  Subject line
                </label>
                <input
                  id={`${letter.key}-subject`}
                  value={subject}
                  disabled={pending}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    resetFlash();
                    setError(null);
                  }}
                />
              </div>
            ) : null}

            <div>
              <span className="form-label">Wording</span>
              {/* The letter editor (Phil, 2026-10-12, Job 2 Part B): formatting set here carries into
                  every letter made from this wording. */}
              <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-white/10 bg-navy-950/40 p-3">
                <RichLetterEditor
                  ref={editorRef}
                  label="Wording"
                  value={body}
                  disabled={pending}
                  onChange={(html) => {
                    setBody(html);
                    resetFlash();
                    setError(null);
                  }}
                />
              </div>
              <p className="form-hint">
                Use the bar above the wording for headings, text size, bold, italic, underline and lists.
              </p>
            </div>

            <div>
              <p className="form-label">Insert a detail</p>
              <div className="flex flex-wrap gap-1.5">
                {placeholders.map((ph) => (
                  <button
                    key={ph.token}
                    type="button"
                    onClick={() => insert(ph.token)}
                    title={ph.label}
                    className="btn-ghost text-[11px]"
                  >
                    {ph.label}
                  </button>
                ))}
              </div>
              <p className="form-hint">
                These are filled in when the letter is sent. Anything we do not recognise is left
                exactly as you typed it, so a mistake shows up in the preview rather than
                disappearing from the letter.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveLetter}
                disabled={pending}
                className={saved ? "btn-saved text-xs" : "btn-primary text-xs"}
              >
                {pending ? "Saving…" : saved ? "Saved" : "Save"}
              </button>
              {error ? <span className="text-xs text-red-300">{error}</span> : null}
            </div>
          </div>

          <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/40">
                {isPdf ? "The letter as a PDF, with example details" : "Preview with example details"}
              </p>
              {isPdf && drawing ? <span className="text-xs text-white/50">Updating…</span> : null}
            </div>
            {hasSubject ? (
              <p className="mt-2 text-sm font-semibold text-white">{previewSubject}</p>
            ) : null}
            {isPdf ? (
              pdf ? (
                <div className="mt-2 h-[70vh] w-full overflow-y-auto rounded-lg border border-white/10 bg-navy-950/40">
                  <PolicyReader url="" data={pdf} onRendered={() => {}} onFailed={() => setPdfError("The letter could not be shown.")} />
                </div>
              ) : (
                <p className="mt-2 text-sm text-white/50">{pdfError ?? "Preparing the letter…"}</p>
              )
            ) : preview ? (
              // eslint-disable-next-line react/no-danger
              <div className="mt-2 text-sm text-white/80" dangerouslySetInnerHTML={{ __html: preview }} />
            ) : (
              <p className="mt-2 text-sm text-white/40">Nothing to preview yet.</p>
            )}
            {isPdf && pdf && pdfError ? <p className="form-error mt-2">{pdfError}</p> : null}
            {def.systemNote ? (
              <p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/45">
                {def.systemNote}
              </p>
            ) : null}
          </div>
          </div>

          {letter.customised ? (
            <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
              <p className="text-xs text-white/45">
                Edited {letter.updatedAt ? new Date(letter.updatedAt).toLocaleDateString("en-GB") : ""}.
                Previous wording is kept.
              </p>
              <ActionForm
                action={reset}
                hidden={{ letter_key: letter.key }}
                label="Use the standard wording"
                savedLabel="Reset"
                buttonClassName="btn-ghost text-xs"
                confirm="Put this letter back to the standard wording? Your version is kept in the history."
                className=""
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
