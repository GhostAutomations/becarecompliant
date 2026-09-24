"use client";

/**
 * Be Care Compliant — a reusable "complete a Form as Evidence" dialog.
 *
 * Mounts the ONE shared FormRenderer inside a slide-over, validates with the
 * shared validator, and posts answers + files + any extra hidden fields to a
 * Server Action passed in as a prop. Reused by the Holiday/Absence flows
 * (record absence, record meeting, request holiday, decide holiday), each of
 * which stores immutable Evidence through the same pipeline as the check loop.
 *
 * Client-redirect rule: a Server Action must never redirect() to a ?query URL
 * (Next.js #78396 / React #310), so the action returns redirectTo and we
 * router.replace it here.
 *
 * Drafting: a half-written form is kept for twelve hours and handed back, the same
 * as a Check and the On Call Handover. A slide-over has no server render of its own,
 * so the draft is fetched when it OPENS and the form is held back until it lands --
 * otherwise someone could type into a form that is about to be replaced. The key
 * includes the hidden fields, because they are what says WHICH person this dialog was
 * opened about (see lib/forms/draft-key.ts).
 */

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import FormRenderer from "@/components/forms/form-renderer";
import type { Answers, FormSchema } from "@/lib/form-schema";
import { validateAnswers, type FieldError } from "@/lib/form-validate";
import { describeValidationErrors } from "@/lib/forms/validation-message";
import { focusFirstError } from "@/components/forms/focus-first-error";
import { dialogDraftKey, mergeDraft } from "@/lib/forms/draft-key";
import { useFormDraft } from "@/components/forms/use-form-draft";
import {
  IDLE_STATE,
  parseAiQuestions,
  serialiseAiQuestions,
  type ActionState,
  type AiQuestion,
} from "@/lib/forms";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export default function FormEvidenceDialog({
  title,
  schema,
  action,
  extraFields,
  triggerLabel,
  triggerClassName = "btn-primary px-3 py-2 text-sm",
  submitLabel = "Complete and save evidence",
  presetAnswers,
  hideFields,
  aiDraft,
  keepDraft = true,
  onSaved,
  openOnMount = false,
}: {
  title: string;
  schema: FormSchema;
  action: Action;
  extraFields?: Record<string, string>;
  triggerLabel: string;
  triggerClassName?: string;
  submitLabel?: string;
  presetAnswers?: Answers;
  /** Field keys to hide (e.g. name/email when the person is already chosen). */
  hideFields?: string[];
  /** Keep a part-finished copy of this form and hand it back for 12 hours. On by
   *  default; pass false for a dialog that is a decision rather than a form. */
  keepDraft?: boolean;
  /** Called once the action has saved (state.ok), after the dialog closes. Lets a caller offer
   *  a follow up step, e.g. discounting absences straight after a meeting is recorded. */
  onSaved?: (state: ActionState) => void;
  /** Open straight away, e.g. when a dashboard link asked for this form by id. */
  openOnMount?: boolean;
  /** Optional AI assist. The action returns { data } of field key to text, which is
   *  merged into the answers for the user to EDIT before saving. Nothing is stored by
   *  drafting, so a draft they dislike costs a credit and leaves no record.
   *
   *  `questions` opts a form into AI DRAFTED QUESTIONS: the action may return, under
   *  `dataKey`, a JSON array of questions written for this particular record. They are
   *  rendered here as real labelled controls, and the whole set is written into the
   *  ONE existing long_text field named by `answerKey` as readable text on save. They
   *  cannot be schema fields, because the server validates every answer against the
   *  stored published version (see lib/forms.ts). Any form can use this: give it a
   *  long_text field to land in and return the payload. */
  aiDraft?: {
    action: Action;
    label: string;
    hint?: string;
    extraFields?: Record<string, string>;
    questions?: { dataKey: string; answerKey: string };
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (openOnMount) setOpen(true);
  }, [openOnMount]);
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);
  /* WHICH form this is: the title plus the hidden fields the dialog posts. The same
     dialog opened about someone else is a different draft. */
  const held = useFormDraft({
    key: keepDraft ? dialogDraftKey(title, extraFields) : null,
    active: open,
  });
  const [answers, setAnswers] = useState<Answers>(presetAnswers ?? {});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [missing, setMissing] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Bumped when an AI draft lands, to remount the renderer on the new defaults.
  const [formKey, setFormKey] = useState(0);
  const [draftDefaults, setDraftDefaults] = useState<Answers | undefined>(undefined);
  // Our OWN drafting flag, set the instant the button is pressed. Phil pressed Draft it
  // for me three times because nothing appeared to happen, and each press spends an AI
  // credit, so we cannot rely on the action's own pending flag reaching the button in
  // time. This one is set synchronously in the click handler and cleared when a result
  // arrives, so the label and the disabled state are never late.
  const [drafting, setDrafting] = useState(false);
  // AI drafted questions and the answers being typed into them, held by index.
  const [aiQuestions, setAiQuestions] = useState<AiQuestion[]>([]);
  const [aiAnswers, setAiAnswers] = useState<string[]>([]);

  // Drop hidden fields from what we render and validate. The server still
  // validates against the full published version, so only omit optional fields.
  // Once AI drafted questions are on screen, the long_text they serialise into is
  // hidden too: it is filled from those controls on save, and showing both would give
  // the user two places to type the same thing and a box that fights back.
  const hidden = new Set(hideFields ?? []);
  if (aiQuestions.length > 0 && aiDraft?.questions) hidden.add(aiDraft.questions.answerKey);
  const effectiveSchema: FormSchema =
    hidden.size > 0
      ? {
          ...schema,
          sections: schema.sections.map((s) => ({
            ...s,
            fields: s.fields.filter((f) => !hidden.has(f.key)),
          })),
        }
      : schema;
  const [draftState, draftAction, draftPending] = useActionState(
    aiDraft?.action ?? (async () => IDLE_STATE),
    IDLE_STATE,
  );

  useEffect(() => {
    // Any result at all, success or error, ends the drafting state.
    if (draftState.data || draftState.error || draftState.ok) setDrafting(false);
    if (!draftState.data) return;
    const incoming: Record<string, string> = { ...draftState.data };
    // Pull the questions payload OUT before the rest is merged: it is not an answer to
    // any field, and everything left in `incoming` is keyed by a real field key.
    const dataKey = aiDraft?.questions?.dataKey;
    const asked = dataKey ? parseAiQuestions(incoming[dataKey] ?? "") : [];
    if (dataKey) delete incoming[dataKey];
    setAiQuestions(asked);
    setAiAnswers(asked.map(() => ""));
    const merged = { ...answers, ...incoming } as Answers;
    setAnswers(merged);
    setDraftDefaults(merged);
    setFormKey((k) => k + 1);
  }, [draftState]);

  useEffect(() => {
    setSubmitting(false);
  }, [state]);

  // A draft has landed: the renderer is remounted on it by its key, and the answers we
  // will submit have to be brought up to the same place.
  useEffect(() => {
    if (held.restored) setAnswers((prev) => ({ ...prev, ...held.restored }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held.restored]);

  useEffect(() => {
    // Filed: the part-finished copy has done its job.
    if (state.ok || state.redirectTo) held.discard();
    if (state.redirectTo) router.replace(state.redirectTo);
    else if (state.ok && open) {
      setOpen(false);
      router.refresh();
      onSaved?.(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  /** Record one answer to an AI drafted question. Held separately from `answers` and
   *  folded in only when the form is submitted: FormRenderer owns the `answers` object
   *  and reports the whole thing back on every keystroke, so a value written into it
   *  from out here would be at the mercy of the next field the user touched. */
  function setAiAnswer(index: number, value: string) {
    setAiAnswers((prev) => {
      const next = prev.slice();
      next[index] = value;
      return next;
    });
  }

  /** The answers as they will be saved: what the form holds, plus the AI drafted
   *  questions and their answers serialised into their one long_text field. */
  function answersToSave(): Answers {
    const key = aiDraft?.questions?.answerKey;
    if (!key || aiQuestions.length === 0) return answers;
    return { ...answers, [key]: serialiseAiQuestions(aiQuestions, aiAnswers) };
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload = answersToSave();
    const result = validateAnswers(effectiveSchema, payload);
    if (!result.ok) {
      setErrors(result.errors);
      /* Say what is missing and TAKE THEM TO IT. The per-field message alone sits
         wherever the field is, which on a forty question form is nowhere near the
         button they just pressed, so the button reads as broken. */
      setMissing(describeValidationErrors(effectiveSchema, result.errors));
      focusFirstError(result.errors);
      return;
    }
    setErrors([]);
    setMissing(null);
    setSubmitting(true);
    const fd = new FormData();
    fd.set("answers", JSON.stringify(payload));
    for (const [k, v] of Object.entries(extraFields ?? {})) fd.set(k, v);
    for (const [key, file] of Object.entries(files)) {
      if (file) fd.append(`file:${key}`, file);
    }
    setTimeout(() => formAction(fd), 0);
  }

  const busy = submitting || pending || !!state.redirectTo;

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-2xl border border-white/10 bg-navy-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <button
                type="button"
                className="btn-ghost px-3 py-1.5 text-sm"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Close
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-6">
              {aiDraft ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-white/70">{aiDraft.hint}</p>
                    <button
                      type="button"
                      className="btn-outline px-3 py-1.5 text-xs"
                      disabled={busy || draftPending || drafting}
                      onClick={() => {
                        setDrafting(true);
                        const fd = new FormData();
                        for (const [k, v] of Object.entries(aiDraft.extraFields ?? extraFields ?? {})) {
                          fd.set(k, v);
                        }
                        setTimeout(() => draftAction(fd), 0);
                      }}
                    >
                      {draftPending || drafting ? (
                        <>
                          <span
                            aria-hidden
                            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                          />
                          Drafting…
                        </>
                      ) : (
                        aiDraft.label
                      )}
                    </button>
                  </div>
                  {draftPending || drafting ? (
                    <p className="mt-2 animate-pulse text-sm text-white/70">
                      Writing questions for this absence. This takes a few seconds.
                    </p>
                  ) : null}
                  {draftState.error ? <p className="form-error">{draftState.error}</p> : null}
                </div>
              ) : null}

              {/* AI drafted questions, written for THIS record. Rendered as real
                  labelled controls so they are as clear to complete as fixed fields,
                  then serialised into one long_text answer on save. */}
              {aiDraft?.questions && aiQuestions.length > 0 ? (
                <section className="section-card p-5">
                  <div className="mb-4">
                    <h3 className="text-base font-semibold text-white">Questions to ask</h3>
                    <p className="page-subtitle mt-1">
                      Written from this record, so they are not the same every time. Ask them in
                      your own words and record what you are told. Your answers are saved with
                      the form.
                    </p>
                  </div>
                  <div className="flex flex-col gap-5">
                    {aiQuestions.map((q, i) => (
                      <div key={`ai-q-${i}`} className="flex flex-col gap-1.5">
                        <label htmlFor={`ai-q-${i}`} className="form-label">
                          {q.question}
                        </label>
                        {q.type === "yes_no" ? (
                          <div className="mt-1 flex gap-2">
                            {["Yes", "No"].map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                disabled={busy}
                                onClick={() => setAiAnswer(i, opt)}
                                className={`rounded-xl px-4 py-2 text-sm font-medium ${
                                  aiAnswers[i] === opt
                                    ? "bg-gold-400/20 text-white"
                                    : "bg-white/5 text-white/60"
                                }`}
                                aria-pressed={aiAnswers[i] === opt}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        ) : q.type === "choice" ? (
                          <select
                            id={`ai-q-${i}`}
                            value={aiAnswers[i] ?? ""}
                            disabled={busy}
                            onChange={(e) => setAiAnswer(i, e.target.value)}
                          >
                            <option value="">Please choose</option>
                            {(q.options ?? []).map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <textarea
                            id={`ai-q-${i}`}
                            rows={2}
                            value={aiAnswers[i] ?? ""}
                            disabled={busy}
                            onChange={(e) => setAiAnswer(i, e.target.value)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {held.ready ? (
                <FormRenderer
                  key={`${formKey}:${held.version}`}
                  schema={effectiveSchema}
                  defaultValue={draftDefaults ?? mergeDraft(presetAnswers, held.restored ?? undefined)}
                  errors={errors}
                  onChange={(next) => {
                    setAnswers(next);
                    held.record(next);
                  }}
                  onFileSelect={(key, file) =>
                    setFiles((prev) => ({ ...prev, [key]: file }))
                  }
                />
              ) : (
                <p className="text-sm text-white/50">Opening…</p>
              )}

              {missing ? <p className="form-error">{missing}</p> : null}
      {state.error ? <p className="form-error">{state.error}</p> : null}

              <div className="flex items-center gap-3">
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? "Saving…" : submitLabel}
                </button>
                <button
                  type="button"
                  className="btn-ghost px-3 py-2 text-sm"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
              {keepDraft ? (
                <p className="text-xs text-white/40">
                  This saves as you go and waits for you for up to 12 hours, so you can close it
                  and come back. Any file you attach has to be chosen again.
                </p>
              ) : null}
            </form>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
