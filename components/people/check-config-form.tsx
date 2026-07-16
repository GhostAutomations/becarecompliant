"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCheckDefinition } from "@/lib/people/actions";
import { recurrenceLabel } from "@/lib/people/logic";
import type { CheckDefinition } from "@/lib/people/types";

/**
 * Not a <form action> on purpose: React 19 auto-resets action forms, which was
 * snapping the Schedule dropdown back to a stale value. We hold the values in state
 * and save on click, so a selection can never revert.
 */
export default function CheckConfigForm({
  def,
  forms = [],
}: {
  def: CheckDefinition;
  forms?: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [active, setActive] = useState(def.active);
  const [formId, setFormId] = useState(def.form_id ?? "");
  const [days, setDays] = useState(String(def.interval ?? 90));
  const [amber, setAmber] = useState(def.amber_days != null ? String(def.amber_days) : "");
  const [reportingDays, setReportingDays] = useState(
    def.reporting_interval_days != null ? String(def.reporting_interval_days) : "",
  );
  const [flagDays, setFlagDays] = useState(String(def.amber_days ?? 30));
  const [scheduleMode, setScheduleMode] = useState<string>(def.schedule_mode);

  const isExpiry = def.anchor === "expiry";

  function save() {
    const fd = new FormData();
    fd.set("definition_id", def.id);
    fd.set("anchor", def.anchor);
    fd.set("form_id", formId);
    if (active) fd.set("active", "on");
    if (isExpiry) {
      fd.set("flag_days", flagDays);
    } else {
      fd.set("days", days);
      fd.set("amber_days", amber);
      fd.set("reporting_days", reportingDays);
      fd.set("schedule_mode", scheduleMode);
      fd.set("recurring", def.recurring ? "1" : "0");
    }
    startTransition(async () => {
      const res = await updateCheckDefinition(fd);
      if (res.error) {
        setError(res.error);
        setSaved(false);
      } else {
        setError(null);
        setSaved(true);
        router.refresh();
      }
    });
  }

  const saveButton = (
    <button
      type="button"
      onClick={save}
      disabled={pending}
      className={`btn ${saved ? "btn-saved" : "btn-outline"} text-xs`}
    >
      {pending ? "Saving…" : saved ? "Saved" : "Save"}
    </button>
  );

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
              setSaved(false);
            }}
          />
          Active
        </label>
      </div>

      {forms.length > 0 ? (
        <div className="mb-4">
          <label htmlFor={`form-${def.id}`} className="form-label">Form completed for this check</label>
          <select
            id={`form-${def.id}`}
            value={formId}
            onChange={(e) => {
              setFormId(e.target.value);
              setSaved(false);
            }}
            className="max-w-sm"
          >
            <option value="">None</option>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <p className="form-hint">
            Swap the form this check uses. Past evidence keeps the form it was completed on.
          </p>
        </div>
      ) : null}

      {isExpiry ? (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor={`flag-${def.id}`} className="form-label">
              Flag this many days before the recorded expiry
            </label>
            <input
              id={`flag-${def.id}`}
              type="number"
              min={0}
              value={flagDays}
              onChange={(e) => {
                setFlagDays(e.target.value);
                setSaved(false);
              }}
              className="max-w-[8rem]"
            />
          </div>
          {saveButton}
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-4">
          {def.key === "appraisal" ? (
            <div>
              <label htmlFor={`sched-${def.id}`} className="form-label">Schedule</label>
              <select
                id={`sched-${def.id}`}
                value={scheduleMode}
                onChange={(e) => {
                  setScheduleMode(e.target.value);
                  setSaved(false);
                }}
              >
                <option value="interval">Yearly</option>
                <option value="after_sup3">After Supervision 3</option>
              </select>
            </div>
          ) : null}

          {def.key === "appraisal" && scheduleMode === "after_sup3" ? (
            <p className="form-hint max-w-[14rem]">
              Scheduled from the Supervision interval (3 × Supervision days).
            </p>
          ) : (
            <div>
              <label htmlFor={`days-${def.id}`} className="form-label">
                {def.recurring ? "Every (days)" : "Due after start (days)"}
              </label>
              <input
                id={`days-${def.id}`}
                type="number"
                min={def.recurring ? 1 : undefined}
                value={days}
                onChange={(e) => {
                  setDays(e.target.value);
                  setSaved(false);
                }}
                className="max-w-[8rem]"
              />
              {!def.recurring ? (
                <p className="form-hint">Use a negative number for before the start date, e.g. -1.</p>
              ) : null}
            </div>
          )}

          <div>
            <label htmlFor={`amber-${def.id}`} className="form-label">Amber (days before due)</label>
            <input
              id={`amber-${def.id}`}
              type="number"
              min={0}
              value={amber}
              placeholder="Default 30"
              onChange={(e) => {
                setAmber(e.target.value);
                setSaved(false);
              }}
              className="max-w-[8rem]"
            />
          </div>

          {def.recurring ? (
            <div>
              <label htmlFor={`report-${def.id}`} className="form-label">
                Reporting deadline (days)
              </label>
              <input
                id={`report-${def.id}`}
                type="number"
                min={1}
                value={reportingDays}
                placeholder="Same as interval"
                onChange={(e) => {
                  setReportingDays(e.target.value);
                  setSaved(false);
                }}
                className="max-w-[8rem]"
              />
              <p className="form-hint max-w-[14rem]">
                Regulatory deadline for the on time report (e.g. 90 for three monthly). Leave blank
                to grade against the interval. Does not change the register.
              </p>
            </div>
          ) : null}
          {saveButton}
        </div>
      )}

      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
