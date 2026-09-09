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

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { ukDate } from "@/lib/dates";
import type { PackageLineValue } from "@/lib/form-schema";

type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export default function CarePlanEditor({
  serviceUserId,
  initial,
  servicesWithFixed,
  action,
  mode = "edit",
  today,
  currentFrom = null,
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
  /** The date the schedule on screen started, so the confirmation can say whether saving
   *  corrects that version or supersedes it. Null when there is no schedule yet. */
  currentFrom?: string | null;
  /** Called after a successful save (used to collapse the editor). */
  onSaved?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  const [effectiveFrom, setEffectiveFrom] = useState(today ?? "");
  const [asking, setAsking] = useState(false);
  const [mounted, setMounted] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  useEffect(() => setMounted(true), []);
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

  /* WHAT SAVING WILL ACTUALLY DO, said back before it happens (Phil, 2026-09-09: "when
     clicking save schedule i want a pop up confirming the date the new schedule starts").
     The same button either corrects the version on screen or supersedes it, and which one
     depends entirely on a date field further up the page. A confirmation that names the date
     and says which of the two it is turns a silent difference into a decision. */
  const correcting = mode === "update" && !!currentFrom && effectiveFrom === currentFrom;
  const dayBefore = (iso: string): string => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 1);
    return dt.toISOString().slice(0, 10);
  };

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="service_user_id" value={serviceUserId} />
      <input type="hidden" name="entries" value={entriesJson} />

      {mode === "update" ? (
        <div className="rounded-xl border border-gold-400/40 bg-gold-400/10 p-5">
          <label htmlFor="cp-effective" className="text-sm font-semibold text-gold-300">
            This schedule starts on
          </label>
          <input
            id="cp-effective"
            name="effective_from"
            type="date"
            value={effectiveFrom}
            required
            className="mt-2 block max-w-[12rem]"
            onChange={(e) => {
              setEffectiveFrom(e.target.value);
              reset();
            }}
          />
          <p className="form-hint mt-2">
            Keep the date the current schedule started and this CORRECTS it. Choose a later date
            and the current schedule is kept and billed up to the day before, with this one
            applying from the date chosen. An invoice straddling the date bills part on each.
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
        {/* A confirming button is NOT a submit button (the lesson in components/action-form).
            It asks, and on Yes it submits the form on purpose, so there is no default path
            left to replay when the dialog closes. */}
        <button
          type={mode === "update" ? "button" : "submit"}
          disabled={pending}
          onClick={mode === "update" ? () => setAsking(true) : undefined}
          className={`btn ${showSaved ? "btn-saved" : "btn-primary"}`}
        >
          {pending
            ? "Saving…"
            : showSaved
              ? "Saved"
              : mode === "update" ? "Save schedule" : "Save care plan"}
        </button>
        {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
      </div>

      {/* PORTALLED TO THE BODY, for the reason action-form.tsx records: rendered in place the
          fixed inset-0 scrim resolves against the nearest ancestor with a backdrop-filter, and
          .glass-card has one, so the dialog centres itself halfway down the card. */}
      {asking && mounted
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Confirm the schedule date"
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
              onClick={() => setAsking(false)}
            >
              <div
                className="w-full max-w-md rounded-2xl border border-white/10 bg-navy-900 p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-lg font-semibold text-white">
                  {correcting ? "Correct this schedule?" : "Start this schedule?"}
                </h2>
                <p className="mt-2 text-sm text-white/70">
                  {correcting ? (
                    <>
                      This corrects the schedule that started on{" "}
                      <span className="font-semibold text-white">{ukDate(effectiveFrom)}</span>.
                      Anything already invoiced on it is recalculated on the corrected schedule.
                    </>
                  ) : (
                    <>
                      This schedule starts on{" "}
                      <span className="font-semibold text-white">{ukDate(effectiveFrom)}</span>.
                      {currentFrom
                        ? ` The current schedule is kept and billed up to ${ukDate(dayBefore(effectiveFrom))}.`
                        : ""}
                    </>
                  )}
                </p>
                <div className="mt-5 flex items-center gap-3">
                  {/* Deliberately NOT autoFocus: a held Enter on the trigger would repeat
                      straight onto this one and confirm a date nobody read. */}
                  <button
                    type="button"
                    onClick={() => {
                      setAsking(false);
                      formRef.current?.requestSubmit();
                    }}
                    className="btn-primary px-4 py-2 text-sm"
                  >
                    Yes, save it
                  </button>
                  <button
                    type="button"
                    onClick={() => setAsking(false)}
                    className="btn-ghost px-4 py-2 text-sm"
                  >
                    No, go back
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </form>
  );
}
