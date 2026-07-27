"use client";

/**
 * Be Care Compliant — read a policy and sign it, the way DocuSign and Adobe do it
 * on a phone.
 *
 * Phil, 2026-07-26: two buttons was clunky, and "mot peple will us their phone".
 * So this is not a dialog beside a form. It is the pattern those products use:
 *
 *   1. The document fills the screen. Nothing beside it, nothing competing.
 *   2. One STICKY BAR at the bottom that never scrolls away, and its label is the
 *      state: "Keep reading" -> "Sign it". It says what is missing rather than
 *      being mysteriously grey.
 *   3. Signing happens in a SHEET over the document, so the thing being signed is
 *      never more than one tap away.
 *
 * Phil's ruling, same day: the Sign bar stays locked until they reach the LAST
 * PAGE. DocuSign does not gate like this, but a care policy is not a contract you
 * already negotiated, and an inspector asking "how do you know they read it"
 * deserves a better answer than a tick box.
 *
 * The tick and the signature use the SAME shared FormRenderer, validator and
 * Server Action as every other form in the app, so the Evidence is identical.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import FormRenderer from "@/components/forms/form-renderer";
import PolicyReader from "@/components/staff/policy-reader";
import PolicyText from "@/components/staff/policy-text";
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
  writtenBody,
}: {
  assignmentId: string;
  policyId: string;
  title: string;
  version: number | null;
  /** Set when the policy was written or pasted in: read it as a page, not a PDF. */
  writtenBody?: string | null;
  /** Already filtered by signingSchema to this company's signing method. */
  schema: FormSchema;
  mode: SignatureMode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [readToEnd, setReadToEnd] = useState(false);
  const [renderFailed, setRenderFailed] = useState(false);
  const [progress, setProgress] = useState(0);
  // For a PDF the pages arrive one by one, so "the bottom" means nothing until
  // they are all drawn. Written text is ready as soon as it is on the screen.
  const [docReady, setDocReady] = useState(false);
  // Has the layout stopped moving? Measuring straight away is how the gate broke
  // twice: on the first frame the content has not laid out, so the panel looks
  // like it has nothing to scroll (Phil, 2026-07-27: "i cant see a % bar", i.e.
  // it had already unlocked).
  const [settled, setSettled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [state, formAction, pending] = useActionState(acknowledgePolicy, IDLE_STATE);
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => setSubmitting(false), [state]);

  /**
   * Have they actually got to the end?
   *
   * Phil, 2026-07-27: the bar unlocked before he had scrolled. The old version
   * watched a marker at the foot of the document with an IntersectionObserver,
   * which was too clever and wrong twice over: the panel keeps its state when you
   * close and reopen it, so one unlock lasted forever, and with a PDF the pages
   * render progressively, so the "bottom" arrived while page three of five was
   * still blank.
   *
   * This measures the scroll position of the panel itself, which cannot lie, and
   * only counts once the document is fully rendered. A document shorter than the
   * screen unlocks immediately, because there is nothing to scroll.
   */
  const measure = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const { scrollTop, clientHeight, scrollHeight } = node;
    // A container with no height yet tells us nothing. Never conclude anything
    // from it, or the panel unlocks before it has drawn a single word.
    if (clientHeight < 40 || scrollHeight < 40) return;

    const scrollable = scrollHeight - clientHeight;
    if (scrollable <= 8) {
      // Genuinely shorter than the screen: nothing to scroll, so nothing to gate.
      // Only trusted once the layout has settled AND the document is rendered.
      setProgress(1);
      if (docReady && settled) setReadToEnd(true);
      return;
    }
    setProgress(Math.min(1, (scrollTop + clientHeight) / scrollHeight));
    if (docReady && scrollTop + clientHeight >= scrollHeight - 24) setReadToEnd(true);
  }, [docReady, settled]);

  // Give the layout (and pdf.js) a moment before believing a short measurement.
  useEffect(() => {
    if (!open) {
      setSettled(false);
      return;
    }
    setSettled(false);
    const timer = setTimeout(() => setSettled(true), 600);
    return () => clearTimeout(timer);
  }, [open, docReady]);

  // Re-measure when the content grows (pages rendering) or the window changes.
  useEffect(() => {
    if (!open) return;
    const node = scrollRef.current;
    if (!node) return;
    measure();
    const observer = new ResizeObserver(() => measure());
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [open, measure]);

  // Every opening starts fresh: reopening a policy is not evidence of reading it.
  useEffect(() => {
    if (!open) return;
    setReadToEnd(false);
    setProgress(0);
    setRenderFailed(false);
    setDocReady(!!writtenBody);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The document is behind the sheet, so the page underneath must not scroll.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (state.ok && open) {
      setOpen(false);
      setSheet(false);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const docUrl = `/api/policies/${policyId}/file`;
  const signed = signatureGiven(answers, mode).ok;
  const busy = submitting || pending;
  // A document we could not render cannot be scroll-tracked, so the gate would
  // trap them. Opening it in a new tab is still audited, so the proof survives.
  const canSign = readToEnd || renderFailed;

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
          <div className="fixed inset-0 z-[200] flex flex-col bg-navy-900">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-white">{title}</h2>
                <p className="text-xs text-white/50">
                  {version ? `Version ${version} · ` : ""}
                  <a
                    href={docUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-white/30 underline-offset-2"
                  >
                    {writtenBody ? "Open as a PDF" : "Open in a new tab"}
                  </a>
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

            {/* The document */}
            <div
              ref={scrollRef}
              onScroll={measure}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            >
              {writtenBody ? (
                <PolicyText body={writtenBody} />
              ) : (
                <PolicyReader
                  url={docUrl}
                  onRendered={() => setDocReady(true)}
                  onFailed={() => {
                    setRenderFailed(true);
                    setDocReady(true);
                  }}
                />
              )}
            </div>

            {/* The one bar that never scrolls away */}
            <div className="border-t border-white/10 bg-navy-900/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
              <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-all ${
                    canSign ? "bg-emerald-400/80" : "bg-amber-400/80"
                  }`}
                  style={{ width: `${Math.max(2, Math.round((canSign ? 1 : progress) * 100))}%` }}
                />
              </div>
              <button
                type="button"
                className={canSign ? "btn-primary w-full py-3" : "btn-outline w-full py-3 opacity-60"}
                onClick={() => canSign && setSheet(true)}
                disabled={!canSign}
              >
                {canSign
                  ? "Sign it"
                  : docReady
                    ? `Keep reading to the end to sign · ${Math.round(progress * 100)}%`
                    : "Opening the document…"}
              </button>
            </div>

            {/* The signing sheet, over the document */}
            {sheet && (
              <div className="absolute inset-0 z-10 flex items-end bg-black/60 backdrop-blur-sm sm:items-center sm:justify-center">
                <form
                  onSubmit={onSubmit}
                  className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-navy-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-2xl sm:p-6"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-base font-semibold text-white">Sign this policy</h3>
                    <button
                      type="button"
                      className="btn-ghost px-3 py-1.5 text-xs"
                      onClick={() => setSheet(false)}
                      disabled={busy}
                    >
                      Back to the document
                    </button>
                  </div>

                  <FormRenderer schema={schema} errors={errors} onChange={setAnswers} />

                  {state.error ? <p className="form-error mt-3">{state.error}</p> : null}

                  <button
                    type="submit"
                    className="btn-primary mt-5 w-full py-3"
                    disabled={busy || !signed}
                  >
                    {busy ? "Signing…" : "Sign it"}
                  </button>
                  <p className="form-hint mt-2 text-center">
                    {signed
                      ? "Nothing to print or post. Your signature is kept with this version."
                      : mode === "type"
                        ? "Type your full name above to sign."
                        : mode === "draw"
                          ? "Sign in the box above with your finger."
                          : "Sign with your finger, or type your full name."}
                  </p>
                </form>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
