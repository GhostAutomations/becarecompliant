"use client";

/**
 * Be Care Compliant — founder action to import the master template library
 * (forms + training courses) into an existing company. Follows the save button
 * rules: instant "Importing…" on press, disabled while pending, a visible inline
 * result (ok or error). The action is idempotent, so it is safe to run again.
 */

import { useActionState, useEffect } from "react";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import { founderImportTemplates } from "@/app/(app)/founder/actions";

export function ImportTemplatesButton({ companyId }: { companyId: string }) {
  const [state, action, pending] = useActionState(
    founderImportTemplates,
    IDLE_STATE,
  );
  const [saved, flash, reset] = useSavedFlash();
  useEffect(() => { if (state.ok && !pending) flash(); }, [state, pending, flash]);
  return (
    <form action={action} className="space-y-2" onChange={reset}>
      <input type="hidden" name="company_id" value={companyId} />
      <button type="submit" disabled={pending} className={`${saved ? "btn-saved" : "btn-primary"} px-3 py-2 text-xs`}>
        {pending ? "Importing…" : saved ? "Imported" : "Import latest templates"}
      </button>
      {state.error && <p className="text-xs text-red-300">{state.error}</p>}
    </form>
  );
}
