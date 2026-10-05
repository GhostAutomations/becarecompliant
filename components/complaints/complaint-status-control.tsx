"use client";

import { useActionState, useEffect, useState } from "react";
import { setComplaintStatus } from "@/lib/complaints/actions";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import { COMPLAINT_STATUS_LABELS, COMPLAINT_STATUS_ORDER, type ComplaintStatus } from "@/lib/complaints/types";
import { submitKeepingTyped } from "@/components/forms/keep-typed";

export default function ComplaintStatusControl({
  complaintId,
  status,
  upheld,
  closeWithOutcome = false,
}: {
  complaintId: string;
  status: ComplaintStatus;
  /** Null until somebody decides. Null is not "not upheld". */
  upheld: boolean | null;
  /** 0389: a complaint is closed with the Complaint Outcome, so Closed is not offered here
   *  (it stays shown while the complaint IS closed, so it can be reopened). */
  closeWithOutcome?: boolean;
}) {
  const [state, action, pending] = useActionState(setComplaintStatus, IDLE_STATE);
  const [value, setValue] = useState<ComplaintStatus>(status);
  const [saved, flash, reset] = useSavedFlash();
  useEffect(() => { if (state.ok && !pending) flash(); }, [state, pending, flash]);

  return (
    <form onSubmit={submitKeepingTyped(action)} className="space-y-3">
      <input type="hidden" name="complaint_id" value={complaintId} />
      <div>
        <label htmlFor="complaint_status" className="form-label">Status</label>
        <select
          id="complaint_status"
          name="status"
          value={value}
          onChange={(e) => {
            setValue(e.target.value as ComplaintStatus);
            reset();
          }}
        >
          {COMPLAINT_STATUS_ORDER.filter((k) => !closeWithOutcome || k !== "closed" || status === "closed").map((k) => (
            <option key={k} value={k}>{COMPLAINT_STATUS_LABELS[k]}</option>
          ))}
        </select>
      </div>
      {/* Asked only when closing, because that is the moment there is a finding to record.
          It decides how the complaint reads on a team member's record: upheld, not upheld,
          or still open. Leaving it unanswered is allowed and means exactly that. */}
      {value === "closed" && !closeWithOutcome ? (
        <div>
          <label htmlFor="complaint_upheld" className="form-label">Was the complaint upheld?</label>
          <select
            id="complaint_upheld"
            name="upheld"
            defaultValue={upheld === true ? "yes" : upheld === false ? "no" : ""}
            onChange={reset}
          >
            <option value="">Not decided</option>
            <option value="yes">Yes, upheld</option>
            <option value="no">No, not upheld</option>
          </select>
          <p className="form-hint">
            This is what a team member named on the complaint sees on their record. A complaint
            that was not upheld still shows, but never as a mark against them.
          </p>
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
