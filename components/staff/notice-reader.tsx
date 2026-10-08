"use client";

/**
 * Be Care Compliant — a memo, message or attachment, read by the person it was sent to (0435).
 *
 * Opens full screen like Read and sign, because most of the team read on a phone. Opening it is
 * recorded (and completes a "just read it" notice). Then the one bar at the bottom says what is
 * asked: Done, "I have read this", or Sign it, which opens the same signing sheet a policy uses
 * and files the signature as Evidence on their record.
 */

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import FormRenderer from "@/components/forms/form-renderer";
import type { Answers, FormSchema } from "@/lib/form-schema";
import { validateAnswers, type FieldError } from "@/lib/form-validate";
import { describeValidationErrors } from "@/lib/forms/validation-message";
import { focusFirstError } from "@/components/forms/focus-first-error";
import { IDLE_STATE } from "@/lib/forms";
import { confirmNotice, openNotice, signNotice } from "@/lib/briefings/notice-actions";
import { signatureGiven, type SignatureMode } from "@/lib/assignments/signing";
import NoticeText from "@/components/briefings/notice-text";
import {
  NOTICE_KIND_LABELS,
  fileSizeLabel,
  type NoticeFile,
  type NoticeKind,
  type NoticeResponse,
} from "@/lib/briefings/notice-rules";

export default function NoticeReader({
  assignmentId,
  noticeId,
  title,
  kind,
  body,
  files,
  response,
  done,
  schema,
  mode,
  triggerLabel,
  triggerClassName = "btn-primary px-3 py-2 text-sm",
}: {
  assignmentId: string;
  noticeId: string;
  title: string;
  kind: NoticeKind;
  body: string | null;
  files: NoticeFile[];
  response: NoticeResponse;
  /** Already read, confirmed or signed: open it to read again, nothing more to do. */
  done: boolean;
  /** The signing form, already filtered to the company's signing method. Only for "sign". */
  schema: FormSchema | null;
  mode: SignatureMode;
  triggerLabel: string;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [confirmState, confirmAction, confirming] = useActionState(confirmNotice, IDLE_STATE);
  const [signState, signAction, signing] = useActionState(signNotice, IDLE_STATE);
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [missing, setMissing] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  useEffect(() => setMounted(true), []);

  // Record the opening. A "just read it" notice is done the moment it opens.
  useEffect(() => {
    if (!open) return;
    let live = true;
    openNotice(assignmentId).then((r) => {
      if (!live) return;
      if (!r.ok) setOpenError(r.error);
      else if (r.status === "completed" && !done) setChanged(true);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (confirmState.ok || signState.ok) {
      setSheet(false);
      setOpen(false);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmState, signState]);

  function close() {
    setOpen(false);
    setSheet(false);
    if (changed) router.refresh();
  }

  function onSign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!schema) return;
    const result = validateAnswers(schema, answers);
    if (!result.ok) {
      setErrors(result.errors);
      setMissing(describeValidationErrors(schema, result.errors));
      focusFirstError(result.errors);
      return;
    }
    setErrors([]);
    setMissing(null);
    const fd = new FormData();
    fd.set("answers", JSON.stringify(answers));
    fd.set("assignment_id", assignmentId);
    setTimeout(() => signAction(fd), 0);
  }

  const signed = signatureGiven(answers, mode).ok;
  const busy = confirming || signing;

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>

      {open &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex flex-col bg-navy-900">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-white">{title}</h2>
                <p className="text-xs text-white/50">
                  {NOTICE_KIND_LABELS[kind]}
                  {kind === "memo" ? (
                    <>
                      {" · "}
                      <a
                        href={`/api/briefings/notices/${noticeId}/memo`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-white/30 underline-offset-2"
                      >
                        Download as a PDF
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
              <button type="button" className="btn-ghost shrink-0 px-3 py-1.5 text-sm" onClick={close} disabled={busy}>
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="mx-auto w-full max-w-2xl space-y-4 px-4 pb-6 pt-4">
                {openError ? <p className="form-error">{openError}</p> : null}
                <NoticeText body={body} />

                {files.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
                      {files.length === 1 ? "File" : "Files"}
                    </p>
                    <ul className="space-y-2">
                      {files.map((f, i) => (
                        <li
                          key={i}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                        >
                          <span className="min-w-0 truncate text-sm text-white/85">
                            {f.name} <span className="text-xs text-white/40">{fileSizeLabel(f.size)}</span>
                          </span>
                          <span className="flex gap-2">
                            <a
                              href={`/api/briefings/notices/${noticeId}/files/${i + 1}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-outline px-3 py-1.5 text-xs"
                            >
                              Open
                            </a>
                            <a
                              href={`/api/briefings/notices/${noticeId}/files/${i + 1}?download=1`}
                              className="btn-ghost px-3 py-1.5 text-xs"
                            >
                              Download
                            </a>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="border-t border-white/10 bg-navy-900/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
              {confirmState.error ? <p className="form-error mb-2">{confirmState.error}</p> : null}
              {done || response === "read" ? (
                <button type="button" className="btn-primary w-full py-3" onClick={close}>
                  {done ? "Close" : "Done"}
                </button>
              ) : response === "confirm" ? (
                <form action={confirmAction}>
                  <input type="hidden" name="assignment_id" value={assignmentId} />
                  <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
                    {confirming ? "Saving…" : "I have read this"}
                  </button>
                </form>
              ) : schema ? (
                <button type="button" className="btn-primary w-full py-3" onClick={() => setSheet(true)}>
                  Sign it
                </button>
              ) : (
                <p className="text-center text-xs text-amber-300">
                  Signing is not set up for your company yet. Please tell your manager.
                </p>
              )}
            </div>

            {sheet && schema && (
              <div className="absolute inset-0 z-10 flex items-end bg-black/60 backdrop-blur-sm sm:items-center sm:justify-center">
                <form
                  onSubmit={onSign}
                  className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-navy-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-2xl sm:p-6"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-base font-semibold text-white">Sign it</h3>
                    <button
                      type="button"
                      className="btn-ghost px-3 py-1.5 text-xs"
                      onClick={() => setSheet(false)}
                      disabled={busy}
                    >
                      Back to reading
                    </button>
                  </div>
                  <FormRenderer schema={schema} errors={errors} onChange={setAnswers} />
                  {missing ? <p className="form-error">{missing}</p> : null}
                  {signState.error ? <p className="form-error mt-3">{signState.error}</p> : null}
                  <button type="submit" className="btn-primary mt-5 w-full py-3" disabled={busy || !signed}>
                    {signing ? "Signing…" : "Sign it"}
                  </button>
                  <p className="form-hint mt-2 text-center">
                    {signed
                      ? "Your signature is kept on your record."
                      : mode === "type"
                        ? "Type your full name above to sign."
                        : mode === "draw"
                          ? "Sign in the box above with your finger."
                          : mode === "both"
                            ? "Sign in the box with your finger and type your full name."
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
