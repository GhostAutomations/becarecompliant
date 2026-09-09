"use client";

/**
 * Be Care Compliant — editing a service user's weekly care plan.
 *
 * REBUILT 2026-09-09 (Phil, of the old grid: "that is awful"). It was a row per call per day
 * with a Day dropdown on every line, and it had drifted: the header row still said Handed over
 * a When column and had six labels above seven controls, so every heading sat over the wrong
 * thing. Seven identical morning calls were seven rows to keep in step by hand.
 *
 * It is now THE SAME CONTROL as the Setup Visit's care package: a line per repeating call —
 * service, which days, when, how long, how many carers, how many times. One way of describing
 * a package, learned once, whether it is written at the visit or corrected here a year later.
 *
 * A plan written the old way still opens: linesFromRows folds rows that agree on everything
 * but the day back into the line that made them, and packageRows expands them again on save.
 * The round trip is unit tested, because it is what stands between an edit and somebody's bill.
 */

import { useActionState, useEffect, useState } from "react";
import { IDLE_STATE, type ActionState } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import CarePackageField from "@/components/forms/care-package-field";
import {
  CARE_PLAN_SERVICES,
  CARE_PLAN_UNITS,
  CARERS_OPTIONS,
  carersOf,
  type CarePlanEntry,
} from "@/lib/service-users/care-plan-consts";
import { linesFromRows, packageRows, parsePackage } from "@/lib/service-users/care-package";
import type { PackageLineValue } from "@/lib/form-schema";

type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export default function CarePlanEditor({
  serviceUserId,
  initial,
  servicesWithFixed,
  action,
  mode = "edit",
  today,
  onSaved,
}: {
  serviceUserId: string;
  initial: CarePlanEntry[];
  servicesWithFixed: string[];
  action: ServerAction;
  /** "edit" fixes the current plan in place; "update" starts a new dated version. */
  mode?: "edit" | "update";
  /** Default effective date for update mode (today, YYYY-MM-DD). */
  today?: string;
  /** Called after a successful save (used to collapse the editor). */
  onSaved?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  const [lines, setLines] = useState<PackageLineValue[]>(() =>
    linesFromRows(
      initial.map((e) => ({
        day_of_week: e.day_of_week,
        service: e.service,
        unit: e.unit,
        slot: e.slot,
        carers: carersOf(e.carers, e.handed),
        quantity: Number(e.quantity),
      })),
    ),
  );

  useEffect(() => {
    if (state.ok && !pending) {
      flash();
      onSaved?.();
    }
  }, [state, pending, flash, onSaved]);
  const showSaved = saved && !pending;

  /* The action still takes the weekly ROWS: the package is how it is edited, the plan is how
     it is stored and billed, so it is expanded here and the server side is untouched. Parsed
     through the same rules the setup visit uses, so a line the plan could not store is dropped
     here too rather than saved and priced at nothing. */
  const entriesJson = JSON.stringify(
    packageRows(
      parsePackage(lines, { services: CARE_PLAN_SERVICES, units: CARE_PLAN_UNITS }),
    ).map((r) => ({
      day_of_week: r.day_of_week,
      service: r.service,
      unit: r.unit,
      slot: r.slot,
      carers: r.carers,
      quantity: r.quantity,
    })),
  );

  const fixedNote =
    servicesWithFixed.length > 0
      ? `${servicesWithFixed.join(", ")} can be billed at a fixed fee: choose Fixed as the length.`
      : null;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="service_user_id" value={serviceUserId} />
      <input type="hidden" name="entries" value={entriesJson} />

      {mode === "update" ? (
        <div className="rounded-xl border border-gold-400/40 bg-gold-400/10 p-5">
          <label htmlFor="cp-effective" className="text-sm font-semibold text-gold-300">
            New plan starts on
          </label>
          <input
            id="cp-effective"
            name="effective_from"
            type="date"
            defaultValue={today}
            required
            className="mt-2 block max-w-[12rem]"
            onChange={reset}
          />
          <p className="form-hint mt-2">
            This creates a NEW dated version. The current plan is kept and billed up to the day
            before; this plan applies from this date. Invoices that straddle the date bill part
            on each plan.
          </p>
        </div>
      ) : null}

      <div className="glass-card p-5">
        <CarePackageField
          value={lines}
          services={CARE_PLAN_SERVICES}
          units={CARE_PLAN_UNITS}
          carersOptions={CARERS_OPTIONS}
          disabled={pending}
          onChange={(next) => {
            reset();
            setLines(next);
          }}
        />
        {fixedNote ? <p className="form-hint mt-3">{fixedNote}</p> : null}
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={`btn ${showSaved ? "btn-saved" : "btn-primary"}`}>
          {pending
            ? "Saving…"
            : showSaved
              ? mode === "update" ? "Started" : "Saved"
              : mode === "update" ? "Start new plan" : "Save care plan"}
        </button>
        {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
      </div>
    </form>
  );
}
