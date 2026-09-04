"use client";

/**
 * Be Care Compliant — one branch's name + office address editor.
 *
 * A branch with no premises of its own SHARES the main office address rather than
 * holding a copy of it (migration 0222): Thistle has Cardiff and Newport because it
 * cares for people in those areas, not because it has buildings there. Copying the
 * text into each branch would leave one right address and two silently wrong ones on
 * formal letters the day the company moves.
 *
 * Follows the save button standing rules in full: solid gold button, "Saving…"
 * the moment it is pressed, "Saved" on success, reverts to "Save" when edited
 * again, and errors shown next to the button. A save is never silent.
 */

import { useActionState, useEffect, useState } from "react";
import { IDLE_STATE } from "@/lib/forms";
import { renameBranch } from "@/app/(app)/settings/actions";
import { useSavedFlash } from "@/lib/use-saved-flash";

export default function BranchForm({
  branchId,
  initialName,
  initialAddress,
  isOffice,
  initialSharesOffice,
  officeAddress,
}: {
  branchId: string;
  initialName: string;
  initialAddress: string;
  /** The company's own office (the Team branch). It cannot share with itself. */
  isOffice: boolean;
  initialSharesOffice: boolean;
  /** The office's address, or null while it is still blank. */
  officeAddress: string | null;
}) {
  const [state, action, pending] = useActionState(renameBranch, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  const [sharesOffice, setSharesOffice] = useState(!isOffice && initialSharesOffice);

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

      {isOffice ? null : (
        <label className="flex items-start gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            name="uses_office_address"
            checked={sharesOffice}
            onChange={(e) => {
              setSharesOffice(e.target.checked);
              reset();
            }}
            disabled={pending}
          />
          <span>
            Same address as the main office
            <span className="mt-0.5 block text-[11px] text-white/40">
              For an area you cover rather than a building you have. The office address
              is used, so moving office moves this with it.
            </span>
          </span>
        </label>
      )}

      {sharesOffice ? (
        <div>
          <p className="form-label">Office address</p>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white/50">
            {officeAddress ?? "The main office has no address yet"}
          </div>
          <p className="mt-1 text-[11px] text-white/40">
            {officeAddress
              ? "Taken from the office above. Change it there and this follows."
              : "Set the office address on the first card, and this branch will use it."}
          </p>
        </div>
      ) : (
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
      )}

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
