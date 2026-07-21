"use client";

import { useActionState, useEffect, useState } from "react";
import { saveCarePlan } from "@/lib/service-users/actions";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import {
  CARE_PLAN_DAYS,
  CARE_PLAN_SERVICES,
  CARE_PLAN_UNITS,
  HANDED_OPTIONS,
  type CarePlanEntry,
} from "@/lib/service-users/care-plan-consts";

type Row = { day_of_week: number; service: string; unit: string; handed: string; quantity: string };

const DEFAULT_UNIT = "15m";

export default function CarePlanEditor({
  serviceUserId,
  initial,
  servicesWithFixed,
}: {
  serviceUserId: string;
  initial: CarePlanEntry[];
  servicesWithFixed: string[];
}) {
  const [state, formAction, pending] = useActionState(saveCarePlan, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  const [rows, setRows] = useState<Row[]>(
    initial.length
      ? initial.map((e) => ({
          day_of_week: e.day_of_week,
          service: e.service,
          unit: e.unit,
          handed: e.handed || "single",
          quantity: String(e.quantity),
        }))
      : [{ day_of_week: 0, service: "Care", unit: DEFAULT_UNIT, handed: "single", quantity: "1" }],
  );
  const [copyFrom, setCopyFrom] = useState(0);
  const [copyTo, setCopyTo] = useState(1);

  useEffect(() => {
    if (state.ok && !pending) flash();
  }, [state, pending, flash]);
  const showSaved = saved && !pending;

  function newRow(): Row {
    return { day_of_week: 0, service: "Care", unit: DEFAULT_UNIT, handed: "single", quantity: "1" };
  }

  function update(i: number, patch: Partial<Row>) {
    reset();
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r;
        const next = { ...r, ...patch };
        // When the service is changed to one that has a fixed rate, default its
        // unit to Fixed; when moving off a fixed-rate service, leave a duration.
        if (patch.service !== undefined) {
          if (servicesWithFixed.includes(patch.service)) next.unit = "Fixed";
          else if (next.unit === "Fixed") next.unit = DEFAULT_UNIT;
        }
        return next;
      }),
    );
  }
  function addRow() {
    reset();
    setRows((prev) => [...prev, newRow()]);
  }
  function removeRow(i: number) {
    reset();
    // Keep at least one row so a save can never silently wipe the plan.
    setRows((prev) => (prev.length === 1 ? [newRow()] : prev.filter((_, idx) => idx !== i)));
  }

  function copyDay(from: number, to: number) {
    if (from === to) return;
    reset();
    setRows((prev) => {
      const source = prev.filter((r) => r.day_of_week === from);
      if (source.length === 0) return prev;
      const kept = prev.filter((r) => r.day_of_week !== to);
      const copied = source.map((r) => ({ ...r, day_of_week: to }));
      return [...kept, ...copied];
    });
  }
  function copyToRestOfWeek(from: number) {
    reset();
    setRows((prev) => {
      const source = prev.filter((r) => r.day_of_week === from);
      if (source.length === 0) return prev;
      const result: Row[] = [...source];
      for (let d = 0; d < 7; d++) {
        if (d === from) continue;
        source.forEach((r) => result.push({ ...r, day_of_week: d }));
      }
      return result;
    });
  }

  const entriesJson = JSON.stringify(
    rows.map((r) => ({
      day_of_week: r.day_of_week,
      service: r.service,
      unit: r.unit,
      handed: r.handed,
      quantity: Number(r.quantity) || 0,
    })),
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="service_user_id" value={serviceUserId} />
      <input type="hidden" name="entries" value={entriesJson} />

      {/* Copy a day */}
      <div className="glass-card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="form-label">Copy</label>
          <select value={copyFrom} onChange={(e) => setCopyFrom(Number(e.target.value))} className="ctl-sm">
            {CARE_PLAN_DAYS.map((d, idx) => (
              <option key={d} value={idx}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">to</label>
          <select value={copyTo} onChange={(e) => setCopyTo(Number(e.target.value))} className="ctl-sm">
            {CARE_PLAN_DAYS.map((d, idx) => (
              <option key={d} value={idx}>{d}</option>
            ))}
          </select>
        </div>
        <button type="button" onClick={() => copyDay(copyFrom, copyTo)} className="btn-outline text-xs">
          Copy day
        </button>
        <button type="button" onClick={() => copyToRestOfWeek(copyFrom)} className="btn-outline text-xs">
          Copy {CARE_PLAN_DAYS[copyFrom]} to the rest of the week
        </button>
      </div>

      <div className="glass-card p-5">
        <div className="grid grid-cols-[1fr_1fr_1fr_1.2fr_0.8fr_1.5rem] items-center gap-2 text-center">
          <span className="text-xs uppercase tracking-wide text-white/45">Day</span>
          <span className="text-xs uppercase tracking-wide text-white/45">Service</span>
          <span className="text-xs uppercase tracking-wide text-white/45">Unit</span>
          <span className="text-xs uppercase tracking-wide text-white/45">Handed</span>
          <span className="text-xs uppercase tracking-wide text-white/45">Quantity</span>
          <span />

          {rows.map((r, i) => (
            <div key={i} className="contents">
              <select
                aria-label="Day"
                value={r.day_of_week}
                onChange={(e) => update(i, { day_of_week: Number(e.target.value) })}
                className="ctl-sm text-center"
              >
                {CARE_PLAN_DAYS.map((d, idx) => (
                  <option key={d} value={idx}>{d}</option>
                ))}
              </select>
              <select
                aria-label="Service"
                value={r.service}
                onChange={(e) => update(i, { service: e.target.value })}
                className="ctl-sm text-center"
              >
                {CARE_PLAN_SERVICES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select
                aria-label="Unit"
                value={r.unit}
                onChange={(e) => update(i, { unit: e.target.value })}
                className="ctl-sm text-center"
              >
                {CARE_PLAN_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              <select
                aria-label="Handed"
                value={r.handed}
                onChange={(e) => update(i, { handed: e.target.value })}
                className="ctl-sm text-center"
              >
                {HANDED_OPTIONS.map((h) => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </select>
              <input
                aria-label="Quantity"
                type="text"
                inputMode="decimal"
                value={r.quantity}
                onChange={(e) => update(i, { quantity: e.target.value })}
                className="ctl-sm text-center"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="text-white/40 hover:text-red-300"
                aria-label="Remove row"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <button type="button" onClick={addRow} className="btn-outline text-xs">Add row</button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={`btn ${showSaved ? "btn-saved" : "btn-primary"}`}>
          {pending ? "Saving…" : showSaved ? "Saved" : "Save care plan"}
        </button>
        {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
      </div>
    </form>
  );
}
