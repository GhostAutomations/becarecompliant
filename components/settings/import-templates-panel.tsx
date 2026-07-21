"use client";

/**
 * Be Care Compliant — Company Admin action to import the latest founder library
 * (forms + training courses) into their own company. Save button rules: instant
 * "Importing…", disabled while pending, a visible inline result. Idempotent, so
 * it is safe to run again.
 */

import { useActionState, useEffect } from "react";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import { importOwnCompanyTemplates } from "@/app/(app)/settings/templates/actions";

export function ImportTemplatesPanel() {
  const [state, action, pending] = useActionState(
    importOwnCompanyTemplates,
    IDLE_STATE,
  );
  const [saved, flash, reset] = useSavedFlash();
  useEffect(() => { if (state.ok && !pending) flash(); }, [state, pending, flash]);
  return (
    <form action={action} className="space-y-3" onChange={reset}>
      <button type="submit" disabled={pending} className={`${saved ? "btn-saved" : "btn-primary"} px-4 py-2 text-sm`}>
        {pending ? "Importing…" : saved ? "Imported" : "Import latest templates"}
      </button>
      {state.error && <p className="text-sm text-red-300">{state.error}</p>}
    </form>
  );
}
