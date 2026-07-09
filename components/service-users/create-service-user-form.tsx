"use client";

import { useActionState, useState } from "react";
import { createServiceUser } from "@/lib/service-users/actions";
import { IDLE_STATE } from "@/lib/forms";
import type { BranchLite, ProfileLite, BranchStaff } from "@/lib/service-users/data";

export default function CreateServiceUserForm({
  branches,
  users,
  branchStaff,
}: {
  branches: BranchLite[];
  users: ProfileLite[];
  branchStaff: BranchStaff;
}) {
  const [state, formAction, pending] = useActionState(createServiceUser, IDLE_STATE);
  const assignable = users.filter(
    (u) => u.role === "supervisor" || u.role === "manager" || u.role === "company_admin",
  );

  const [branchId, setBranchId] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);

  function onBranch(id: string) {
    setBranchId(id);
    const staff = branchStaff[id];
    // Auto fill the branch supervisors as the caseload, same as People.
    setAssigneeIds(staff?.supervisors.map((s) => s.id) ?? []);
  }

  function toggle(id: string) {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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
          <label htmlFor="ssid" className="form-label">Social Services ID</label>
          <input id="ssid" name="ssid" />
          <p className="form-hint">Unique within your company. Leave blank if not known yet.</p>
        </div>

        <div>
          <label htmlFor="package_start_date" className="form-label">Package start date</label>
          <input id="package_start_date" name="package_start_date" type="date" />
          <p className="form-hint">Reviews are scheduled from this date.</p>
        </div>

        <div>
          <span className="form-label">Caseload</span>
          {assignable.length === 0 ? (
            <p className="text-xs text-white/50">No supervisors in this company yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {assignable.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm text-white/85">
                  <input
                    type="checkbox"
                    name="supervisor_ids"
                    value={u.id}
                    checked={assigneeIds.includes(u.id)}
                    onChange={() => toggle(u.id)}
                  />
                  {u.full_name || u.email}
                </label>
              ))}
            </div>
          )}
          <p className="form-hint">
            Auto filled from the branch supervisors. Only assigned users see this record.
          </p>
        </div>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add service user"}
        </button>
      </div>
    </form>
  );
}
