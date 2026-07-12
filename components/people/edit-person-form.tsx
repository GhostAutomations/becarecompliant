"use client";

import { useActionState } from "react";
import { updatePerson } from "@/lib/people/actions";
import { IDLE_STATE } from "@/lib/forms";
import type { PersonRecord } from "@/lib/people/types";
import type { ProfileLite as UserLite } from "@/lib/people/data";

export default function EditPersonForm({
  person,
  users,
}: {
  person: PersonRecord;
  users: UserLite[];
}) {
  const [state, formAction, pending] = useActionState(updatePerson, IDLE_STATE);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="person_id" value={person.id} />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="e_full_name" className="form-label">Full name *</label>
          <input id="e_full_name" name="full_name" required defaultValue={person.full_name} />
        </div>
        <div>
          <label htmlFor="e_job_title" className="form-label">Job title</label>
          <input id="e_job_title" name="job_title" defaultValue={person.job_title ?? ""} />
        </div>
        <div>
          <label htmlFor="e_start_date" className="form-label">Start date</label>
          <input id="e_start_date" name="start_date" type="date" defaultValue={person.start_date ?? ""} />
        </div>
        <div>
          <label htmlFor="e_work_email" className="form-label">Personal email</label>
          <input id="e_work_email" name="work_email" type="email" defaultValue={person.work_email ?? ""} />
        </div>
        <div>
          <label htmlFor="e_mobile" className="form-label">Mobile</label>
          <input id="e_mobile" name="mobile" defaultValue={person.mobile ?? ""} />
        </div>
        <div>
          <label htmlFor="e_manager_id" className="form-label">Line manager</label>
          <select id="e_manager_id" name="manager_id" defaultValue={person.manager_id ?? ""}>
            <option value="">None</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
            ))}
          </select>
        </div>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className={`btn ${state.ok ? "btn-saved" : "btn-primary"}`}
      >
        {pending ? "Saving…" : state.ok ? "Saved" : "Save details"}
      </button>
    </form>
  );
}
