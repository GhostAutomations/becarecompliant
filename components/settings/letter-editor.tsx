"use client";

/**
 * One letter's editor: subject, wording, a palette of placeholders that insert at the
 * cursor, and a live preview with example values so an Admin can see what an employee
 * will actually receive before saving. The preview uses the same pure merge the sender
 * uses, so what is shown is what goes out.
 */

import { useMemo, useRef, useState } from "react";
import ActionForm from "@/components/action-form";
import {
  LETTER_PLACEHOLDERS,
  mergeLetterText,
  type LetterDefinition,
} from "@/lib/letters/letters";
import type { ActionState } from "@/lib/forms";

type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const EXAMPLE: Record<string, string> = Object.fromEntries(
  LETTER_PLACEHOLDERS.map((p) => [p.token, p.example]),
);

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
  const hasSubject = def.key !== "absence_meeting_rearranged";
  const [subject, setSubject] = useState(letter.subject);
  const [body, setBody] = useState(letter.body);
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const preview = useMemo(
    () =>
      mergeLetterText(body, EXAMPLE)
        .split(/\n\s*\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    [body],
  );
  const previewSubject = useMemo(() => mergeLetterText(subject, EXAMPLE), [subject]);

  /** Drop a placeholder in at the cursor rather than making them type the braces. */
  function insert(token: string) {
    const el = bodyRef.current;
    const chunk = `{{${token}}}`;
    if (!el) {
      setBody((b) => `${b}${chunk}`);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = `${body.slice(0, start)}${chunk}${body.slice(end)}`;
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + chunk.length;
      el.setSelectionRange(caret, caret);
    });
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
          <ActionForm action={save} hidden={{ letter_key: letter.key }} label="Save">
            {hasSubject ? (
              <div>
                <label htmlFor={`${letter.key}-subject`} className="form-label">
                  Subject line
                </label>
                <input
                  id={`${letter.key}-subject`}
                  name="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
            ) : (
              <input type="hidden" name="subject" value="" />
            )}

            <div>
              <label htmlFor={`${letter.key}-body`} className="form-label">
                Wording
              </label>
              <textarea
                id={`${letter.key}-body`}
                name="body"
                ref={bodyRef}
                value={body}
                rows={9}
                onChange={(e) => setBody(e.target.value)}
              />
              <p className="form-hint">
                Leave a blank line between paragraphs. Write plain wording, not HTML.
              </p>
            </div>

            <div>
              <p className="form-label">Insert a detail</p>
              <div className="flex flex-wrap gap-1.5">
                {LETTER_PLACEHOLDERS.map((ph) => (
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
          </ActionForm>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/40">
              Preview with example details
            </p>
            {hasSubject ? (
              <p className="mt-2 text-sm font-semibold text-white">{previewSubject}</p>
            ) : null}
            <div className="mt-2 space-y-2">
              {preview.length > 0 ? (
                preview.map((para, i) => (
                  <p key={i} className="text-sm text-white/75">
                    {para}
                  </p>
                ))
              ) : (
                <p className="text-sm text-white/40">Nothing to preview yet.</p>
              )}
            </div>
            {def.systemNote ? (
              <p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/45">
                {def.systemNote}
              </p>
            ) : null}
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
