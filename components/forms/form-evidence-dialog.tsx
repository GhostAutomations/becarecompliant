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
 */

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import FormRenderer from "@/components/forms/form-renderer";
import type { Answers, FormSchema } from "@/lib/form-schema";
import { validateAnswers, type FieldError } from "@/lib/form-validate";
import { IDLE_STATE, type ActionState } from "@/lib/forms";

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
}) {
  // Drop hidden fields from what we render and validate. The server still
  // validates against the full published version, so only omit optional fields.
  const effectiveSchema: FormSchema =
    hideFields && hideFields.length
      ? {
          ...schema,
          sections: schema.sections.map((s) => ({
            ...s,
            fields: s.fields.filter((f) => !hideFields.includes(f.key)),
          })),
        }
      : schema;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);
  const [answers, setAnswers] = useState<Answers>(presetAnswers ?? {});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSubmitting(false);
  }, [state]);

  useEffect(() => {
    if (state.redirectTo) router.replace(state.redirectTo);
    else if (state.ok && open) {
      setOpen(false);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = validateAnswers(effectiveSchema, answers);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setSubmitting(true);
    const fd = new FormData();
    fd.set("answers", JSON.stringify(answers));
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
              <FormRenderer
                schema={effectiveSchema}
                defaultValue={presetAnswers}
                errors={errors}
                onChange={setAnswers}
                onFileSelect={(key, file) =>
                  setFiles((prev) => ({ ...prev, [key]: file }))
                }
              />

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
            </form>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
