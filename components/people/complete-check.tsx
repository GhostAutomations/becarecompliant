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
import { validateAnswers, type FieldError } from "@/lib/form-validate";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { completeCheck } from "@/lib/people/actions";
import { IDLE_STATE } from "@/lib/forms";

export default function CompleteCheck({
  schema,
  instanceId,
}: {
  schema: FormSchema;
  instanceId: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(completeCheck, IDLE_STATE);
  const [answers, setAnswers] = useState<Answers>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [errors, setErrors] = useState<FieldError[]>([]);

  // Redirect client-side once the action reports success (see ActionState.redirectTo).
  useEffect(() => {
    if (state.redirectTo) router.replace(state.redirectTo);
  }, [state.redirectTo, router]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = validateAnswers(schema, answers);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    const fd = new FormData();
    fd.set("instance_id", instanceId);
    fd.set("answers", JSON.stringify(answers));
    for (const [key, file] of Object.entries(files)) {
      if (file) fd.append(`file:${key}`, file);
    }
    formAction(fd);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <FormRenderer
        schema={schema}
        errors={errors}
        onChange={setAnswers}
        onFileSelect={(key, file) => setFiles((prev) => ({ ...prev, [key]: file }))}
      />

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending || !!state.redirectTo}>
          {pending || state.redirectTo ? "Saving…" : "Complete and save evidence"}
        </button>
      </div>
    </form>
  );
}
