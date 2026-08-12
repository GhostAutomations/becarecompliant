"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createDisclosure } from "@/lib/whistleblowing/actions";
import { IDLE_STATE } from "@/lib/forms";
import DisclosureFields from "./disclosure-fields";

export default function CreateDisclosureForm({
  branches,
  todayIso,
}: {
  branches: Array<{ id: string; name: string }>;
  todayIso: string;
}) {
  const [state, formAction, pending] = useActionState(createDisclosure, IDLE_STATE);
  const router = useRouter();
  // The action returns redirectTo rather than calling redirect() (see lib/forms).
  useEffect(() => {
    if (state.redirectTo) router.replace(state.redirectTo);
  }, [state.redirectTo, router]);

  return (
    <form action={formAction} className="space-y-6">
      <DisclosureFields idPrefix="new_disclosure" branches={branches} todayIso={todayIso} />

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending || !!state.redirectTo}>
          {pending || state.redirectTo ? "Recording…" : "Record disclosure"}
        </button>
      </div>
    </form>
  );
}
