"use client";

import { useActionState, useEffect } from "react";
import { updateIncident } from "@/lib/incidents/actions";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import type { IncidentRecord } from "@/lib/incidents/types";
import IncidentFields from "./incident-fields";

export default function EditIncidentForm({
  incident,
  serviceUsers,
  people,
  todayIso,
}: {
  incident: IncidentRecord;
  serviceUsers: Array<{ id: string; full_name: string; branch_id: string | null }>;
  people: Array<{ id: string; full_name: string; branch_id: string | null }>;
  todayIso: string;
}) {
  const [state, formAction, pending] = useActionState(updateIncident, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  useEffect(() => { if (state.ok && !pending) flash(); }, [state, pending, flash]);

  return (
    <form action={formAction} className="space-y-6" onChange={reset}>
      <input type="hidden" name="incident_id" value={incident.id} />

      <IncidentFields
        idPrefix="edit_incident"
        incident={incident}
        serviceUsers={serviceUsers}
        people={people}
        branchId={incident.branch_id ?? ""}
        todayIso={todayIso}
        onEdit={reset}
      />

      <div>
        <label htmlFor="lessons_learnt" className="form-label">Lessons learnt</label>
        <textarea
          id="lessons_learnt"
          name="lessons_learnt"
          rows={3}
          defaultValue={incident.lessons_learnt ?? ""}
          placeholder="What changed as a result — training, a care plan update, a new check."
        />
        <p className="form-hint">
          This is what the six monthly Quality of Care Review asks for. Written now, it is
          worth reading; written in six months, it is invented.
        </p>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <div className="flex items-center gap-3">
        <button type="submit" className={saved ? "btn-saved" : "btn-primary"} disabled={pending}>
          {pending ? "Saving…" : saved ? "Saved" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
