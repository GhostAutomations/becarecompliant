"use client";

/**
 * Be Care Compliant — read a policy and sign it, in ONE step.
 *
 * Phil, 2026-07-26: "clicking 2 seperate buttons to read and sign a document is
 * clunky". It was: "Read the policy" opened a tab, then "Sign it" opened a
 * separate dialog, so the document was never in front of them while they signed,
 * which is exactly backwards for something you are attesting to.
 *
 * Now one button opens one panel: the document on the left, the confirmation and
 * the signature on the right, side by side on a laptop and stacked on a phone.
 *
 * The document is shown in an iframe pointed at the audited signed-URL route. If
 * a browser refuses to display a PDF inline (iOS Safari is the usual culprit)
 * the "Open it in a new tab" link is always there, so the flow can never dead
 * end. The Sign button stays disabled until they have actually signed, so the
 * only way to finish is to do the thing the certificate will claim they did.
 *
 * Validation and submission go through the SAME shared FormRenderer, validator
 * and Server Action as every other form, so nothing about the Evidence differs.
 */

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import FormRenderer from "@/components/forms/form-renderer";
import type { Answers, FormSchema } from "@/lib/form-schema";
import { validateAnswers, type FieldError } from "@/lib/form-validate";
import { IDLE_STATE, type ActionState } from "@/lib/forms";
import { acknowledgePolicy } from "@/lib/assignments/actions";
import { signatureGiven, type SignatureMode } from "@/lib/assignments/signing";

export default function ReadAndSign({
  assignmentId,
  policyId,
  title,
  version,
  schema,
  mode,
}: {
  assignmentId: string;
  policyId: string;
  title: string;
  version: number | null;
  /** Already filtered by signingSchema to this company's signing method. */
  schema: FormSchema;
  mode: SignatureMode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [state, formAction, pending] = useActionState(acknowledgePolicy, IDLE_STATE);
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSubmitting(false);
  }, [state]);

  useEffect(() => {
    if (state.ok && open) {
      setOpen(false);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const docUrl = `/api/policies/${policyId}/file`;
  const signed = signatureGiven(answers, mode).ok;
  const busy = submitting || pending;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = validateAnswers(schema, answers);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setSubmitting(true);
    const fd = new FormData();
    fd.set("answers", JSON.stringify(answers));
    fd.set("assignment_id", assignmentId);
    setTimeout(() => formAction(fd), 0);
  }

  return (
    <>
      <button
        type="button"
        className="btn-primary px-3 py-2 text-sm"
        onClick={() => setOpen(true)}
      >
        Read and sign
      </button>

      {open &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center sm:p-4">
            <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-navy-900 shadow-2xl">
              <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4 sm:p-5">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-white">{title}</h2>
                  <p className="text-xs text-white/50">
                    Read it, then sign at the {version ? `bottom. Version ${version}` : "bottom"}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-ghost shrink-0 px-3 py-1.5 text-sm"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                >
                  Close
                </button>
              </div>

              <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto lg:grid-cols-[1.5fr_1fr] lg:overflow-hidden">
                {/* The document itself. */}
                <div className="flex min-h-0 flex-col border-b border-white/10 lg:border-b-0 lg:border-r">
                  <iframe
                    src={docUrl}
                    title={title}
                    className="h-[45vh] w-full bg-white lg:h-auto lg:flex-1"
                  />
                  <div className="flex items-center justify-between gap-2 px-4 py-2">
                    <span className="text-xs text-white/40">
                      Cannot see it on your phone?
                    </span>
                    <a
                      href={docUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-ghost px-3 py-1.5 text-xs"
                    >
                      Open it in a new tab
                    </a>
                  </div>
                </div>

                {/* The confirmation and the signature. */}
                <form onSubmit={onSubmit} className="min-h-0 space-y-5 overflow-y-auto p-4 sm:p-5">
                  <FormRenderer schema={schema} errors={errors} onChange={setAnswers} />

                  {state.error ? <p className="form-error">{state.error}</p> : null}

                  <div className="flex flex-wrap items-center gap-3">
                    <button type="submit" className="btn-primary" disabled={busy || !signed}>
                      {busy ? "Signing…" : "Sign it"}
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
                  {!signed ? (
                    <p className="form-hint">
                      {mode === "type"
                        ? "Type your full name above to sign."
                        : mode === "draw"
                          ? "Sign in the box above to finish."
                          : "Sign in the box, or type your full name, to finish."}
                    </p>
                  ) : null}
                  <p className="form-hint">
                    Nothing to print or post. Your signature is kept with the version of
                    this document you have just read.
                  </p>
                </form>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
