"use client";

/**
 * Be Care Compliant — assign a form or a policy to people.
 *
 * One mechanism covers both cases Phil asked for: tick one person, or tick the
 * whole branch. No rules engine, so there is nothing to fight when someone is an
 * exception. Assigning the same thing to someone who already has it open is
 * ignored rather than duplicated, so a Manager can safely re-run it for new
 * starters.
 */

import { useMemo, useState } from "react";
import ActionForm from "@/components/action-form";
import { assignItems } from "@/lib/assignments/actions";
import type { CompanyPolicy } from "@/lib/assignments/types";

export type AssignablePerson = { id: string; full_name: string; branch_name: string | null };

export default function AssignPanel({
  forms,
  policies,
  people,
}: {
  forms: Array<{ id: string; name: string }>;
  policies: CompanyPolicy[];
  people: AssignablePerson[];
}) {
  const [open, setOpen] = useState(false);
  const [branch, setBranch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const branches = useMemo(
    () => [...new Set(people.map((p) => p.branch_name).filter((b): b is string => Boolean(b)))].sort(),
    [people],
  );
  const shown = branch ? people.filter((p) => p.branch_name === branch) : people;
  const allShownPicked = shown.length > 0 && shown.every((p) => picked.includes(p.id));

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAllShown() {
    if (allShownPicked) {
      setPicked((prev) => prev.filter((id) => !shown.some((p) => p.id === id)));
    } else {
      setPicked((prev) => [...new Set([...prev, ...shown.map((p) => p.id)])]);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn-primary px-3 py-2 text-sm" onClick={() => setOpen(true)}>
        Assign a form or policy
      </button>
    );
  }

  return (
    <div className="glass-card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Assign a form or policy</h2>
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      <ActionForm action={assignItems} label="Assign" savedLabel="Assigned">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="assign-target" className="form-label">What are you assigning? *</label>
            <select id="assign-target" name="target" required defaultValue="">
              <option value="" disabled>Please choose</option>
              {policies.length > 0 && (
                <optgroup label="Policies">
                  {policies.map((p) => (
                    <option key={p.id} value={`policy:${p.id}`}>{p.title}</option>
                  ))}
                </optgroup>
              )}
              {forms.length > 0 && (
                <optgroup label="Forms">
                  {forms.map((f) => (
                    <option key={f.id} value={`form:${f.id}`}>{f.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div>
            <label htmlFor="assign-due" className="form-label">Due by (optional)</label>
            <input id="assign-due" name="due_date" type="date" />
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
            <span className="form-label">Who is it for? *</span>
            <div className="flex items-center gap-2">
              {branches.length > 1 && (
                <select
                  className="inline-cell"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                >
                  <option value="">All branches</option>
                  {branches.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              )}
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={toggleAllShown}>
                {allShownPicked ? "Clear these" : "Select these"}
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-3">
            {shown.length === 0 ? (
              <p className="text-sm text-white/50">Nobody to show.</p>
            ) : (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {shown.map((p) => (
                  <li key={p.id}>
                    <label className="flex items-center gap-2 text-sm text-white/85">
                      <input
                        type="checkbox"
                        name="person_ids"
                        value={p.id}
                        checked={picked.includes(p.id)}
                        onChange={() => toggle(p.id)}
                      />
                      {p.full_name}
                      {p.branch_name ? (
                        <span className="text-xs text-white/40">{p.branch_name}</span>
                      ) : null}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="form-hint">
            {picked.length} selected. Anyone who already has this open is skipped.
          </p>
        </div>
      </ActionForm>
    </div>
  );
}
