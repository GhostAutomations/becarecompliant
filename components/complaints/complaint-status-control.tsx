"use client";

import { useActionState, useEffect, useState } from "react";
import { setComplaintStatus } from "@/lib/complaints/actions";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import { COMPLAINT_STATUS_LABELS, COMPLAINT_STATUS_ORDER, type ComplaintStatus } from "@/lib/complaints/types";

export default function ComplaintStatusControl({
  complaintId,
  status,
}: {
  complaintId: string;
  status: ComplaintStatus;
}) {
  const [state, action, pending] = useActionState(setComplaintStatus, IDLE_STATE);
  const [value, setValue] = useState<ComplaintStatus>(status);
  const [saved, flash, reset] = useSavedFlash();
  useEffect(() => { if (state.ok && !pending) flash(); }, [state, pending, flash]);

  return (
    <form action={action} className="space-y-3">
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
          {COMPLAINT_STATUS_ORDER.map((k) => (
            <option key={k} value={k}>{COMPLAINT_STATUS_LABELS[k]}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" className={`${saved ? "btn-saved" : "btn-primary"} text-sm`} disabled={pending}>
          {pending ? "Saving…" : saved ? "Saved" : "Update status"}
        </button>
        {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
      </div>
    </form>
  );
}
