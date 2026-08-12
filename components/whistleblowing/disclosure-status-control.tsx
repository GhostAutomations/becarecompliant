"use client";

import { useActionState, useEffect, useState } from "react";
import { setDisclosureStatus } from "@/lib/whistleblowing/actions";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import {
  DISCLOSURE_STATUS_LABELS,
  DISCLOSURE_STATUSES,
  type DisclosureStatus,
} from "@/lib/whistleblowing/types";

export default function DisclosureStatusControl({
  disclosureId,
  status,
  closedOn,
  todayIso,
}: {
  disclosureId: string;
  status: DisclosureStatus;
  closedOn: string | null;
  todayIso: string;
}) {
  const [state, action, pending] = useActionState(setDisclosureStatus, IDLE_STATE);
  const [value, setValue] = useState<DisclosureStatus>(status);
  const [saved, flash, reset] = useSavedFlash();
  useEffect(() => { if (state.ok && !pending) flash(); }, [state, pending, flash]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="disclosure_id" value={disclosureId} />
      <div>
        <label htmlFor="disclosure_status" className="form-label">Status</label>
        <select
          id="disclosure_status"
          name="status"
          value={value}
          onChange={(e) => { setValue(e.target.value as DisclosureStatus); reset(); }}
        >
          {DISCLOSURE_STATUSES.map((k) => (
            <option key={k} value={k}>{DISCLOSURE_STATUS_LABELS[k]}</option>
          ))}
        </select>
      </div>

      {value === "closed" ? (
        <div>
          <label htmlFor="disclosure_closed_on" className="form-label">Date closed</label>
          <input
            id="disclosure_closed_on"
            name="closed_on"
            type="date"
            defaultValue={closedOn ?? todayIso}
            onChange={reset}
          />
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button type="submit" className={`${saved ? "btn-saved" : "btn-primary"} text-sm`} disabled={pending}>
          {pending ? "Saving…" : saved ? "Saved" : "Update status"}
        </button>
        {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
      </div>
    </form>
  );
}
