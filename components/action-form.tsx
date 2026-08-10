"use client";

/**
 * Be Care Compliant — the shared save button form (Phase 8).
 *
 * One client wrapper that turns any ActionState server action into a compliant
 * save button, so every mutation across the app follows the same rules without a
 * bespoke component each time: instant "Saving" on press, inputs disabled while
 * pending, a brief green "Saved" flash (about 2 seconds) that then reverts to
 * the normal label (never a stuck green box), client-side navigation when the
 * action returns redirectTo (never redirect() inside the action, see lib/forms),
 * and a visible inline error when the action refuses (the actions themselves
 * check the update count, so an RLS no-op surfaces here rather than silently).
 *
 * The server action is passed in as a prop (server actions are valid props to a
 * client component), keeping the page a server component.
 */

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IDLE_STATE, type ActionState } from "@/lib/forms";

type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export default function ActionForm({
  action,
  hidden,
  children,
  label = "Save",
  savingLabel = "Saving…",
  savedLabel = "Saved",
  buttonClassName = "btn-primary text-xs",
  className = "space-y-2",
  inline = false,
  confirm,
  onDone,
  onDoneDelayMs = 1200,
}: {
  action: ServerAction;
  hidden?: Record<string, string>;
  children?: ReactNode;
  label?: string;
  savingLabel?: string;
  /** Word shown during the brief success flash. Defaults to "Saved"; use "Sent",
   *  "Paid" etc. for non-save actions so the flash reads correctly. */
  savedLabel?: string;
  buttonClassName?: string;
  className?: string;
  /** Lay children and the button out on one row (select + Save). */
  inline?: boolean;
  /** Optional confirmation prompt shown before submit. */
  confirm?: string;
  /** Called after the success flash, e.g. to close the panel that contained the
   *  form (Phil, 2026-07-27: "once the button changes to sent, give it a second
   *  then close the send a briefing tile"). */
  onDone?: () => void;
  onDoneDelayMs?: number;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);
  const [saved, setSaved] = useState(false);
  const [asking, setAsking] = useState(false);
  // Portalled, so mounted has to be tracked: document does not exist on the server render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Escape closes it. window.confirm gave that for free and the first version of this dialog
  // did not, so a keyboard user could not dismiss it at all.
  useEffect(() => {
    if (!asking) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAsking(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [asking]);
  const formRef = useRef<HTMLFormElement | null>(null);
  const router = useRouter();

  // On success the button flashes green Saved/Sent for about 2 seconds, then
  // reverts to the normal label. Never a stuck green box (standing save rule).
  useEffect(() => {
    if (state.ok && !pending) {
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 2000);
      // Long enough to read the confirmation, short enough not to feel stuck.
      const done = onDone ? setTimeout(() => onDone(), onDoneDelayMs) : undefined;
      return () => {
        clearTimeout(t);
        if (done) clearTimeout(done);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, pending]);

  // Actions return { redirectTo } instead of calling redirect() (see lib/forms);
  // the navigation happens client-side here.
  useEffect(() => {
    if (state.redirectTo) router.replace(state.redirectTo);
  }, [state.redirectTo, router]);

  // A confirming button is NOT a submit button.
  //
  // First attempt confirmed on the form's submit event; that prompted twice for one
  // press. Second attempt confirmed on the click and blocked it with preventDefault;
  // that still prompted twice, but only when you pressed Cancel (Phil, 2026-07-27).
  // The reason: the click is replayed once the blocking dialog closes. On OK the
  // button is already disabled by `pending`, so the replay is swallowed; on Cancel
  // nothing has changed, so the replayed click asks again.
  //
  // So a confirming button no longer submits by default at all. It asks, and on OK it
  // submits the form ON PURPOSE. There is no default path left to replay, and Cancel
  // does nothing whatsoever.
  //
  // 2026-08-10: the ASKING is now the app's own dialog, not window.confirm. A native
  // confirm cannot be styled, reads as a browser warning rather than as the product, and
  // freezes browser automation dead, so every confirming button in the app was untestable.
  // delete-user-dialog.tsx replaced it for one button in Phase 8; this does it for all of
  // them. The two press problem above cannot return: the dialog is ordinary React, so
  // nothing is blocked and no click is ever replayed.
  const showSaved = saved && !pending;
  const btnLabel = pending ? savingLabel : showSaved ? savedLabel : label;

  return (
    <form
      ref={formRef}
      action={formAction}
      onChange={() => setSaved(false)}
      className={inline ? "flex items-end gap-2" : className}
    >
      {hidden
        ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)
        : null}
      {inline ? <div className="flex-1">{children}</div> : children}
      <div className={inline ? "flex items-center gap-2" : "flex items-center gap-2"}>
        <button
          type={confirm ? "button" : "submit"}
          disabled={pending}
          onClick={confirm ? () => setAsking(true) : undefined}
          className={showSaved ? "btn-saved text-xs" : buttonClassName}
        >
          {btnLabel}
        </button>
        {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
      </div>

      {/*
        PORTALLED TO THE BODY. Rendered in place, the `fixed inset-0` scrim resolves against the
        nearest ancestor with a backdrop-filter, and .glass-card has one, so on a long card the
        dialog centres itself halfway down the CARD, often below the fold, and the button reads as
        having done nothing. Several older dialogs in this app still render in place and get away
        with it because of where they sit; this one cannot, because it appears anywhere.
      */}
      {confirm && asking && mounted
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Confirm"
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
              onClick={() => setAsking(false)}
            >
              <div
                className="w-full max-w-md rounded-2xl border border-white/10 bg-navy-900 p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-lg font-semibold text-white">Are you sure?</h2>
                <p className="mt-2 text-sm text-white/70">{confirm}</p>
                <div className="mt-5 flex items-center gap-3">
                  {/* Confirming, then submitting on purpose. Still not a submit button. */}
                  {/*
                    Deliberately NOT autoFocus. A button fires its click on Enter KEYDOWN, so a
                    held Enter on the trigger would auto repeat straight onto this one and confirm
                    a destructive action nobody chose. Focus stays on the trigger, which is also
                    where it should return to on dismiss.
                  */}
                  <button
                    type="button"
                    onClick={() => {
                      setAsking(false);
                      formRef.current?.requestSubmit();
                    }}
                    className="btn-primary px-4 py-2 text-sm"
                  >
                    Yes, continue
                  </button>
                  {/*
                    "No, go back", never "Cancel". Half these prompts are ABOUT cancelling
                    something, and "Cancel this recurring invoice? [Yes, continue] [Cancel]"
                    leaves an admin genuinely unsure which button stops the thing.
                  */}
                  <button
                    type="button"
                    onClick={() => setAsking(false)}
                    className="btn-ghost px-3 py-2 text-sm text-white/60"
                  >
                    No, go back
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </form>
  );
}
