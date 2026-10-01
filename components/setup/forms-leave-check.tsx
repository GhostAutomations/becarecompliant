"use client";

/**
 * Asks "Are you happy with your forms set up?" as a Company Admin leaves the Forms page, while
 * the Getting set up step is open (Phil, 2026-10-01). Moving into a form, or around the Forms
 * pages, is not leaving. Asked once per browser session, so a No is asked again next time, not
 * on every click.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { formsReviewHappy, formsReviewNeedsHelp } from "@/lib/setup/forms-review-actions";

const ASKED = "bcc-forms-review-asked";

function alreadyAsked(): boolean {
  try {
    return window.sessionStorage.getItem(ASKED) === "1";
  } catch {
    return false;
  }
}
function markAsked() {
  try {
    window.sessionStorage.setItem(ASKED, "1");
  } catch {
    /* private window: the question may come again, which is harmless */
  }
}

export default function FormsLeaveCheck() {
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);
  const [step, setStep] = useState<"ask" | "need" | "sent">("ask");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const leaving = useRef(false);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (leaving.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname.startsWith("/settings/forms")) return;
      if (alreadyAsked()) return;
      e.preventDefault();
      e.stopPropagation();
      markAsked();
      setTarget(url.pathname + url.search + url.hash);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const go = useCallback(() => {
    if (!target) return;
    leaving.current = true;
    router.push(target);
  }, [router, target]);

  if (!target) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="forms-review-title"
        className="w-full max-w-md rounded-2xl border border-white/15 bg-navy-900 p-5 shadow-2xl"
      >
        <h2 id="forms-review-title" className="text-base font-semibold text-white">
          {step === "sent" ? "Thank you" : "Are you happy with your forms set up?"}
        </h2>

        {step === "ask" ? (
          <>
            <p className="mt-2 text-sm text-white/70">
              Yes ticks &ldquo;Look over your forms&rdquo; on your Getting set up list. No lets you tell us what you need.
            </p>
            {error ? <p role="alert" className="form-error mt-3">{error}</p> : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-ghost px-3 py-1.5 text-sm" disabled={pending} onClick={go}>
                Not now
              </button>
              <button type="button" className="btn-outline px-3 py-1.5 text-sm" disabled={pending} onClick={() => setStep("need")}>
                No
              </button>
              <button
                type="button"
                className="btn-primary px-3 py-1.5 text-sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const r = await formsReviewHappy();
                    if (r.error) setError(r.error);
                    else go();
                  })
                }
              >
                {pending ? "Saving…" : "Yes"}
              </button>
            </div>
          </>
        ) : step === "need" ? (
          <>
            <label htmlFor="forms-review-note" className="form-label mt-3">
              What do you need?
            </label>
            <textarea
              id="forms-review-note"
              rows={4}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="For example: our spot check form asks different questions"
            />
            {error ? <p role="alert" className="form-error mt-2">{error}</p> : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-ghost px-3 py-1.5 text-sm" disabled={pending} onClick={() => setStep("ask")}>
                Back
              </button>
              <button
                type="button"
                className="btn-primary px-3 py-1.5 text-sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const r = await formsReviewNeedsHelp(note);
                    if (r.error) setError(r.error);
                    else {
                      setMessage(r.ok ?? "Your note has been sent.");
                      setStep("sent");
                    }
                  })
                }
              >
                {pending ? "Sending…" : "Send"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-white/70">{message}</p>
            <div className="mt-5 flex justify-end">
              <button type="button" className="btn-primary px-3 py-1.5 text-sm" onClick={go}>
                Continue
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
