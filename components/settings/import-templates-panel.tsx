"use client";

/**
 * Be Care Compliant — Company Admin action to import the latest founder library
 * (forms + training courses) into their own company. Save button rules: instant
 * "Importing…", disabled while pending, a visible inline result. Idempotent, so
 * it is safe to run again.
 */

import { useActionState } from "react";
import { IDLE_STATE } from "@/lib/forms";
import { importOwnCompanyTemplates } from "@/app/(app)/settings/templates/actions";

export function ImportTemplatesPanel() {
  const [state, action, pending] = useActionState(
    importOwnCompanyTemplates,
    IDLE_STATE,
  );
  return (
    <form action={action} className="space-y-3">
      <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-sm">
        {pending ? "Importing…" : "Import latest templates"}
      </button>
      {state.ok && <p className="text-sm text-emerald-300">{state.ok}</p>}
      {state.error && <p className="text-sm text-red-300">{state.error}</p>}
    </form>
  );
}
