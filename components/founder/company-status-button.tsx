"use client";

/**
 * Be Care Compliant — one company status action (Founder console).
 * Follows the save button rules: instant "Working" on press, disabled while
 * pending, and a visible inline error if the change is refused (the action
 * checks the update count so an RLS no-op never passes silently). On success the
 * page revalidates and the applicable buttons change.
 */

import { useActionState } from "react";
import { IDLE_STATE } from "@/lib/forms";
import { setCompanyStatus } from "@/app/(app)/founder/actions";

export function CompanyStatusButton({
  companyId,
  status,
  label,
}: {
  companyId: string;
  status: "active" | "suspended" | "archived";
  label: string;
}) {
  const [state, action, pending] = useActionState(setCompanyStatus, IDLE_STATE);
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" disabled={pending} className="btn-ghost px-3 py-1.5 text-xs">
        {pending ? "Working…" : label}
      </button>
      {state.error && <span className="text-xs text-red-300">{state.error}</span>}
    </form>
  );
}
