"use client";

import { useActionState, useEffect } from "react";
import { updatePerson } from "@/lib/people/actions";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import type { PersonRecord } from "@/lib/people/types";
import type { ProfileLite as UserLite } from "@/lib/people/data";
import { canBeLineManager } from "@/lib/people/roles";

export default function EditPersonForm({
  person,
  users,
}: {
  person: PersonRecord;
  users: UserLite[];
}) {
  // One shared rule with Add a person (lib/people/roles.ts).
  const eligible = users.filter((u) => canBeLineManager(u.role));
  const [state, formAction, pending] = useActionState(updatePerson, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  useEffect(() => { if (state.ok && !pending) flash(); }, [state, pending, flash]);

  return (
    <form action={formAction} className="space-y-5" onChange={reset}>
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
          {/*
            THE STORED VALUE IS ALWAYS AN OPTION, even when it is not in the list.
            A <select> whose value is not among its options silently falls back to the first one,
            which here is "None", and Save then writes manager_id = null. That is how a Manager
            opening a colleague's record and changing a phone number wiped their line manager.
            The list itself was the bigger half of the bug (fixed 2026-08-16, it returned only the
            viewer), but a line manager who has since LEFT the company is still not in it, and
            leaving is not a reason to lose the record of who managed somebody.
          */}
          <select id="e_manager_id" name="manager_id" defaultValue={person.manager_id ?? ""}>
            <option value="">None</option>
            {/* Checked against the FILTERED list, not the raw one. Narrowing who may be a line
                manager (the RI came out on 2026-08-19) would otherwise drop somebody's existing
                manager off the options — and this select's whole history is that a value missing
                from the options silently saves as None. */}
            {person.manager_id && !eligible.some((u) => u.id === person.manager_id) ? (
              <option value={person.manager_id}>Current line manager (no longer listed)</option>
            ) : null}
            {eligible.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
            ))}
          </select>
        </div>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className={`btn ${saved ? "btn-saved" : "btn-primary"}`}
      >
        {pending ? "Saving…" : saved ? "Saved" : "Save details"}
      </button>
    </form>
  );
}
