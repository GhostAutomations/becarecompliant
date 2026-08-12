"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createIncident } from "@/lib/incidents/actions";
import { IDLE_STATE } from "@/lib/forms";
import IncidentFields from "./incident-fields";

export default function CreateIncidentForm({
  branches,
  serviceUsers,
  people,
  todayIso,
}: {
  branches: Array<{ id: string; name: string }>;
  serviceUsers: Array<{ id: string; full_name: string; branch_id: string | null }>;
  people: Array<{ id: string; full_name: string; branch_id: string | null }>;
  todayIso: string;
}) {
  const [state, formAction, pending] = useActionState(createIncident, IDLE_STATE);
  const router = useRouter();
  // The action returns redirectTo rather than calling redirect() (see lib/forms).
  useEffect(() => {
    if (state.redirectTo) router.replace(state.redirectTo);
  }, [state.redirectTo, router]);

  const [branchId, setBranchId] = useState(branches.length === 1 ? branches[0].id : "");

  return (
    <form action={formAction} className="space-y-6">
      <div>
        <label htmlFor="branch_id" className="form-label">Branch *</label>
        <select
          id="branch_id"
          name="branch_id"
          required
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
        >
          <option value="" disabled>Please choose</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <p className="form-hint">
          Choose the branch first — the service user and staff lists narrow to it.
        </p>
      </div>

      <IncidentFields
        idPrefix="new_incident"
        serviceUsers={serviceUsers}
        people={people}
        branchId={branchId}
        todayIso={todayIso}
      />

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending || !!state.redirectTo}>
          {pending || state.redirectTo ? "Recording…" : "Record incident"}
        </button>
      </div>
    </form>
  );
}
