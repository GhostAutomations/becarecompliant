"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { founderSetSetupStepDone } from "@/lib/setup/actions";

/**
 * Founder only, on the founder company page (Phil, 2026-10-01): "Mark done" on a step still to
 * do, "Undo" on one the founder ticked himself. Never shown for the agreement.
 */
export default function FounderTickButton({
  companyId,
  stepKey,
  ticked,
}: {
  companyId: string;
  stepKey: string;
  ticked: boolean;
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
            const res = await founderSetSetupStepDone(companyId, stepKey, !ticked);
            if (res.error) setError(res.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Saving…" : ticked ? "Undo" : "Mark done"}
      </button>
      {error ? (
        <span role="alert" className="mt-1 text-xs rag-text-red">
          {error}
        </span>
      ) : null}
    </span>
  );
}
