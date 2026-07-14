"use client";

import { useMemo, useRef, useState } from "react";
import type {
  TrainingCourse,
  TrainingPerson,
  TrainingCell,
  Rag,
} from "@/lib/training/data";
import TrainingCellDialog from "@/components/training/training-cell-dialog";
import { HorizontalScrollbar } from "@/components/register/horizontal-scrollbar";
import { VerticalScrollbar } from "@/components/register/vertical-scrollbar";

type BranchLite = { id: string; name: string };

type Selected = { personId: string; personName: string; course: TrainingCourse; cell: TrainingCell };

function ragClass(rag: Rag): string {
  return rag === "green"
    ? "rag-cell-green"
    : rag === "amber"
      ? "rag-cell-amber"
      : rag === "red"
        ? "rag-cell-red"
        : "rag-cell-none";
}

export default function TrainingMatrix({
  courses,
  people,
  branches,
  canManage,
}: {
  courses: TrainingCourse[];
  people: TrainingPerson[];
  branches: BranchLite[];
  canManage: boolean;
}) {
  const [branch, setBranch] = useState<string>("all");
  const [selected, setSelected] = useState<Selected | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const shown = useMemo(
    () => (branch === "all" ? people : people.filter((p) => p.branch_id === branch)),
    [branch, people],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Training</h1>
          <p className="page-subtitle">
            Mandatory training for every active person, with renewal dates and status. Admins and
            Managers only.
          </p>
        </div>
        {branches.length > 1 && (
          <div>
            <label htmlFor="tbranch" className="form-label">
              Branch
            </label>
            <select
              id="tbranch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="mt-1 max-w-xs"
            >
              <option value="all">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {courses.length === 0 ? (
        <div className="glass-card p-6 text-sm text-white/60">
          No training courses are set up yet. Add them in Settings, People, Training courses.
        </div>
      ) : shown.length === 0 ? (
        <div className="glass-card p-6 text-sm text-white/60">
          No active people in this branch yet. Add people to the register to track their training.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-1">
          <div className="flex min-h-0 flex-1 gap-1">
            <div ref={wrapRef} className="matrix-wrap min-h-0 flex-1">
              <table className="matrix">
            <thead>
              <tr>
                <th className="col-carer">Carer</th>
                {courses.map((c) => (
                  <th key={c.id} title={c.renewal_months ? `Renews every ${c.renewal_months} months` : "One off"}>
                    {c.name}
                    {c.is_safeguarding ? " ★" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id}>
                  <td className="col-carer">
                    <div className="font-medium text-white/90">{p.full_name}</div>
                  </td>
                  {courses.map((c) => {
                    const cell = p.cells[c.id];
                    const inner = (
                      <span className={`rag-cell ${ragClass(cell.rag)}`}>
                        {cell.label}
                        {cell.sub ? <span className="rag-sub">{cell.sub}</span> : null}
                      </span>
                    );
                    return (
                      <td key={c.id}>
                        {canManage ? (
                          <button
                            type="button"
                            className="rounded-lg transition hover:ring-2 hover:ring-gold-400/50"
                            onClick={() =>
                              setSelected({ personId: p.id, personName: p.full_name, course: c, cell })
                            }
                            title="Edit this training record"
                          >
                            {inner}
                          </button>
                        ) : (
                          inner
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
              </table>
            </div>
            <VerticalScrollbar targetRef={wrapRef} />
          </div>
          <HorizontalScrollbar targetRef={wrapRef} />
        </div>
      )}

      <p className="text-[11px] text-white/40">
        Green: in date. Amber: due soon. Red: expired or not done. ★ marks the safeguarding course.
        {canManage ? " Click any cell to record or update it." : ""}
      </p>

      {selected ? (
        <TrainingCellDialog
          key={`${selected.personId}-${selected.course.id}`}
          personId={selected.personId}
          personName={selected.personName}
          course={selected.course}
          cell={selected.cell}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
