"use client";

import { useState } from "react";
import CarePlanEditor from "./care-plan-editor";
import { saveCarePlan, updateCarePlan } from "@/lib/service-users/actions";
import { CARE_PLAN_DAYS, type CarePlanEntry } from "@/lib/service-users/care-plan-consts";

/**
 * Care plan editing surface. The current plan shows as a compact read-only summary
 * and collapses as soon as it is saved; "Edit" reopens the in-place editor.
 * "Update care plan" opens a second editor, prefilled from the current plan, that
 * starts a NEW dated version (the old plan is kept and billed up to the day before
 * the new one), so invoices split correctly across the change.
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
  // Start collapsed when a plan already exists; expanded to build the first one.
  const [editing, setEditing] = useState(!hasPlan);
  const [updating, setUpdating] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/80">Current plan</h2>
          {hasPlan && !editing ? (
            <button type="button" onClick={() => setEditing(true)} className="btn-outline text-xs">
              Edit
            </button>
          ) : null}
        </div>

        {editing ? (
          <CarePlanEditor
            mode="edit"
            action={saveCarePlan}
            serviceUserId={serviceUserId}
            initial={initial}
            servicesWithFixed={servicesWithFixed}
            onSaved={hasPlan ? () => setEditing(false) : undefined}
          />
        ) : (
          <CurrentPlanSummary entries={initial} />
        )}
      </div>

      {hasPlan && !editing && !updating ? (
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
            onSaved={() => setUpdating(false)}
          />
        </section>
      ) : null}
    </div>
  );
}

/** Compact read-only view of the current plan, grouped by day. */
function CurrentPlanSummary({ entries }: { entries: CarePlanEntry[] }) {
  if (entries.length === 0) {
    return <div className="glass-card p-5 text-sm text-white/55">No care plan set yet.</div>;
  }
  const byDay = new Map<number, CarePlanEntry[]>();
  for (const e of entries) {
    const list = byDay.get(e.day_of_week) ?? [];
    list.push(e);
    byDay.set(e.day_of_week, list);
  }
  return (
    <div className="glass-card divide-y divide-white/5 p-5">
      {CARE_PLAN_DAYS.map((day, idx) => {
        const list = byDay.get(idx);
        if (!list || list.length === 0) return null;
        return (
          <div key={day} className="flex flex-wrap gap-x-4 gap-y-1 py-2 first:pt-0 last:pb-0">
            <span className="min-w-24 text-sm font-medium text-white/80">{day}</span>
            <span className="text-sm text-white/70">
              {list
                .map((e) => `${e.service} ${e.unit} ${e.handed === "double" ? "double" : "single"} ×${e.quantity}`)
                .join(", ")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
