"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateServiceUserColumnLabels } from "@/lib/service-users/actions";
import { useSavedFlash } from "@/lib/use-saved-flash";

export default function SuColumnNamesForm({
  columns,
  labels,
}: {
  columns: Array<{ key: string; name: string }>;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, flash, reset] = useSavedFlash();
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    // Pre-fill with the current name (your own wording if set, else the default).
    // Edit it in place; clearing it reverts to the default.
    for (const c of columns) o[c.key] = labels[c.key] ?? c.name;
    return o;
  });

  function save() {
    const fd = new FormData();
    for (const c of columns) fd.set(`col_${c.key}`, vals[c.key] ?? "");
    startTransition(async () => {
      await updateServiceUserColumnLabels(fd);
      flash();
      router.refresh();
    });
  }

  return (
    <div className="glass-card space-y-2 p-5">
      {columns.map((c) => (
        <div key={c.key} className="flex items-center gap-3">
          <span className="min-w-[10rem] text-xs text-white/40">{c.name}</span>
          <input
            value={vals[c.key] ?? ""}
            placeholder={c.name}
            className="max-w-[14rem]"
            onChange={(e) => {
              setVals((v) => ({ ...v, [c.key]: e.target.value }));
              reset();
            }}
          />
        </div>
      ))}
      <div className="pt-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className={`btn ${saved ? "btn-saved" : "btn-primary"} text-xs`}
        >
          {pending ? "Saving…" : saved ? "Saved" : "Save column names"}
        </button>
      </div>
    </div>
  );
}
