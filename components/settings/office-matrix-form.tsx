"use client";

/**
 * Be Care Compliant: "Show on Office matrix" on a login (0468, Phil 2026-10-14;
 * docs/decisions/office-matrix.md). Ticked, their People record moves to the Office branch and
 * Lead the Leader takes the place of supervisions; unticked, they go back to the branch they came
 * from. Admin and Founder only (this popup is Admin only). The save follows the standing rule, and
 * a refused save keeps what was ticked.
 */

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setOfficeMatrix } from "@/app/(app)/settings/actions";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import { submitKeepingTyped } from "@/components/forms/keep-typed";

export default function OfficeMatrixForm({
  userId,
  ticked,
  blocked,
}: {
  userId: string;
  ticked: boolean;
  /** Why the tick cannot be set on this login, or null. */
  blocked: string | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(setOfficeMatrix, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  useEffect(() => {
    if (state.ok && !pending) {
      flash();
      router.refresh();
    }
  }, [state, pending, flash, router]);

  return (
    <form onSubmit={submitKeepingTyped(formAction)} onChange={reset} className="space-y-3">
      <input type="hidden" name="user_id" value={userId} />
      <label className={`flex items-start gap-2 text-sm ${blocked ? "text-white/40" : "text-white/80"}`}>
        <input
          type="checkbox"
          name="office"
          defaultChecked={ticked}
          disabled={!!blocked}
          className="mt-0.5"
        />
        <span>
          Show on Office matrix
          <span className="block text-xs text-white/50">
            {blocked ??
              "Moves their People record to the Office branch, where Lead the Leader takes the place of supervisions. Untick to move them back to their branch."}
          </span>
        </span>
      </label>
      {blocked ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={saved ? "btn-saved" : "btn-primary"}>
            {pending ? "Saving…" : saved ? "Saved" : "Save"}
          </button>
          {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
          {saved && state.ok && state.ok !== "Saved" ? <span className="text-xs text-white/60">{state.ok}</span> : null}
        </div>
      )}
    </form>
  );
}
