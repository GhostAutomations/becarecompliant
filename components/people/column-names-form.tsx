"use client";

import { useActionState, useState } from "react";
import { updateColumnLabels } from "@/lib/people/actions";
import { IDLE_STATE, type ActionState } from "@/lib/forms";

export default function ColumnNamesForm({
  columns,
  labels,
}: {
  columns: Array<{ key: string; name: string }>;
  labels: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionState, fd: FormData) => updateColumnLabels(fd),
    IDLE_STATE,
  );
  // Controlled so values survive React 19's automatic form reset after an action.
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const c of columns) o[c.key] = labels[c.key] ?? "";
    return o;
  });
  const saved = !!state.ok;

  return (
    <form action={formAction} className="glass-card space-y-2 p-5">
      {columns.map((c) => (
        <div key={c.key} className="flex items-center gap-3">
          <span className="min-w-[11rem] text-sm text-white/80">{c.name}</span>
          <input
            name={`col_${c.key}`}
            value={vals[c.key] ?? ""}
            placeholder="Shorthand"
            className="max-w-[10rem]"
            onChange={(e) => setVals((v) => ({ ...v, [c.key]: e.target.value }))}
          />
        </div>
      ))}
      <div className="pt-2">
        <button type="submit" disabled={pending} className={`btn ${saved ? "btn-saved" : "btn-outline"} text-xs`}>
          {pending ? "Saving…" : saved ? "Saved" : "Save column names"}
        </button>
      </div>
    </form>
  );
}
