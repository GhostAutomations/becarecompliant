"use client";

import { useActionState } from "react";
import { updateServiceUser } from "@/lib/service-users/actions";
import { IDLE_STATE } from "@/lib/forms";
import type { ServiceUserRecord } from "@/lib/service-users/types";

export default function EditServiceUserForm({ serviceUser }: { serviceUser: ServiceUserRecord }) {
  const [state, formAction, pending] = useActionState(updateServiceUser, IDLE_STATE);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="service_user_id" value={serviceUser.id} />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="e_full_name" className="form-label">Full name *</label>
          <input id="e_full_name" name="full_name" required defaultValue={serviceUser.full_name} />
        </div>
        <div>
          <label htmlFor="e_ssid" className="form-label">Social Services ID</label>
          <input id="e_ssid" name="ssid" defaultValue={serviceUser.ssid ?? ""} />
        </div>
        <div>
          <label htmlFor="e_package_start" className="form-label">Package start date</label>
          <input
            id="e_package_start"
            name="package_start_date"
            type="date"
            defaultValue={serviceUser.package_start_date ?? ""}
          />
        </div>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className={`btn ${state.ok ? "btn-saved" : "btn-outline"}`}
      >
        {pending ? "Saving…" : state.ok ? "Saved" : "Save details"}
      </button>
    </form>
  );
}
