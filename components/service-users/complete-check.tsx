"use client";

/**
 * Be Care Compliant — complete a Service User Check (Phase 4). Wraps the ONE shared
 * Form renderer, validates with the shared validator, and submits through the SU
 * completeCheck action, which stores Evidence and advances the Check. Files are sent
 * as `file:<key>`; signatures travel inside the answers. Identical behaviour to the
 * People completion flow (Saving button, client redirect after the Server Action).
 */

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import FormRenderer from "@/components/forms/form-renderer";
import type { Answers, FormSchema } from "@/lib/form-schema";
import type { LookupChoice } from "@/lib/forms/lookup";
import { validateAnswers, type FieldError } from "@/lib/form-validate";
import { describeValidationErrors } from "@/lib/forms/validation-message";
import { focusFirstError } from "@/components/forms/focus-first-error";
import { completeCheck } from "@/lib/service-users/actions";
import { IDLE_STATE } from "@/lib/forms";

export default function CompleteCheck({
  schema,
  instanceId,
  presetAnswers,
  lookupChoices,
}: {
  schema: FormSchema;
  instanceId: string;
  /** Answers supplied outside the form (e.g. the review number from the slot clicked). */
  presetAnswers?: Answers;
  /** Records a record_lookup field may pick from, read server side under RLS. */
  lookupChoices?: Partial<Record<string, LookupChoice[]>>;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(completeCheck, IDLE_STATE);
  const [answers, setAnswers] = useState<Answers>(presetAnswers ?? {});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [missing, setMissing] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    setSubmitting(false);
  }, [state]);

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
