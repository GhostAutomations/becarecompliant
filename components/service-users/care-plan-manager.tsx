"use client";

import { useState } from "react";
import CarePlanEditor from "./care-plan-editor";
import { saveCarePlan, updateCarePlan } from "@/lib/service-users/actions";
import type { CarePlanEntry } from "@/lib/service-users/care-plan-consts";

/**
 * Care plan editing surface. The top editor fixes the CURRENT plan in place (for
 * corrections). "Update care plan" opens a second editor, prefilled from the
 * current plan, that starts a NEW dated version: the old plan is kept and billed
 * up to the day before the new one, so invoices split correctly across the change.
 */
export default function CarePlanManager({
  serviceUserId,
  initial,
  servicesWithFixed,
  today,
  hasPlan,
}: {
  serviceUserId: string;
  initial: CarePlanEntry[];
  servicesWithFixed: string[];
  today: string;
  hasPlan: boolean;
}) {
  const [updating, setUpdating] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-2 text-sm font-semibold text-white/80">Current plan</h2>
        <CarePlanEditor
          mode="edit"
          action={saveCarePlan}
          serviceUserId={serviceUserId}
          initial={initial}
          servicesWithFixed={servicesWithFixed}
        />
      </div>

      {hasPlan && !updating ? (
        <button type="button" onClick={() => setUpdating(true)} className="btn-outline text-sm">
          Update care plan
        </button>
      ) : null}

      {hasPlan && updating ? (
        <section className="glass-card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/80">Update care plan</h2>
            <button
              type="button"
              onClick={() => setUpdating(false)}
              className="text-xs text-white/50 hover:text-white/80"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-white/55">
            This keeps the current plan and starts a new version. Pick the date it takes effect and adjust the lines. The old plan is billed up to the day before.
          </p>
          <CarePlanEditor
            mode="update"
            action={updateCarePlan}
            serviceUserId={serviceUserId}
            initial={initial}
            servicesWithFixed={servicesWithFixed}
            today={today}
          />
        </section>
      ) : null}
    </div>
  );
}
