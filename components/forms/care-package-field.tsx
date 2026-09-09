"use client";

/**
 * Be Care Compliant — the care package builder, inside the Setup Visit.
 *
 * Phil, 2026-09-09: "i want it done at setup visit so it isnt lost". The four fixed call slots
 * this replaces could not say what a real package says — more than four calls, a Tuesday only
 * sitting service, a shop on a Friday — and everything they could not say was lost between the
 * visit and somebody typing the weekly grid a week later.
 *
 * ONE ROW IS ONE RECURRING CALL: what service, which days, which part of the day, how long, how
 * many carers. Add as many as the package takes. The days are ticked per row, so no two days
 * have to be alike, and two rows in the same slot are two visits rather than a contradiction.
 *
 * Shaped after Birdie's visit schedule, because that is the model the sector uses: part of the
 * day rather than a clock time, and carers as a number up to four. What is deliberately absent
 * is everything that belongs to rostering rather than billing — no times, no carer allocation,
 * no runs. Those are Phase 14.
 *
 * The answer is the rows. Completing the form freezes them into the Evidence and writes the
 * weekly Care Plan, which is what Invoicing bills from.
 */

import { CALL_SLOTS, PACKAGE_DAYS } from "@/lib/service-users/care-package";
import type { PackageLineValue } from "@/lib/form-schema";

type Line = {
  service: string;
  days: number[];
  slot: string;
  unit: string;
  carers: number;
  /** How many times this call happens on each of its days. Almost always 1. */
  quantity: number;
};

export default function CarePackageField({
  value,
  services,
  units,
  carersOptions,
  disabled,
  onChange,
}: {
  value: PackageLineValue[];
  services: readonly string[];
  units: readonly string[];
  carersOptions: readonly { value: number; label: string }[];
  disabled?: boolean;
  onChange: (lines: PackageLineValue[]) => void;
}) {
  const lines: Line[] = value.map((l) => ({
    service: String(l.service ?? services[0] ?? "Care"),
    days: Array.isArray(l.days) ? l.days.map(Number).filter((d) => d >= 0 && d <= 6) : [],
    slot: String(l.slot ?? "morning"),
    unit: String(l.unit ?? units[0] ?? "30m"),
    carers: Number(l.carers ?? 1),
    quantity: Number(l.quantity ?? 1) || 1,
  }));

  function update(index: number, patch: Partial<Line>) {
    onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLine() {
    /* A new call starts on every day, because most do, and unticking is quicker than ticking
       seven boxes. */
    onChange([
      ...lines,
      {
        service: services[0] ?? "Care",
        days: [0, 1, 2, 3, 4, 5, 6],
        slot: "morning",
        unit: units[0] ?? "30m",
        carers: 1,
        quantity: 1,
      },
    ]);
  }

  function removeLine(index: number) {
    onChange(lines.filter((_, i) => i !== index));
  }

  function toggleDay(index: number, day: number) {
    const line = lines[index];
    const days = line.days.includes(day)
      ? line.days.filter((d) => d !== day)
      : [...line.days, day].sort((a, b) => a - b);
    update(index, { days });
  }

  const totalCalls = lines.reduce((n, l) => n + l.days.length * l.quantity, 0);

  return (
    <div className="mt-1 space-y-3">
      {lines.length === 0 ? (
        <p className="text-sm text-white/50">
          No calls yet. Add one for each visit that repeats — the morning call, the tea call, a
          sit on a Tuesday.
        </p>
      ) : null}

      {lines.map((line, i) => (
        <div key={i} className="rounded-xl border border-white/10 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="form-label" htmlFor={`pkg-${i}-service`}>Service</label>
              <select
                id={`pkg-${i}-service`}
                value={line.service}
                disabled={disabled}
                onChange={(e) => update(i, { service: e.target.value })}
              >
                {services.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" htmlFor={`pkg-${i}-slot`}>When</label>
              <select
                id={`pkg-${i}-slot`}
                value={line.slot}
                disabled={disabled}
                onChange={(e) => update(i, { slot: e.target.value })}
              >
                {CALL_SLOTS.map((s) => (
                  <option key={s.value} value={s.value}>{`${s.label} (${s.hint})`}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" htmlFor={`pkg-${i}-unit`}>How long</label>
              <select
                id={`pkg-${i}-unit`}
                value={line.unit}
                disabled={disabled}
                onChange={(e) => update(i, { unit: e.target.value })}
              >
                {units.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" htmlFor={`pkg-${i}-carers`}>Carers</label>
              <select
                id={`pkg-${i}-carers`}
                value={line.carers}
                disabled={disabled}
                onChange={(e) => update(i, { carers: Number(e.target.value) })}
              >
                {carersOptions.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Times a day: the weekly grid has always allowed a call to happen more than
                once on a day, so the builder has to be able to say it too or editing an
                existing plan would quietly halve somebody's bill. */}
            <div>
              <label className="form-label" htmlFor={`pkg-${i}-times`}>Times a day</label>
              <input
                id={`pkg-${i}-times`}
                type="number"
                min={1}
                max={24}
                step={1}
                value={line.quantity}
                disabled={disabled}
                onChange={(e) => update(i, { quantity: Number(e.target.value) || 1 })}
                className="w-20"
              />
            </div>

            <button
              type="button"
              onClick={() => removeLine(i)}
              disabled={disabled}
              className="btn-ghost ml-auto text-xs"
            >
              Remove
            </button>
          </div>

          <div className="mt-3">
            <p className="form-label">Days</p>
            <div className="flex flex-wrap gap-1.5">
              {PACKAGE_DAYS.map((d) => {
                const on = line.days.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    disabled={disabled}
                    aria-pressed={on}
                    onClick={() => toggleDay(i, d.value)}
                    className={
                      on
                        ? "rounded-lg bg-gold-400 px-3 py-1.5 text-xs font-semibold text-navy-950"
                        : "rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/55 hover:bg-white/5"
                    }
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            {line.days.length === 0 ? (
              <p className="form-hint text-rag-red-soft">
                Pick at least one day, or remove this call.
              </p>
            ) : null}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={addLine} disabled={disabled} className="btn-outline text-xs">
          Add a call
        </button>
        <span className="form-hint">
          {totalCalls === 0
            ? "Nothing scheduled yet."
            : `${totalCalls} ${totalCalls === 1 ? "call" : "calls"} a week. This becomes the weekly Care Plan and is what invoices are built from.`}
        </span>
      </div>
    </div>
  );
}
