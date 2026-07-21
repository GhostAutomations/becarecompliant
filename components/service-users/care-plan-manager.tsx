"use client";

import { useState } from "react";
import CarePlanEditor from "./care-plan-editor";
import { saveCarePlan, updateCarePlan } from "@/lib/service-users/actions";
import { CARE_PLAN_DAYS, type CarePlanEntry } from "@/lib/service-users/care-plan-consts";

/**
 * Care plan editing surface, shown inside the collapsible "Care Plan: Current".
 * With a plan set it shows a compact one-line-per-day summary; changes go through
 * "Update care plan", which starts a NEW dated version (the old plan is kept and
 * billed up to the day before the new one, so invoices split across the change).
 * With no plan yet it shows the editor to build the first one.
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

  // No plan yet: show the editor to build the first one.
  if (!hasPlan) {
    return (
      <CarePlanEditor
        mode="edit"
        action={saveCarePlan}
        serviceUserId={serviceUserId}
        initial={initial}
        servicesWithFixed={servicesWithFixed}
      />
    );
  }

  return (
    <div className="space-y-4">
      <CurrentPlanSummary entries={initial} />

      {!updating ? (
        <button type="button" onClick={() => setUpdating(true)} className="btn-outline text-sm">
          Update care plan
        </button>
      ) : (
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
      )}
    </div>
  );
}

/** Compact read-only view of the current plan: one line per day. */
function CurrentPlanSummary({ entries }: { entries: CarePlanEntry[] }) {
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
