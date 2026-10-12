"use client";

/**
 * Be Care Compliant: correct or change a login's name, in the user popup on Settings, Users
 * (Phil, 2026-10-12, docs/decisions/login-names.md).
 *
 * Shown for every login, other Admins and your own included, because a name is not a permission:
 * role and status stay locked for those two, the name does not. The save follows the standing
 * rule (Saving on press, green Saved until edited again, the refusal beside the button), and a
 * refused save keeps what was typed.
 *
 * When the login is linked to a People record, a tick box, ticked by default, changes that
 * record's name too. Untick it when the two should differ.
 */

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { renameLogin } from "@/app/(app)/settings/actions";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import { submitKeepingTyped } from "@/components/forms/keep-typed";
import { LOGIN_NAME_MAX } from "@/lib/users/login-name";

export default function LoginNameForm({
  userId,
  fullName,
  personName,
}: {
  userId: string;
  fullName: string;
  /** The linked People record's name, or null when the login has no People record. */
  personName: string | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(renameLogin, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  useEffect(() => {
    if (state.ok && !pending) {
      flash();
      router.refresh();
    }
  }, [state, pending, flash, router]);

  return (
    <form onSubmit={submitKeepingTyped(formAction)} onChange={reset} className="space-y-3">
      <input type="hidden" name="user_id" value={userId} />
      <div>
        <label htmlFor={`name-${userId}`} className="form-label">Name</label>
        <input
          id={`name-${userId}`}
          name="full_name"
          type="text"
          defaultValue={fullName}
          maxLength={LOGIN_NAME_MAX}
          autoComplete="off"
        />
      </div>
      {personName !== null ? (
        <label className="flex items-start gap-2 text-sm text-white/80">
          <input type="checkbox" name="also_person" defaultChecked className="mt-0.5" />
          <span>
            Also change their People record
            {personName !== fullName ? (
              <span className="block text-xs text-white/50">It reads {personName} now.</span>
            ) : null}
          </span>
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={saved ? "btn-saved" : "btn-primary"}>
          {pending ? "Saving…" : saved ? "Saved" : "Save name"}
        </button>
        {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
        {saved && state.ok && state.ok !== "Saved" ? (
          <span className="text-xs text-white/60">{state.ok}</span>
        ) : null}
      </div>
    </form>
  );
}
