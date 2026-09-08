"use client";

/**
 * Complete a document/tracker Form (DBS, Right to Work, Probation). Same shared
 * renderer + validator as check completion; submits to completeTrackerForm, which
 * stores Evidence and stamps the dates into the record.
 */

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import FormRenderer from "@/components/forms/form-renderer";
import type { Answers, FormSchema } from "@/lib/form-schema";
import { validateAnswers, type FieldError } from "@/lib/form-validate";
import { describeValidationErrors } from "@/lib/forms/validation-message";
import { focusFirstError } from "@/components/forms/focus-first-error";
import { completeTrackerForm } from "@/lib/people/actions";
import { IDLE_STATE } from "@/lib/forms";

export default function CompleteTracker({
  schema,
  personId,
  formKey,
}: {
  schema: FormSchema;
  personId: string;
  formKey: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(completeTrackerForm, IDLE_STATE);
  const [answers, setAnswers] = useState<Answers>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [missing, setMissing] = useState<string | null>(null);
  // Immediate feedback: flip the button to "Saving…" the moment it is clicked.
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
    fd.set("person_id", personId);
    fd.set("form_key", formKey);
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
        errors={errors}
        onChange={setAnswers}
        onFileSelect={(key, file) => setFiles((prev) => ({ ...prev, [key]: file }))}
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
