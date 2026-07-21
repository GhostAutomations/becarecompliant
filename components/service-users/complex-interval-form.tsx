"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateComplexReviewInterval } from "@/lib/service-users/actions";
import { useSavedFlash } from "@/lib/use-saved-flash";

export default function ComplexIntervalForm({ days }: { days: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(String(days));
  const [saved, flash, reset] = useSavedFlash();

  function save() {
    const fd = new FormData();
    fd.set("days", value);
    startTransition(async () => {
      await updateComplexReviewInterval(fd);
      flash();
      router.refresh();
    });
  }

  return (
    <div className="glass-card flex flex-wrap items-end gap-3 p-5">
      <div>
        <label htmlFor="complex_interval" className="form-label">Complex review interval (days)</label>
        <input
          id="complex_interval"
          type="number"
          min={1}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            reset();
          }}
          className="max-w-[8rem]"
        />
        <p className="form-hint">REV1 is due this many days after the package start; each REV then follows the previous one.</p>
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
