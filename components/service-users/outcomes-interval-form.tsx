"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOutcomesReviewMonths } from "@/lib/service-users/outcomes-actions";
import { useSavedFlash } from "@/lib/use-saved-flash";

export default function OutcomesIntervalForm({ months }: { months: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(String(months));
  const [saved, flash, reset] = useSavedFlash();

  function save() {
    const fd = new FormData();
    fd.set("months", value);
    startTransition(async () => {
      await updateOutcomesReviewMonths(fd);
      flash();
      router.refresh();
    });
  }

  return (
    <div className="glass-card flex flex-wrap items-end gap-3 p-5">
      <div>
        <label htmlFor="outcomes_review_months" className="form-label">Outcomes update cadence (months)</label>
        <input
          id="outcomes_review_months"
          type="number"
          min={1}
          max={24}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            reset();
          }}
          className="max-w-[8rem]"
        />
        <p className="form-hint">How long an active outcome can go without a progress update before it is flagged. The flag turns amber near the due date and red when overdue.</p>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className={`btn ${saved ? "btn-saved" : "btn-primary"} text-xs`}
      >
        {pending ? "Saving…" : saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
