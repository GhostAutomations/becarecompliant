"use client";

import { useActionState, useState } from "react";
import { setComplaintStatus } from "@/lib/complaints/actions";
import { IDLE_STATE } from "@/lib/forms";
import { COMPLAINT_STATUS_LABELS, COMPLAINT_STATUS_ORDER, type ComplaintStatus } from "@/lib/complaints/types";

export default function ComplaintStatusControl({
  complaintId,
  status,
  outcome,
}: {
  complaintId: string;
  status: ComplaintStatus;
  outcome: string | null;
}) {
  const [state, action, pending] = useActionState(setComplaintStatus, IDLE_STATE);
  const [value, setValue] = useState<ComplaintStatus>(status);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="complaint_id" value={complaintId} />
      <div>
        <label htmlFor="complaint_status" className="form-label">Status</label>
        <select
          id="complaint_status"
          name="status"
          value={value}
          onChange={(e) => setValue(e.target.value as ComplaintStatus)}
        >
          {COMPLAINT_STATUS_ORDER.map((k) => (
            <option key={k} value={k}>{COMPLAINT_STATUS_LABELS[k]}</option>
          ))}
        </select>
      </div>
      {value === "closed" ? (
        <div>
          <label htmlFor="outcome" className="form-label">Outcome</label>
          <textarea
            id="outcome"
            name="outcome"
            rows={3}
            defaultValue={outcome ?? ""}
            placeholder="How was the complaint resolved?"
          />
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <button type="submit" className="btn-primary text-sm" disabled={pending}>
          {pending ? "Saving…" : "Update status"}
        </button>
        {state.ok ? <span className="text-xs text-emerald-300">Saved</span> : null}
        {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
      </div>
    </form>
  );
}
