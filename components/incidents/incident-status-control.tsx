"use client";

import { useActionState, useEffect, useState } from "react";
import { setIncidentStatus } from "@/lib/incidents/actions";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import { INCIDENT_STATUS_LABELS, INCIDENT_STATUSES, type IncidentStatus } from "@/lib/incidents/types";

export default function IncidentStatusControl({
  incidentId,
  status,
  closedOn,
  todayIso,
}: {
  incidentId: string;
  status: IncidentStatus;
  closedOn: string | null;
  todayIso: string;
}) {
  const [state, action, pending] = useActionState(setIncidentStatus, IDLE_STATE);
  const [value, setValue] = useState<IncidentStatus>(status);
  const [saved, flash, reset] = useSavedFlash();
  useEffect(() => { if (state.ok && !pending) flash(); }, [state, pending, flash]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="incident_id" value={incidentId} />
      <div>
        <label htmlFor="incident_status" className="form-label">Status</label>
        <select
          id="incident_status"
          name="status"
          value={value}
          onChange={(e) => { setValue(e.target.value as IncidentStatus); reset(); }}
        >
          {INCIDENT_STATUSES.map((k) => (
            <option key={k} value={k}>{INCIDENT_STATUS_LABELS[k]}</option>
          ))}
        </select>
      </div>

      {value === "closed" ? (
        <div>
          <label htmlFor="incident_closed_on" className="form-label">Date closed</label>
          <input
            id="incident_closed_on"
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
