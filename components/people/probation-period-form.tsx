"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProbationPeriod } from "@/lib/people/actions";
import { useSavedFlash } from "@/lib/use-saved-flash";
import {
  PROBATION_UNITS,
  type ProbationPeriod,
  type ProbationUnit,
  probationLabel,
} from "@/lib/people/probation";

/**
 * The company probationary period, written the way the employment contract writes
 * it: a number and a unit. Months are stored as months, not converted to days, so
 * three months from 30 November is 28 February.
 */
export default function ProbationPeriodForm({ period }: { period: ProbationPeriod }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, flash, reset] = useSavedFlash();
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(String(period.value));
  const [unit, setUnit] = useState<ProbationUnit>(period.unit);

  function save() {
    const fd = new FormData();
    fd.set("probation_period_value", value);
    fd.set("probation_period_unit", unit);
    startTransition(async () => {
      const res = await updateProbationPeriod(fd);
      if (res.error) {
        setError(res.error);
        reset();
      } else {
        setError(null);
        flash();
        router.refresh();
      }
    });
  }

  const parsedValue = Number.parseInt(value, 10);
  const preview =
    Number.isInteger(parsedValue) && parsedValue > 0
      ? probationLabel({ value: parsedValue, unit })
      : null;

  return (
    <div className="glass-card p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col">
          <label htmlFor="probation_period_value" className="form-label">
            Probationary period
          </label>
          <div className="mt-auto">
            <input
              id="probation_period_value"
              type="number"
              min={1}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                reset();
              }}
            />
          </div>
        </div>

        <div className="flex flex-col">
          <label htmlFor="probation_period_unit" className="form-label">
            Counted in
          </label>
          <div className="mt-auto">
            <select
              id="probation_period_unit"
              value={unit}
              onChange={(e) => {
                setUnit(e.target.value as ProbationUnit);
                reset();
              }}
            >
              {PROBATION_UNITS.map((u) => (
                <option key={u.unit} value={u.unit}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <p className="form-hint">
        {preview ? `A new carer's probation ends ${preview} after their start date. ` : null}
        Changing this does not affect carers already added.
      </p>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
        <p className="form-error mt-0" role="alert">
          {error ?? ""}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className={`${saved ? "btn-saved" : "btn-primary"} shrink-0 px-4 py-2 text-sm`}
        >
          {pending ? "Saving\u2026" : saved ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
