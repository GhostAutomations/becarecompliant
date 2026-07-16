"use client";

/**
 * Be Care Compliant — one branch's name + office address editor.
 * Follows the save button standing rules in full: solid gold button, "Saving…"
 * the moment it is pressed, "Saved" on success, reverts to "Save" when edited
 * again, and errors shown next to the button. A save is never silent.
 */

import { useActionState, useEffect } from "react";
import { IDLE_STATE } from "@/lib/forms";
import { renameBranch } from "@/app/(app)/settings/actions";
import { useSavedFlash } from "@/lib/use-saved-flash";

export default function BranchForm({
  branchId,
  initialName,
  initialAddress,
}: {
  branchId: string;
  initialName: string;
  initialAddress: string;
}) {
  const [state, action, pending] = useActionState(renameBranch, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();

  // Success flashes "Saved" briefly, then the button reverts to "Save".
  useEffect(() => {
    if (state.ok && !pending) flash();
  }, [state, pending, flash]);

  const label = pending ? "Saving…" : saved ? "Saved" : "Save";

  return (
    <form action={action} className="space-y-3" onChange={reset}>
      <input type="hidden" name="branch_id" value={branchId} />
      <div>
        <label htmlFor={`name-${branchId}`} className="form-label">
          Name
        </label>
        <input
          id={`name-${branchId}`}
          name="name"
          defaultValue={initialName}
          required
          disabled={pending}
        />
      </div>
      <div>
        <label htmlFor={`address-${branchId}`} className="form-label">
          Office address
        </label>
        <input
          id={`address-${branchId}`}
          name="address"
          defaultValue={initialAddress}
          placeholder="1 High Street, Newport, NP20 1AA"
          disabled={pending}
        />
        <p className="mt-1 text-[11px] text-white/40">
          Printed in full on formal meeting letters when the location is Office.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className={`btn ${saved ? "btn-saved" : "btn-primary"}`}
          disabled={pending}
        >
          {label}
        </button>
        {state.error && <span className="text-sm text-red-300">{state.error}</span>}
      </div>
    </form>
  );
}
