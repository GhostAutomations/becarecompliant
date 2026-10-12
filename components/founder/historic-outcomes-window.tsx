"use client";

import { useActionState, useEffect } from "react";
import { setHistoricOutcomesUntil } from "@/app/(app)/founder/actions";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import { submitKeepingTyped } from "@/components/forms/keep-typed";

/**
 * Past outcomes and updates: the last day this company may add them (Phil, 2026-10-13). Blank and
 * Save closes it; the option also disappears by itself after that day.
 */
export default function HistoricOutcomesWindow({
  companyId,
  until,
  open,
}: {
  companyId: string;
  until: string | null;
  /** Whether the window is open today. */
  open: boolean;
}) {
  const [state, formAction, pending] = useActionState(setHistoricOutcomesUntil, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  useEffect(() => {
    if (state.ok && !pending) flash();
  }, [state, pending, flash]);

  return (
    <form onSubmit={submitKeepingTyped(formAction)} onChange={reset} className="space-y-3">
      <input type="hidden" name="company_id" value={companyId} />
      <p className="text-xs text-white/55">
        {open
          ? "Open now."
          : until
            ? "Closed: the last day has passed."
            : "Off."}
      </p>
      <div className="max-w-[12rem]">
        <label className="form-label" htmlFor="historic-outcomes-until">Open until (the last day)</label>
        <input id="historic-outcomes-until" type="date" name="until" defaultValue={until ?? ""} />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={`btn ${saved ? "btn-saved" : "btn-primary"} text-xs`}>
          {pending ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
        <span className="text-xs text-white/45">Clear the date and save to close it now.</span>
        {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
      </div>
    </form>
  );
}
