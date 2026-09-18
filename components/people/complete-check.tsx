"use client";

/**
 * Be Care Compliant — complete a Check (Phase 3). Wraps the ONE shared Form
 * renderer, validates with the shared validator, and submits through the
 * completeCheck action, which stores Evidence and advances the Check. Files are
 * sent as `file:<key>`; signatures travel inside the answers.
 *
 * Interrupted halfway through, this form is not lost: every answer is kept as a
 * draft against the person filling it in and handed back for twelve hours (see
 * lib/forms/draft-key.ts). The draft is read on the SERVER and passed in, so the
 * form opens already filled in. completeCheck throws it away when the Evidence is
 * filed -- not when the form is submitted, so a submit that comes back with an
 * error still has everything they typed.
 */

import { useEffect, useState } from "react";
import FormRenderer from "@/components/forms/form-renderer";
import type { Answers, FormSchema } from "@/lib/form-schema";
import type { LookupChoice } from "@/lib/forms/lookup";
import { validateAnswers, type FieldError } from "@/lib/form-validate";
import { describeValidationErrors } from "@/lib/forms/validation-message";
import { focusFirstError } from "@/components/forms/focus-first-error";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { completeCheck } from "@/lib/people/actions";
import { checkDraftKey, mergeDraft } from "@/lib/forms/draft-key";
import { useFormDraft } from "@/components/forms/use-form-draft";
import { IDLE_STATE } from "@/lib/forms";

export default function CompleteCheck({
  schema,
  instanceId,
  presetAnswers,
  lookupChoices,
  draft,
}: {
  schema: FormSchema;
  instanceId: string;
  /** What this user had already typed into this check, read on the server. Omit the
   *  prop entirely to turn drafting off. */
  draft?: Answers | null;
  /** Records a record_lookup field may pick from, read server side under RLS. */
  lookupChoices?: Partial<Record<string, LookupChoice[]>>;
  /** Answers supplied outside the form (e.g. the supervision number from the button
   *  clicked), seeded into the form so they are submitted and validated. */
  presetAnswers?: Answers;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(completeCheck, IDLE_STATE);
  const drafting = useFormDraft({
    key: draft === undefined ? null : checkDraftKey("people", instanceId),
    initial: draft ?? null,
  });
  const opening = mergeDraft(presetAnswers, drafting.restored ?? undefined);
  const [answers, setAnswers] = useState<Answers>(opening ?? {});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [missing, setMissing] = useState<string | null>(null);
  // Immediate feedback: flip the button to "Saving…" the moment it is clicked, before
  // the (heavier) dispatch runs. Cleared whenever the action settles (error/redirect).
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    setSubmitting(false);
  }, [state]);

  // Redirect client-side once the action reports success (see ActionState.redirectTo).
  useEffect(() => {
    if (state.redirectTo) router.replace(state.redirectTo);
  }, [state.redirectTo, router]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = validateAnswers(schema, answers);
    if (!result.ok) {
      setErrors(result.errors);
      /* Say what is missing and TAKE THEM TO IT. The per-field message alone sits
         wherever the field is, which on a forty question form is nowhere near the
         button they just pressed, so the button reads as broken. */
      setMissing(describeValidationErrors(schema, result.errors));
      focusFirstError(result.errors);
      return;
    }
    setErrors([]);
    setMissing(null);
    setSubmitting(true);
    const fd = new FormData();
    fd.set("instance_id", instanceId);
    fd.set("answers", JSON.stringify(answers));
    for (const [key, file] of Object.entries(files)) {
      if (file) fd.append(`file:${key}`, file);
    }
    // Defer so the "Saving…" state paints before the dispatch begins.
    setTimeout(() => formAction(fd), 0);
  }

  const busy = submitting || pending || !!state.redirectTo;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <FormRenderer
        key={drafting.version}
        schema={schema}
        defaultValue={opening}
        errors={errors}
        onChange={(next) => {
          setAnswers(next);
          drafting.record(next);
        }}
        onFileSelect={(key, file) => setFiles((prev) => ({ ...prev, [key]: file }))}
        lookupChoices={lookupChoices}
      />

      {missing ? <p className="form-error">{missing}</p> : null}
      {state.error ? <p className="form-error">{state.error}</p> : null}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Complete and save evidence"}
        </button>
      </div>
      {draft !== undefined ? (
        <p className="text-xs text-white/40">
          This saves as you go and waits for you for up to 12 hours, so you can stop and come
          back to it. Any file you attach has to be chosen again.
        </p>
      ) : null}
    </form>
  );
}
