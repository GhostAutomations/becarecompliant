"use client";

/**
 * Be Care Compliant — which team members a complaint is about.
 *
 * Phil, 2026-09-15: "if it is about a team member, we need to be able to select that staff
 * member". Several, not one: a badly handled visit can involve two carers, and forcing a
 * choice means the second is never recorded.
 *
 * Narrowed to the chosen branch, like the service user picker beside it, because a complaint
 * about a Cardiff visit is not about somebody who works in Newport and a list of everybody
 * is a list nobody reads. The names already chosen stay visible even if the branch changes,
 * so switching branch cannot silently drop somebody who was already named.
 */

import { useState } from "react";

export type PersonOption = { id: string; full_name: string; branch_id: string | null };

export default function ComplaintPeoplePicker({
  people,
  branchId,
  initialIds = [],
}: {
  people: PersonOption[];
  branchId: string;
  initialIds?: string[];
}) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(initialIds));

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const inBranch = branchId ? people.filter((p) => p.branch_id === branchId) : people;
  /* Anyone already named is shown whatever branch is selected: a name quietly disappearing
     because somebody changed the branch is how a record loses a person. */
  const shown = [
    ...inBranch,
    ...people.filter((p) => chosen.has(p.id) && !inBranch.some((q) => q.id === p.id)),
  ];

  return (
    <div>
      <span className="form-label">Team members this is about</span>
      {shown.length === 0 ? (
        <p className="form-hint">
          {branchId
            ? "No team members in the chosen branch yet."
            : "Choose a branch first to narrow this list."}
        </p>
      ) : (
        <div className="mt-1 max-h-52 space-y-1 overflow-y-auto rounded-xl border border-white/10 p-2">
          {shown.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-white/80 hover:bg-white/5"
            >
              <input
                type="checkbox"
                name="person_ids"
                value={p.id}
                checked={chosen.has(p.id)}
                onChange={() => toggle(p.id)}
                className="shrink-0"
              />
              <span className="min-w-0 truncate">{p.full_name}</span>
              {p.branch_id !== branchId && branchId ? (
                <span className="shrink-0 text-xs text-white/40">another branch</span>
              ) : null}
            </label>
          ))}
        </div>
      )}
      <p className="form-hint">
        Optional, and more than one can be named. A complaint shows on a team member's record
        alongside whether it was upheld, never as a bare count.
      </p>
    </div>
  );
}
