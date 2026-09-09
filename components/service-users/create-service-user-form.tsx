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

        <div className="sm:col-span-2">
          <label htmlFor="care_plan" className="form-label">Care Plan</label>
          <input
            id="care_plan"
            name="care_plan"
            type="file"
            accept=".pdf,.doc,.docx,image/*"
          />
          <p className="form-hint">
            Optional. If you do not have it yet, you can upload it later on the Setup form or the record.
          </p>
        </div>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      {/* Two ways out of this form (Phil, 2026-09-09). Adding the record and completing the
          Setup Visit is one job done in one sitting, and the Setup Visit is where the funding
          question lives — so going straight there is usually what you actually want. Which
          button was pressed arrives in the form data as `then`. */}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" name="then" value="record" className="btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add service user"}
        </button>
        <button type="submit" name="then" value="setup" className="btn-outline" disabled={pending}>
          {pending ? "Adding…" : "Add service user and complete Setup"}
        </button>
      </div>
    </form>
  );
}
