"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { updateCheckDefinition } from "@/lib/people/actions";
import { recurrenceLabel } from "@/lib/people/logic";
import { useSavedFlash } from "@/lib/use-saved-flash";
import type { CheckDefinition } from "@/lib/people/types";

/**
 * One slot in the card grid. Every check renders the SAME four slots in the same
 * order (Schedule, interval, Amber, Reporting deadline), so the number boxes line
 * up down the page whatever shape a check is. The input sits at the bottom of the
 * slot (mt-auto) so a label that wraps never pushes one box out of line.
 */
function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="form-label">
          {label}
        </label>
      ) : (
        <span className="form-label">{label}</span>
      )}
      <div className="mt-auto">{children}</div>
    </div>
  );
}

/** A read-only slot value. Same box as a control so the grid stays square. */
function StaticValue({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white/50">
      {children}
    </div>
  );
}

/**
 * Not a <form action> on purpose: React 19 auto-resets action forms, which was
 * snapping the Schedule dropdown back to a stale value. We hold the values in state
 * and save on click, so a selection can never revert.
 */
export default function CheckConfigForm({ def }: { def: CheckDefinition }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, flash, reset] = useSavedFlash();
  const [error, setError] = useState<string | null>(null);

  const [active, setActive] = useState(def.active);
  /* A one-off check is due BEFORE its anchor, so the box asks for a plain positive
     number of days and the sign is put back on save. The stored interval keeps its old
     meaning (a signed offset), so only the words and the sign change. */
  const [days, setDays] = useState(
    String(def.recurring ? (def.interval ?? 90) : Math.abs(def.interval ?? 1)),
  );
  const [amber, setAmber] = useState(def.amber_days != null ? String(def.amber_days) : "");
  const [reportingDays, setReportingDays] = useState(
    def.reporting_interval_days != null ? String(def.reporting_interval_days) : "",
  );
  const [flagDays, setFlagDays] = useState(String(def.amber_days ?? 30));
  const [scheduleMode, setScheduleMode] = useState<string>(def.schedule_mode);

  const isExpiry = def.anchor === "expiry";
  const isAppraisal = def.key === "appraisal" && !isExpiry;
  const afterSup3 = isAppraisal && scheduleMode === "after_sup3";

  function save() {
    const fd = new FormData();
    fd.set("definition_id", def.id);
    fd.set("anchor", def.anchor);
    if (active) fd.set("active", "on");
    if (isExpiry) {
      fd.set("flag_days", flagDays);
    } else {
      fd.set("days", def.recurring ? days : String(-Math.abs(Number.parseInt(days, 10) || 1)));
      fd.set("amber_days", amber);
      fd.set("reporting_days", reportingDays);
      fd.set("schedule_mode", scheduleMode);
      fd.set("recurring", def.recurring ? "1" : "0");
    }
    startTransition(async () => {
      const res = await updateCheckDefinition(fd);
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

  /** Slot 1 — how the check is scheduled. */
  const scheduleSlot = isAppraisal ? (
    <Field label="Schedule" htmlFor={`sched-${def.id}`}>
      <select
        id={`sched-${def.id}`}
        value={scheduleMode}
        onChange={(e) => {
          setScheduleMode(e.target.value);
          reset();
        }}
      >
        <option value="interval">Yearly</option>
        <option value="after_sup3">After Supervision 3</option>
      </select>
    </Field>
  ) : (
    <Field label="Schedule">
      <StaticValue>
        {isExpiry
          ? "On document expiry"
          : def.schedule_mode === "ad_hoc"
            ? "Ad hoc"
            : def.recurring
              ? "Fixed interval"
              : "One off"}
      </StaticValue>
    </Field>
  );

  /** Slot 2 — the interval the check runs on. */
  const intervalSlot = isExpiry ? (
    <Field label="Every (days)">
      <StaticValue>From the expiry date</StaticValue>
    </Field>
  ) : afterSup3 ? (
    <Field label="Every (days)">
      <StaticValue>3 &times; Supervision</StaticValue>
    </Field>
  ) : (
    <Field
      label={def.recurring ? "Every (days)" : "Due before start (days)"}
      htmlFor={`days-${def.id}`}
    >
      <input
        id={`days-${def.id}`}
        type="number"
        min={1}
        value={days}
        onChange={(e) => {
          setDays(e.target.value);
          reset();
        }}
      />
    </Field>
  );

  /** Slot 3 — the amber window. For an expiry check this is the only number. */
  const amberSlot = isExpiry ? (
    <Field label="Amber (days before expiry)" htmlFor={`flag-${def.id}`}>
      <input
        id={`flag-${def.id}`}
        type="number"
        min={0}
        value={flagDays}
        onChange={(e) => {
          setFlagDays(e.target.value);
          reset();
        }}
      />
    </Field>
  ) : (
    <Field label="Amber (days before due)" htmlFor={`amber-${def.id}`}>
      <input
        id={`amber-${def.id}`}
        type="number"
        min={0}
        value={amber}
        placeholder="Default 30"
        onChange={(e) => {
          setAmber(e.target.value);
          reset();
        }}
      />
    </Field>
  );

  /** Slot 4 — the reporting deadline, on recurring completion checks only. */
  const reportingSlot =
    !isExpiry && def.recurring ? (
      <Field label="Reporting deadline (days)" htmlFor={`report-${def.id}`}>
        <input
          id={`report-${def.id}`}
          type="number"
          min={1}
          value={reportingDays}
          placeholder="Same as interval"
          onChange={(e) => {
            setReportingDays(e.target.value);
            reset();
          }}
        />
      </Field>
    ) : (
      <Field label="Reporting deadline (days)">
        <StaticValue>Not used</StaticValue>
      </Field>
    );

  const hints: string[] = [];
  if (afterSup3) {
    hints.push("Scheduled from the Supervision interval (3 \u00d7 Supervision days).");
  }
  if (!isExpiry && !def.recurring) {
    hints.push(
      "A one off check is due before the start date, so 1 means the day before care begins.",
    );
  }
  if (!isExpiry && def.recurring) {
    hints.push(
      "Reporting deadline: the regulatory deadline for the on time report (e.g. 90 for three monthly). Leave blank to grade against the interval. It does not change the register.",
    );
  }

  return (
    <div className="glass-card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">{def.name}</h2>
          <p className="text-[11px] text-white/45">{recurrenceLabel(def)}</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-white/80">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => {
              setActive(e.target.checked);
              reset();
            }}
          />
          Active
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {scheduleSlot}
        {intervalSlot}
        {amberSlot}
        {reportingSlot}
      </div>

      {hints.length > 0 ? (
        <div className="mt-3 space-y-1">
          {hints.map((h) => (
            <p key={h} className="form-hint mt-0">
              {h}
            </p>
          ))}
        </div>
      ) : null}

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
