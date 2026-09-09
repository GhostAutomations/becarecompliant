"use client";

/**
 * Be Care Compliant — the care schedule as it stands, shown but not asked.
 *
 * Phil, 2026-09-09, on the Individual Plan Review: the form used to ask the reviewer to
 * tick which call durations the person had and then type the days and times of each one
 * into eight free text boxes. The office already knows the answer — it is the schedule
 * Invoicing bills from — so the review was asking somebody at a kitchen table to retype
 * data we hold, and any difference between the two silently became a new truth.
 *
 * So the review now SHOWS the schedule and asks one question: does this match? A No is
 * worth more than a retyped box, because it is a disagreement between the record and the
 * doorstep, which is exactly what a review exists to find.
 *
 * Worded like the care schedule tile on the record ("Morning: Care - 45m - Double
 * Handed"), so the reviewer is reading the same sentence in both places.
 */

import { CALL_SLOTS, PACKAGE_DAYS, parsePackage } from "@/lib/service-users/care-package";
import {
  CARE_PLAN_SERVICES,
  CARE_PLAN_UNITS,
  carersLabel,
} from "@/lib/service-users/care-plan-consts";
import type { PackageLineValue } from "@/lib/form-schema";

function slotLabel(slot: string): string {
  return CALL_SLOTS.find((s) => s.value === slot)?.label ?? slot;
}

function daysLabel(days: ReadonlyArray<number>): string {
  if (days.length === PACKAGE_DAYS.length) return "Every day";
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => PACKAGE_DAYS[d]?.label ?? String(d))
    .join(", ");
}

export default function CarePackageSummary({ value }: { value: PackageLineValue[] }) {
  const lines = parsePackage(value, {
    services: [...CARE_PLAN_SERVICES],
    units: [...CARE_PLAN_UNITS],
  });

  if (lines.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/55">
        No care schedule is recorded for this person. Add one from the record, or say below
        what the calls actually are.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {lines.map((line, i) => (
        <div key={i} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-sm text-white/85">
            <span className="inline-block w-20 text-white/55">{slotLabel(line.slot)}:</span>
            {line.service} - {line.unit} - {carersLabel(line.carers)}
            {line.quantity > 1 ? ` - ${line.quantity} times a day` : ""}
          </p>
          <p className="mt-1 text-xs text-white/45">{daysLabel(line.days)}</p>
        </div>
      ))}
    </div>
  );
}
