"use client";

import { useActionState } from "react";
import { createPerson } from "@/lib/people/actions";
import { IDLE_STATE } from "@/lib/forms";
import type { BranchLite, ProfileLite } from "@/lib/people/data";

export default function CreatePersonForm({
  branches,
  users,
}: {
  branches: BranchLite[];
  users: ProfileLite[];
}) {
  const [state, formAction, pending] = useActionState(createPerson, IDLE_STATE);

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="full_name" className="form-label">Full name *</label>
          <input id="full_name" name="full_name" required />
        </div>

        <div>
          <label htmlFor="branch_id" className="form-label">Branch *</label>
          <select id="branch_id" name="branch_id" required defaultValue="">
            <option value="" disabled>Please choose</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="job_title" className="form-label">Job title</label>
          <input id="job_title" name="job_title" />
        </div>

        <div>
          <label htmlFor="start_date" className="form-label">Start date</label>
          <input id="start_date" name="start_date" type="date" />
          <p className="form-hint">Checks are scheduled from this date.</p>
        </div>

        <div>
          <label htmlFor="team" className="form-label">Team</label>
          <input id="team" name="team" />
        </div>

        <div>
          <label htmlFor="work_email" className="form-label">Work email</label>
          <input id="work_email" name="work_email" type="email" />
        </div>

        <div>
          <label htmlFor="mobile" className="form-label">Mobile</label>
          <input id="mobile" name="mobile" />
        </div>

        <div>
          <label htmlFor="manager_id" className="form-label">Line manager</label>
          <select id="manager_id" name="manager_id" defaultValue="">
            <option value="">None</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="team_leader_id" className="form-label">Team leader</label>
          <select id="team_leader_id" name="team_leader_id" defaultValue="">
            <option value="">None</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
            ))}
          </select>
        </div>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add person"}
        </button>
      </div>
    </form>
  );
}
