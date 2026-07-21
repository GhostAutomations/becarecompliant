"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setSupervisionCycleMode } from "@/app/(app)/founder/actions";
import { useSavedFlash } from "@/lib/use-saved-flash";

type Mode = "appraisal" | "four_supervisions";

const OPTIONS: { value: Mode; label: string; hint: string }[] = [
  { value: "appraisal", label: "Supervision 1-3 + Annual Appraisal", hint: "Three supervisions then an Annual Appraisal that restarts the cycle." },
  { value: "four_supervisions", label: "4 Supervisions", hint: "Four supervisions and no appraisal; the fourth restarts the cycle." },
];

export default function SupervisionCycleToggle({ companyId, mode }: { companyId: string; mode: Mode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<Mode>(mode);
  const [saved, flash, reset] = useSavedFlash();

  function save() {
    const fd = new FormData();
    fd.set("company_id", companyId);
    fd.set("mode", value);
    startTransition(async () => {
      await setSupervisionCycleMode(fd);
      flash();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {OPTIONS.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 p-3 hover:bg-white/5">
            <input
              type="radio"
              name="supervision_cycle_mode"
              value={o.value}
              checked={value === o.value}
              onChange={() => {
                setValue(o.value);
                reset();
              }}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-white/90">{o.label}</span>
              <span className="block text-xs text-white/50">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={save}
        disabled={pending || value === mode}
        className={`btn ${saved ? "btn-saved" : "btn-primary"} text-xs`}
      >
        {pending ? "Saving…" : saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
