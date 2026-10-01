"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setSetupStepNotNeeded } from "@/lib/setup/actions";

/** "Not needed" on a step still to do, "Needed after all" on one set aside. */
export default function NotNeededButton({
  companyId,
  stepKey,
  notNeeded,
}: {
  companyId: string;
  stepKey: string;
  notNeeded: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex shrink-0 flex-col items-end">
      <button
        type="button"
        disabled={pending}
        className="btn-ghost px-2.5 py-1 text-xs"
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await setSetupStepNotNeeded(companyId, stepKey, !notNeeded);
            if (res.error) setError(res.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Saving…" : notNeeded ? "Needed after all" : "Not needed"}
      </button>
      {error ? (
        <span role="alert" className="mt-1 text-xs rag-text-red">
          {error}
        </span>
      ) : null}
    </span>
  );
}
