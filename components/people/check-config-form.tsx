"use client";

import { useActionState } from "react";
import { updateCheckDefinition } from "@/lib/people/actions";
import { IDLE_STATE, type ActionState } from "@/lib/forms";
import { recurrenceLabel } from "@/lib/people/logic";
import type { CheckDefinition } from "@/lib/people/types";

export default function CheckConfigForm({ def }: { def: CheckDefinition }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionState, fd: FormData) => updateCheckDefinition(fd),
    IDLE_STATE,
  );
  const isExpiry = def.anchor === "expiry";
  const saved = !!state.ok;

  const saveButton = (
    <button type="submit" disabled={pending} className={`btn ${saved ? "btn-saved" : "btn-outline"} text-xs`}>
      {pending ? "Saving…" : saved ? "Saved" : "Save"}
    </button>
  );

  return (
    <form action={formAction} className="glass-card p-5">
      <input type="hidden" name="definition_id" value={def.id} />
      <input type="hidden" name="anchor" value={def.anchor} />

      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">{def.name}</h2>
          <p className="text-[11px] text-white/45">{recurrenceLabel(def)}</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-white/80">
          <input type="checkbox" name="active" defaultChecked={def.active} />
          Active
        </label>
      </div>

      {isExpiry ? (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor={`flag-${def.id}`} className="form-label">
              Flag this many days before the recorded expiry
            </label>
            <input
              id={`flag-${def.id}`}
              name="flag_days"
              type="number"
              min={0}
              defaultValue={def.amber_days ?? 30}
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
              <select id={`sched-${def.id}`} name="schedule_mode" defaultValue={def.schedule_mode}>
                <option value="interval">Yearly</option>
                <option value="after_sup3">After Supervision 3</option>
              </select>
            </div>
          ) : null}
          <div>
            <label htmlFor={`days-${def.id}`} className="form-label">
              {def.recurring ? "Every (days)" : "Due after start (days)"}
            </label>
            <input
              id={`days-${def.id}`}
              name="days"
              type="number"
              min={1}
              defaultValue={def.interval ?? 90}
              className="max-w-[8rem]"
            />
          </div>
          <div>
            <label htmlFor={`amber-${def.id}`} className="form-label">Amber (days before due)</label>
            <input
              id={`amber-${def.id}`}
              name="amber_days"
              type="number"
              min={0}
              defaultValue={def.amber_days ?? ""}
              placeholder="Default 30"
              className="max-w-[8rem]"
            />
          </div>
          {saveButton}
        </div>
      )}

      {state.error ? <p className="form-error">{state.error}</p> : null}
    </form>
  );
}
