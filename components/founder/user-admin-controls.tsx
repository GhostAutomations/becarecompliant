"use client";

/**
 * Be Care Compliant — founder cross-company user controls (drill-in page).
 * Same save-button discipline as CompanyStatusButton: instant "Working" on
 * press, disabled while pending, visible inline error if the write is refused
 * (the actions check the update count so an RLS no-op never passes silently).
 */

import { useActionState, useEffect } from "react";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import {
  founderSetUserStatus,
  founderResendInvite,
  founderRevokeInvite,
} from "@/app/(app)/founder/actions";

/** Enable or disable a tenant user. `current` is the user's present status. */
export function UserStatusButton({
  userId,
  current,
}: {
  userId: string;
  current: string;
}) {
  const [state, action, pending] = useActionState(founderSetUserStatus, IDLE_STATE);
  const next = current === "active" ? "disabled" : "active";
  const label = current === "active" ? "Disable" : "Enable";
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="status" value={next} />
      <button type="submit" disabled={pending} className="btn-ghost px-2.5 py-1 text-xs">
        {pending ? "Working…" : label}
      </button>
      {state.error && <span className="text-xs text-red-300">{state.error}</span>}
    </form>
  );
}

/** Resend or revoke a pending invite in a tenant company. */
export function InviteActions({
  inviteId,
  companyId,
}: {
  inviteId: string;
  companyId: string;
}) {
  const [resendState, resendAction, resendPending] = useActionState(
    founderResendInvite,
    IDLE_STATE,
  );
  const [revokeState, revokeAction, revokePending] = useActionState(
    founderRevokeInvite,
    IDLE_STATE,
  );
  const [resent, flashResent] = useSavedFlash();
  useEffect(() => { if (resendState.ok && !resendPending) flashResent(); }, [resendState, resendPending, flashResent]);
  const err = resendState.error || revokeState.error;
  return (
    <div className="inline-flex items-center gap-2">
      <form action={resendAction} className="inline">
        <input type="hidden" name="invite_id" value={inviteId} />
        <input type="hidden" name="company_id" value={companyId} />
        <button
          type="submit"
          disabled={resendPending}
          className={`${resent ? "btn-saved" : "btn-ghost"} px-2.5 py-1 text-xs`}
        >
          {resendPending ? "Working…" : resent ? "Sent" : "Resend"}
        </button>
      </form>
      <form action={revokeAction} className="inline">
        <input type="hidden" name="invite_id" value={inviteId} />
        <input type="hidden" name="company_id" value={companyId} />
        <button
          type="submit"
          disabled={revokePending}
          className="btn-ghost px-2.5 py-1 text-xs"
        >
          {revokePending ? "Working…" : "Revoke"}
        </button>
      </form>
      {err && <span className="text-xs text-red-300">{err}</span>}
    </div>
  );
}
