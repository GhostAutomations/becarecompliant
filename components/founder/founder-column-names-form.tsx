"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPeopleColumnLabels, setServiceUserColumnLabels } from "@/app/(app)/founder/actions";
import { useSavedFlash } from "@/lib/use-saved-flash";

/**
 * Founder-facing register column renamer for one company. Mirrors the company
 * Admin's ColumnNamesForm, but posts a company_id so the founder can retune any
 * tenant's terminology from the console without entering Manage as.
 */
export default function FounderColumnNamesForm({
  companyId,
  population,
  columns,
  labels,
}: {
  companyId: string;
  population: "people" | "service_users";
  columns: Array<{ key: string; name: string }>;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, flash, reset] = useSavedFlash();
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const c of columns) o[c.key] = labels[c.key] ?? "";
    return o;
  });

  function save() {
    const fd = new FormData();
    fd.set("company_id", companyId);
    for (const c of columns) fd.set(`col_${c.key}`, vals[c.key] ?? "");
    startTransition(async () => {
      if (population === "people") await setPeopleColumnLabels(fd);
      else await setServiceUserColumnLabels(fd);
      flash();
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {columns.map((c) => (
        <div key={c.key} className="flex items-center gap-3">
          <span className="min-w-[11rem] text-sm text-white/80">{c.name}</span>
          <input
            value={vals[c.key] ?? ""}
            placeholder="Custom name"
            className="max-w-[12rem]"
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
