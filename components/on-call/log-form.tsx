"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createLog, updateLog, saveLogDraft } from "@/lib/on-call/actions";
import { IDLE_STATE } from "@/lib/forms";
import type { BranchOption, OnCallLog, RotaScope } from "@/lib/on-call/types";

type ShiftChoice = { value: string; label: string };

export default function LogForm({
  scope,
  branches,
  shiftChoices,
  defaultShift,
  log,
  draft,
}: {
  scope: RotaScope;
  branches: BranchOption[];
  shiftChoices: ShiftChoice[];
  defaultShift: string;
  log?: OnCallLog;
  /** Present on the new-call page: prefill from saved draft + autosave. */
  draft?: Record<string, string> | null;
}) {
  const editing = !!log;
  const draftEnabled = !editing && draft !== undefined;
  const d = draft ?? {};
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finaliseRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(editing ? updateLog : createLog, IDLE_STATE);
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (state.ok) setConfirming(false); }, [state.ok]);
  useEffect(() => { if (state.ok && !pending) setSaved(true); }, [state.ok, pending]);

  const dv = (key: string, fallback = "") => (editing ? fallback : d[key] ?? fallback);
  const shiftValue = editing ? `${log?.slot}|${log?.shift_date}` : d.shift || defaultShift;
  const branchValue = editing ? (log?.branch_id ?? "") : (d.branch_id ?? (branches.length === 1 ? branches[0].id : ""));
  const yesNo = (key: string, on: boolean) => (editing ? (on ? "yes" : "no") : d[key] ?? "no");

  function onChange() {
    setSaved(false);
    if (!draftEnabled || !formRef.current) return;
    if (timer.current) clearTimeout(timer.current);
    const fd = new FormData(formRef.current);
    const obj: Record<string, string> = {};
    fd.forEach((v, k) => {
      if (k === "id" || typeof v !== "string") return;
      obj[k] = v;
    });
    timer.current = setTimeout(() => { void saveLogDraft(obj); }, 1000);
  }

  return (
    <form ref={formRef} action={formAction} onChange={onChange} className="space-y-5">
      {editing ? <input type="hidden" name="id" value={log.id} /> : null}
      {editing ? <input type="hidden" name="finalise" ref={finaliseRef} defaultValue="no" /> : null}
      <input type="hidden" name="scope" value={scope} />

      <div className="grid gap-5 sm:grid-cols-2">
        {scope === "branch" ? (
          <div>
            <label htmlFor="branch_id" className="form-label">Branch *</label>
            <select id="branch_id" name="branch_id" required defaultValue={branchValue}>
              <option value="" disabled>Please choose</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label htmlFor="shift" className="form-label">Shift *</label>
          <select id="shift" name="shift" required defaultValue={shiftValue}>
            {shiftChoices.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="details" className="form-label">On Call Notes *</label>
          <textarea id="details" name="details" rows={4} required defaultValue={editing ? (log?.details ?? "") : dv("details")} placeholder="Notes from the shift" />
        </div>

        <div>
          <label htmlFor="complaints_count" className="form-label">Number of complaints</label>
          <input id="complaints_count" name="complaints_count" type="number" min={0} defaultValue={editing ? String(log?.complaints_count ?? 0) : (d.complaints_count ?? "0")} />
        </div>
        <div>
          <label htmlFor="complaints_logged" className="form-label">Have these been logged?</label>
          <select id="complaints_logged" name="complaints_logged" defaultValue={yesNo("complaints_logged", log?.complaints_logged ?? false)}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>

        <div>
          <label htmlFor="absences_count" className="form-label">Number of absences</label>
          <input id="absences_count" name="absences_count" type="number" min={0} defaultValue={editing ? String(log?.absences_count ?? 0) : (d.absences_count ?? "0")} />
        </div>
        <div>
          <label htmlFor="absences_logged" className="form-label">Have these been logged?</label>
          <select id="absences_logged" name="absences_logged" defaultValue={yesNo("absences_logged", log?.absences_logged ?? false)}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>

        <div className="sm:col-span-2 rounded-xl border border-white/10 bg-white/5 p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-white">
            <input type="checkbox" name="follow_up_required" defaultChecked={editing ? (log?.follow_up_required ?? false) : d.follow_up_required === "on"} />
            Needs Urgent Follow Up
          </label>
          <textarea name="follow_up_notes" rows={2} defaultValue={editing ? (log?.follow_up_notes ?? "") : dv("follow_up_notes")} placeholder="What needs following up" className="mt-3" />
          {editing ? (
            <label className="mt-3 flex items-center gap-2 text-sm text-white/80">
              <input type="checkbox" name="follow_up_done" defaultChecked={log.follow_up_done} />
              Follow up completed
            </label>
          ) : null}
        </div>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      {editing ? (
        confirming ? (
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-white/80">Have you finished this shift? Once finalised it can no longer be edited.</p>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" onClick={() => { if (finaliseRef.current) finaliseRef.current.value = "yes"; }} className="btn-primary" disabled={pending}>
                {pending ? "Saving…" : "Yes, finalise"}
              </button>
              <button type="submit" onClick={() => { if (finaliseRef.current) finaliseRef.current.value = "no"; }} className="btn-ghost" disabled={pending}>
                No, just save
              </button>
              <button type="button" className="text-sm text-white/50 hover:text-white" onClick={() => setConfirming(false)} disabled={pending}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={saved ? "btn-saved" : "btn-primary"} onClick={() => setConfirming(true)} disabled={pending}>
            {saved ? "Saved" : "Save"}
          </button>
        )
      ) : (
        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Log shift"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => router.push("/on-call/log")} disabled={pending}>
            Cancel
          </button>
        </div>
      )}
      {draftEnabled ? (
        <p className="text-xs text-white/40">This saves automatically as you type, and stays for up to 12 hours until you submit it, even if you log out.</p>
      ) : null}
    </form>
  );
}
