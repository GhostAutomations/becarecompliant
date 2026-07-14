"use client";

import { useActionState } from "react";
import { IDLE_STATE } from "@/lib/forms";
import { enterManageAs } from "@/app/(app)/founder/actions";

/** Founder: enter manage-as support mode for a company. On success the action
 *  sets the cookie and redirects to that company's dashboard. */
export function EnterManageAsButton({ companyId }: { companyId: string }) {
  const [state, action, pending] = useActionState(enterManageAs, IDLE_STATE);
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="company_id" value={companyId} />
      <button type="submit" disabled={pending} className="btn-primary px-3 py-1.5 text-xs">
        {pending ? "Entering…" : "Manage as company"}
      </button>
      {state.error && <span className="text-xs text-red-300">{state.error}</span>}
    </form>
  );
}
