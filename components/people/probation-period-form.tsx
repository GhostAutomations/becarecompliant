"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProbationPeriod } from "@/lib/people/actions";

export default function ProbationPeriodForm({ days }: { days: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [val, setVal] = useState(String(days));

  function save() {
    const fd = new FormData();
    fd.set("probation_period_days", val);
    startTransition(async () => {
      const res = await updateProbationPeriod(fd);
      if (res.error) {
        setError(res.error);
        setSaved(false);
      } else {
        setError(null);
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="glass-card p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="probation_period_days" className="form-label">Probationary Period (days)</label>
          <input
            id="probation_period_days"
            type="number"
            min={1}
            value={val}
            onChange={(e) => {
              setVal(e.target.value);
              setSaved(false);
            }}
            className="max-w-[8rem]"
          />
        </div>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className={`btn ${saved ? "btn-saved" : "btn-outline"} text-xs`}
        >
          {pending ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <p className="form-hint">
        Sets probation end due (start date + this period) for carers added afterwards.
        Changing it does not affect existing carers.
      </p>
    </div>
  );
}
