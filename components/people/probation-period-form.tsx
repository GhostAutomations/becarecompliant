"use client";

import { useActionState, useState } from "react";
import { updateProbationPeriod } from "@/lib/people/actions";
import { IDLE_STATE, type ActionState } from "@/lib/forms";

export default function ProbationPeriodForm({ days }: { days: number }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionState, fd: FormData) => updateProbationPeriod(fd),
    IDLE_STATE,
  );
  const [val, setVal] = useState(String(days));
  const saved = !!state.ok;

  return (
    <form action={formAction} className="glass-card p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="probation_period_days" className="form-label">Probationary Period (days)</label>
          <input
            id="probation_period_days"
            name="probation_period_days"
            type="number"
            min={1}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="max-w-[8rem]"
          />
        </div>
        <button type="submit" disabled={pending} className={`btn ${saved ? "btn-saved" : "btn-outline"} text-xs`}>
          {pending ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      <p className="form-hint">
        Sets probation end due (start date + this period) for carers added afterwards.
        Changing it does not affect existing carers.
      </p>
    </form>
  );
}
