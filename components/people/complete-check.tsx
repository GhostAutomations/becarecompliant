"use client";

/**
 * Be Care Compliant — complete a Check (Phase 3). Wraps the ONE shared Form
 * renderer, validates with the shared validator, and submits through the
 * completeCheck action, which stores Evidence and advances the Check. Files are
 * sent as `file:<key>`; signatures travel inside the answers.
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
import { IDLE_STATE } from "@/lib/forms";

export default function CompleteCheck({
  schema,
  instanceId,
  presetAnswers,
  lookupChoices,
}: {
  schema: FormSchema;
  instanceId: string;
  /** Records a record_lookup field may pick from, read server side under RLS. */
  lookupChoices?: Partial<Record<string, LookupChoice[]>>;
  /** Answers supplied outside the form (e.g. the supervision number from the button
   *  clicked), seeded into the form so they are submitted and validated. */
  presetAnswers?: Answers;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(completeCheck, IDLE_STATE);
  const [answers, setAnswers] = useState<Answers>(presetAnswers ?? {});
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
        schema={schema}
        defaultValue={presetAnswers}
        errors={errors}
        onChange={setAnswers}
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
    </form>
  );
}
