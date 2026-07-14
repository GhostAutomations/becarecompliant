"use client";

/**
 * Be Care Compliant — founder action to import the master template library
 * (forms + training courses) into an existing company. Follows the save button
 * rules: instant "Importing…" on press, disabled while pending, a visible inline
 * result (ok or error). The action is idempotent, so it is safe to run again.
 */

import { useActionState } from "react";
import { IDLE_STATE } from "@/lib/forms";
import { founderImportTemplates } from "@/app/(app)/founder/actions";

export function ImportTemplatesButton({ companyId }: { companyId: string }) {
  const [state, action, pending] = useActionState(
    founderImportTemplates,
    IDLE_STATE,
  );
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="company_id" value={companyId} />
      <button type="submit" disabled={pending} className="btn-primary px-3 py-2 text-xs">
        {pending ? "Importing…" : "Import latest templates"}
      </button>
      {state.ok && <p className="text-xs text-emerald-300">{state.ok}</p>}
      {state.error && <p className="text-xs text-red-300">{state.error}</p>}
    </form>
  );
}
