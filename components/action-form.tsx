"use client";

/**
 * Be Care Compliant — the shared save button form (Phase 8).
 *
 * One client wrapper that turns any ActionState server action into a compliant
 * save button, so every mutation across the app follows the same rules without a
 * bespoke component each time: instant "Saving" on press, inputs disabled while
 * pending, "Saved" on success reverting to the label when edited again, and a
 * visible inline error when the action refuses (the actions themselves check the
 * update count, so an RLS no-op surfaces here rather than passing silently).
 *
 * The server action is passed in as a prop (server actions are valid props to a
 * client component), keeping the page a server component.
 */

import { useActionState, useEffect, useState, type ReactNode } from "react";
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
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);
  const [saved, setSaved] = useState(false);

  // On success the button turns green and reads Saved/Sent, and STAYS that way
  // until the section is edited again (onChange below resets it). Per Phil: this
  // is a persistent confirmation, not a brief flash.
  useEffect(() => {
    if (state.ok && !pending) setSaved(true);
  }, [state, pending]);

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
