"use client";

import { useState } from "react";
import CarePlanEditor from "./care-plan-editor";
import { saveCarePlan, updateCarePlan } from "@/lib/service-users/actions";
import { CARE_PLAN_DAYS, type CarePlanEntry } from "@/lib/service-users/care-plan-consts";

/**
 * The "Care Plan: Current" area. The collapsible tile shows a compact
 * one-line-per-day summary. "Update care plan" (top right, level with the title)
 * offers two paths: CHANGE CURRENT (fix the current plan in place, no new version)
 * or CREATE NEW (a dated new version; the old plan is kept and billed up to the
 * day before the new one). With no plan yet the tile holds the editor to build it.
 */
type Mode = null | "choose" | "edit" | "new";

export default function CarePlanManager({
  serviceUserId,
  serviceUserName,
  initial,
  servicesWithFixed,
  today,
  hasPlan,
}: {
  serviceUserId: string;
  serviceUserName: string;
  initial: CarePlanEntry[];
  servicesWithFixed: string[];
  today: string;
  hasPlan: boolean;
}) {
  const [mode, setMode] = useState<Mode>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Care plan</h1>
          <p className="page-subtitle">{serviceUserName}</p>
        </div>
        {hasPlan && !mode ? (
          <button type="button" onClick={() => setMode("choose")} className="btn-outline text-sm">
            Update care plan
          </button>
        ) : null}
      </div>

      <details className="glass-card p-5" open={!hasPlan}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
          <span className="text-sm font-semibold text-white/80">Care Plan: Current</span>
          <span className="text-xs text-white/45">Show</span>
        </summary>
        <div className="mt-4">
          {hasPlan ? (
            <CurrentPlanSummary entries={initial} />
          ) : (
            <CarePlanEditor
              mode="edit"
              action={saveCarePlan}
              serviceUserId={serviceUserId}
              initial={initial}
              servicesWithFixed={servicesWithFixed}
            />
          )}
        </div>
      </details>

      {mode === "choose" ? (
        <section className="glass-card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/80">Update care plan</h2>
            <button type="button" onClick={() => setMode(null)} className="text-xs text-white/50 hover:text-white/80">
              Cancel
            </button>
          </div>
          <p className="text-xs text-white/55">
            Correct the current plan, or start a new plan from a date and keep the old one for past invoices?
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setMode("edit")} className="btn-outline text-sm">
              Change current plan
            </button>
            <button type="button" onClick={() => setMode("new")} className="btn-primary text-sm">
              Create new version
            </button>
          </div>
        </section>
      ) : null}

      {mode === "edit" ? (
        <section className="glass-card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/80">Change current plan</h2>
            <button type="button" onClick={() => setMode(null)} className="text-xs text-white/50 hover:text-white/80">
              Cancel
            </button>
          </div>
          <p className="text-xs text-white/55">
            This corrects the current plan in place. No new version is created.
          </p>
          <CarePlanEditor
            mode="edit"
            action={saveCarePlan}
            serviceUserId={serviceUserId}
            initial={initial}
            servicesWithFixed={servicesWithFixed}
            onSaved={() => setMode(null)}
          />
        </section>
      ) : null}

      {mode === "new" ? (
        <section className="glass-card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/80">Create new version</h2>
            <button type="button" onClick={() => setMode(null)} className="text-xs text-white/50 hover:text-white/80">
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
            onSaved={() => setMode(null)}
          />
        </section>
      ) : null}
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
    <div className="divide-y divide-white/5">
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
