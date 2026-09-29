"use client";

/**
 * Founder, Trial requests: the mobile that new trial requests are texted to (Phil, 2026-09-29).
 * Save button per the standing rule: solid gold, "Saving…" the instant it is pressed, "Saved"
 * on success until the number is edited again, and the error beside the button.
 */

import { useActionState, useEffect } from "react";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import { saveFounderMobile } from "@/app/(app)/founder/actions";

export default function FounderMobileForm({ current }: { current: string | null }) {
  const [state, action, saving] = useActionState(saveFounderMobile, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  useEffect(() => {
    if (state.ok && !saving) flash();
  }, [state, saving, flash]);

  return (
    <form action={action} onChange={reset} className="glass-card flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-56 flex-1">
        <label htmlFor="founder-mobile" className="form-label">Text me new trial requests</label>
        <input
          id="founder-mobile"
          name="phone"
          type="tel"
          defaultValue={current ?? ""}
          placeholder="07700 900123"
          disabled={saving}
        />
        <p className="mt-1 text-xs text-white/50">
          {current
            ? "Every new request is texted here as well as emailed. Clear it and save to stop the texts."
            : "No mobile yet, so requests are only emailed. Add yours to be texted as well."}
        </p>
      </div>
      <button type="submit" disabled={saving} className={`${saved ? "btn-saved" : "btn-primary"} px-4 py-2 text-sm`}>
        {saving ? "Saving…" : saved ? "Saved" : "Save"}
      </button>
      {state.error ? <p className="form-error mt-0 w-full text-xs">{state.error}</p> : null}
    </form>
  );
}
