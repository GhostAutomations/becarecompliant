"use client";

import { useActionState, useState } from "react";
import { createPerson } from "@/lib/people/actions";
import { IDLE_STATE } from "@/lib/forms";
import type { BranchLite, ProfileLite, BranchStaff, JobTitle } from "@/lib/people/data";

export default function CreatePersonForm({
  branches,
  users,
  branchStaff,
  jobTitles,
}: {
  branches: BranchLite[];
  users: ProfileLite[];
  branchStaff: BranchStaff;
  jobTitles: JobTitle[];
}) {
  const [state, formAction, pending] = useActionState(createPerson, IDLE_STATE);
  const managers = users.filter((u) => u.role === "manager" || u.role === "company_admin");
  const supervisors = users.filter((u) => u.role === "supervisor");

  const [branchId, setBranchId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [supervisorIds, setSupervisorIds] = useState<string[]>([]);

  function onBranch(id: string) {
    setBranchId(id);
    const staff = branchStaff[id];
    setManagerId(staff?.managers[0]?.id ?? "");
    setSupervisorIds(staff?.supervisors.map((s) => s.id) ?? []);
  }

  function toggleSupervisor(id: string) {
    setSupervisorIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="full_name" className="form-label">Full name *</label>
          <input id="full_name" name="full_name" required />
        </div>

        <div>
          <label htmlFor="branch_id" className="form-label">Branch *</label>
          <select id="branch_id" name="branch_id" required value={branchId} onChange={(e) => onBranch(e.target.value)}>
            <option value="" disabled>Please choose</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="job_title" className="form-label">Job title *</label>
          {jobTitles.length === 0 ? (
            <>
              <input id="job_title" name="job_title" required />
              <p className="form-hint">
                Tip: add your company&rsquo;s job titles in Settings, People to get a dropdown here.
              </p>
            </>
          ) : (
            <select id="job_title" name="job_title" required defaultValue="">
              <option value="" disabled>Please choose</option>
              {jobTitles.map((t) => (
                <option key={t.id} value={t.title}>{t.title}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label htmlFor="start_date" className="form-label">Start date *</label>
          <input id="start_date" name="start_date" type="date" required />
          <p className="form-hint">Checks are scheduled from this date.</p>
        </div>

        <div>
          <label htmlFor="manager_id" className="form-label">Line manager *</label>
          <select id="manager_id" name="manager_id" required value={managerId} onChange={(e) => setManagerId(e.target.value)}>
            <option value="" disabled>Please choose</option>
            {managers.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
            ))}
          </select>
          <p className="form-hint">Auto filled from the branch. Change if needed.</p>
        </div>

        <div>
          <label htmlFor="work_email" className="form-label">Personal email *</label>
          <input id="work_email" name="work_email" type="email" required />
        </div>

        <div>
          <label htmlFor="mobile" className="form-label">Mobile *</label>
          <input id="mobile" name="mobile" required />
        </div>

        <div>
          <span className="form-label">Supervisors</span>
          {supervisors.length === 0 ? (
            <p className="text-xs text-white/50">No supervisors in this company yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {supervisors.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm text-white/85">
                  <input
                    type="checkbox"
                    name="supervisor_ids"
                    value={u.id}
                    checked={supervisorIds.includes(u.id)}
                    onChange={() => toggleSupervisor(u.id)}
                  />
                  {u.full_name || u.email}
                </label>
              ))}
            </div>
          )}
          <p className="form-hint">Auto filled from the branch. Tick or untick as needed.</p>
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
