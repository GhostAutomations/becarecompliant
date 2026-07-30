"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { IDLE_STATE } from "@/lib/forms";
import { createReg73Draft } from "@/lib/reg73/actions";

/** One click: generate a pre-filled Regulation 73 draft for this branch and open it. */
export default function StartVisitButton({ branchId }: { branchId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createReg73Draft, IDLE_STATE);

  useEffect(() => {
    if (state.redirectTo) router.replace(state.redirectTo);
  }, [state.redirectTo, router]);

  return (
    <form action={action}>
      <input type="hidden" name="branch_id" value={branchId} />
      <button type="submit" disabled={pending} className="btn-primary px-3 py-2 text-xs">
        {pending ? "Preparing…" : "Start new visit"}
      </button>
      {state.error ? <p className="form-error mt-1">{state.error}</p> : null}
    </form>
  );
}
