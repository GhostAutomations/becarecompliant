"use client";

/**
 * Be Care Compliant — reporting an incident.
 *
 * The same shape as completing a Check: the ONE shared FormRenderer, the shared validator, and
 * the shared draft (so a carer interrupted halfway through a long report does not lose it).
 * Filing it opens the case and lands on the case, so the reporter can see the thing they just
 * filed rather than a message saying it went somewhere.
 */

import { useEffect, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import FormRenderer from "@/components/forms/form-renderer";
import type { Answers, FormSchema } from "@/lib/form-schema";
import { validateAnswers, type FieldError } from "@/lib/form-validate";
import { describeValidationErrors } from "@/lib/forms/validation-message";
import { focusFirstError } from "@/components/forms/focus-first-error";
import { useFormDraft } from "@/components/forms/use-form-draft";
import { draftKey, mergeDraft } from "@/lib/forms/draft-key";
import { submitIncidentReport } from "@/lib/incidents/report-actions";
import { IDLE_STATE } from "@/lib/forms";

export default function IncidentReportForm({
  schema,
  presetAnswers,
  draft,
}: {
  schema: FormSchema;
  presetAnswers?: Answers;
  /** What this user had already typed, read on the server. Omit to turn drafting off. */
  draft?: Answers | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(submitIncidentReport, IDLE_STATE);
  const drafting = useFormDraft({
    key: draft === undefined ? null : draftKey("incident", ["report"]),
    initial: draft ?? null,
  });
  const opening = mergeDraft(presetAnswers, drafting.restored ?? undefined);
  const [answers, setAnswers] = useState<Answers>(opening ?? {});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [missing, setMissing] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSubmitting(false);
  }, [state]);

  useEffect(() => {
    if (state.redirectTo) {
      drafting.discard();
      router.replace(state.redirectTo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.redirectTo, router]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = validateAnswers(schema, answers);
    if (!result.ok) {
      setErrors(result.errors);
      setMissing(describeValidationErrors(schema, result.errors));
      focusFirstError(result.errors);
      return;
    }
    setErrors([]);
    setMissing(null);
    setSubmitting(true);
    const fd = new FormData();
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
        key={drafting.version}
        schema={schema}
        defaultValue={opening}
        errors={errors}
        onChange={(next) => {
          setAnswers(next);
          drafting.record(next);
        }}
        onFileSelect={(key, file) => setFiles((prev) => ({ ...prev, [key]: file }))}
      />

      {missing ? <p className="form-error">{missing}</p> : null}
      {state.error ? <p className="form-error">{state.error}</p> : null}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Reporting…" : "Report the incident"}
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
