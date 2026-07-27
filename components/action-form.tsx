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

import { useActionState, useEffect, useState, type ReactNode } from "react";
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

  const showSaved = saved && !pending;
  const btnLabel = pending ? savingLabel : showSaved ? savedLabel : label;

  return (
    <form
      action={formAction}
      onChange={() => setSaved(false)}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={inline ? "flex items-end gap-2" : className}
    >
      {hidden
        ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)
        : null}
      {inline ? <div className="flex-1">{children}</div> : children}
      <div className={inline ? "flex items-center gap-2" : "flex items-center gap-2"}>
        <button
          type="submit"
          disabled={pending}
          className={showSaved ? "btn-saved text-xs" : buttonClassName}
        >
          {btnLabel}
        </button>
        {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
      </div>
    </form>
  );
}
