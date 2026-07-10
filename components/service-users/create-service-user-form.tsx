"use client";

import { useActionState } from "react";
import { createServiceUser } from "@/lib/service-users/actions";
import { IDLE_STATE } from "@/lib/forms";

export default function CreateServiceUserForm({
  branches,
}: {
  branches: Array<{ id: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState(createServiceUser, IDLE_STATE);

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
          <label htmlFor="ssid" className="form-label">Social Services ID</label>
          <input id="ssid" name="ssid" />
          <p className="form-hint">Unique within your company. Leave blank if not known yet.</p>
        </div>

        <div>
          <label htmlFor="package_start_date" className="form-label">Package start date</label>
          <input id="package_start_date" name="package_start_date" type="date" />
          <p className="form-hint">Reviews are scheduled from this date.</p>
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
