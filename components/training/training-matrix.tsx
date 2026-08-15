"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  TrainingCourse,
  TrainingPerson,
  TrainingCell,
  Rag,
} from "@/lib/training/data";
import TrainingCellDialog from "@/components/training/training-cell-dialog";
import BulkTrainingDialog from "@/components/training/bulk-training-dialog";
import { canManageRecord, canManageAnything } from "@/lib/auth/manage-scope";
import { HorizontalScrollbar } from "@/components/register/horizontal-scrollbar";
import { VerticalScrollbar } from "@/components/register/vertical-scrollbar";

type BranchLite = { id: string; name: string };

type Selected = { personId: string; personName: string; course: TrainingCourse; cell: TrainingCell };

/** The states a manager actually goes looking for. "Needs a date" is the record somebody half
 *  filled in: completed, no renewal, so it sits amber for ever until it is finished. */
type Narrow = "all" | "expired" | "due_soon" | "missing" | "no_date" | "booked";

const NARROW_LABEL: Record<Narrow, string> = {
  all: "Everything",
  expired: "Expired",
  due_soon: "Due soon",
  missing: "Never recorded",
  no_date: "Needs a renewal date",
  // Live bookings only. "Show me what is booked" is a question about the diary, and a booking
  // that was missed is not in the diary any more; it is on the record, where it belongs.
  booked: "Booked",
};

/** Does this person have at least one course in the state being looked for? */
function matchesNarrow(cells: Record<string, TrainingCell>, courses: TrainingCourse[], n: Narrow): boolean {
  if (n === "all") return true;
  return courses.some((c) => {
    const cell = cells[c.id];
    if (!cell) return false;
    if (n === "no_date") return cell.needsRenewalDate === true;
    if (n === "booked") return cell.booking === "booked";
    return cell.status === n;
  });
}

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
  viewerRole,
  viewerBranchIds,
}: {
  courses: TrainingCourse[];
  people: TrainingPerson[];
  branches: BranchLite[];
  viewerRole: string;
  viewerBranchIds: string[];
}) {
  /*
   * TWO DIFFERENT QUESTIONS, and they used to be one boolean.
   *
   * canManage answers "should this toolbar button exist at all", which is about the role.
   * canEdit(person) answers "will a write to THIS carer succeed", which is about the role AND
   * the branch, because that is what RLS checks. Migration 0183 lets a manager see a carer she
   * is booked to conduct a check on, in a branch she does not run; every cell on that row opens
   * a dialog whose Save the database refuses.
   */
  const canManage = canManageAnything(viewerRole);
  const canEdit = (person: TrainingPerson) =>
    canManageRecord({ role: viewerRole, branchIds: viewerBranchIds, recordBranchId: person.branch_id });

  /*
   * A CARER WHOSE TRAINING RECORDS THIS VIEWER CANNOT READ IS LEFT OFF ENTIRELY.
   *
   * Caught in review, and it was worse than a cosmetic problem. `people_select` was widened by
   * 0183 so a booked conductor can see the carer they are booked with, but `person_training_select`
   * still needs the branch. So an out of branch carer arrived here with NO training rows, and no
   * record renders as "Not done": thirty three red cells against somebody who is fully trained.
   * She then counted in the headline percentage, appeared under "Never recorded", and made the
   * branch look non compliant on the strength of data the screen was not allowed to see.
   *
   * Filtering, not greying out. A row we cannot read is not a row with bad news in it, it is a
   * row with no news in it, and there is no honest way to colour that.
   */
  const readable = useMemo(() => people.filter(canEdit), [people, viewerRole, viewerBranchIds]);
  const [branch, setBranch] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [narrow, setNarrow] = useState<Narrow>("all");
  const [selected, setSelected] = useState<Selected | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [navy, setNavy] = useState(false);
  useEffect(() => {
    setNavy(typeof document !== "undefined" && !!document.querySelector(".theme-navy"));
  }, []);
  const wrapRef = useRef<HTMLDivElement>(null);

  /** Branch only. The headline above the table counts the branch you are looking at, NOT what
   *  the search box has narrowed it to: a figure that moved as you typed would be worthless. */
  const inBranch = useMemo(
    () => (branch === "all" ? readable : readable.filter((p) => p.branch_id === branch)),
    [branch, readable],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inBranch.filter(
      (p) =>
        (q === "" || p.full_name.toLowerCase().includes(q)) &&
        matchesNarrow(p.cells, courses, narrow),
    );
  }, [inBranch, query, narrow, courses]);

  /**
   * The headline, counted HERE rather than taken from the server's summary, because the server
   * counts the whole company and this respects the branch you have chosen. Mandatory courses
   * only, matching how the PQS measure and the dashboard tile are scored.
   */
  const stats = useMemo(() => {
    let green = 0, amber = 0, red = 0, mandOk = 0, mandTotal = 0;
    for (const p of inBranch) {
      for (const c of courses) {
        const cell = p.cells[c.id];
        if (!cell) continue;
        if (cell.rag === "green") green += 1;
        else if (cell.rag === "amber") amber += 1;
        else if (cell.rag === "red") red += 1;
        if (c.mandatory) {
          mandTotal += 1;
          if (cell.rag === "green" || cell.rag === "amber") mandOk += 1;
        }
      }
    }
    // Rounded DOWN, never up, exactly as the report and the dashboard do: 84.96% is not 85%,
    // and 85 is a PQS band boundary.
    const pct = mandTotal === 0 ? null : Math.floor((mandOk / mandTotal) * 1000) / 10;
    return { green, amber, red, pct, people: inBranch.length };
  }, [inBranch, courses]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Training</h1>
          <p className="page-subtitle">
            Mandatory training for every active person, with renewal dates and status.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="tsearch" className="form-label">
              Find a carer
            </label>
            <input
              id="tsearch"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name"
              className="mt-1 w-44"
            />
          </div>
          <div>
            <label htmlFor="tnarrow" className="form-label">
              Show
            </label>
            <select
              id="tnarrow"
              value={narrow}
              onChange={(e) => setNarrow(e.target.value as Narrow)}
              className="mt-1 w-48"
            >
              {(Object.keys(NARROW_LABEL) as Narrow[]).map((k) => (
                <option key={k} value={k}>
                  {NARROW_LABEL[k]}
                </option>
              ))}
            </select>
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
          {canManage && courses.length > 0 ? (
            <button type="button" onClick={() => setBulkOpen(true)} className="btn-primary px-4 py-2 text-sm">
              Record training
            </button>
          ) : null}
        </div>
      </div>

      {/* The figures the page already knew and never showed (Phil, 2026-08-01). Branch scoped,
          so it answers "how is THIS branch doing", and it does not move as you search. */}
      {courses.length > 0 && inBranch.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
          <span className="text-white/80">
            <span className="text-lg font-semibold text-white">
              {stats.pct === null ? "—" : `${stats.pct}%`}
            </span>{" "}
            <span className="text-white/55">mandatory training in date</span>
          </span>
          <span className="text-white/55">
            <span className="font-semibold text-rag-green-soft">{stats.green}</span> in date
          </span>
          <span className="text-white/55">
            <span className="font-semibold text-rag-amber-soft">{stats.amber}</span> due soon
          </span>
          <span className="text-white/55">
            <span className="font-semibold text-rag-red-soft">{stats.red}</span> expired or not done
          </span>
          <span className="ml-auto text-white/40">
            {stats.people} {stats.people === 1 ? "carer" : "carers"}
            {shown.length !== inBranch.length ? `, ${shown.length} shown` : ""}
          </span>
        </div>
      ) : null}

      {courses.length === 0 ? (
        <div className="glass-card p-6 text-sm text-white/60">
          No training courses are set up yet. Add them in Settings, People, Training courses.
        </div>
      ) : shown.length === 0 ? (
        <div className="glass-card p-6 text-sm text-white/60">
          {inBranch.length === 0
            ? "No active people in this branch yet. Add people to the register to track their training."
            : "Nobody matches that. Clear the search, or choose Everything."}
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
              {shown.map((p) => {
                // Navy theme: if any course is expired, flag the name cell instead of
                // adding an "Expired" line to the date cell (which made rows uneven).
                const hasExpired = navy && courses.some((c) => p.cells[c.id]?.sub === "Expired");
                const editable = canEdit(p);
                return (
                <tr key={p.id}>
                  <td className={`col-carer ${hasExpired ? "training-expired" : ""}`}>
                    <div className="font-medium text-white/90">{p.full_name}</div>
                  </td>
                  {courses.map((c) => {
                    const cell = p.cells[c.id];
                    // Show one-off "Done / Not done" as a green tick / red cross.
                    const glyph =
                      cell.label === "Done"
                        ? "✓"
                        : cell.label === "Not done"
                          ? "✕"
                          : null;
                    const chip = (
                      <span className={`rag-cell ${ragClass(cell.rag)}`}>
                        {glyph ? (
                          <span style={{ fontWeight: 700, fontSize: "14px", lineHeight: 1 }}>{glyph}</span>
                        ) : (
                          cell.label
                        )}
                        {cell.sub && !navy ? <span className="rag-sub">{cell.sub}</span> : null}
                      </span>
                    );
                    /*
                     * A BOOKING SITS UNDER THE CHIP, NOT IN IT (Phil, 2026-08-14).
                     *
                     * The cell keeps its red. "Booked 3 Sep" is a separate neutral line, because
                     * the whole decision is that a booked course is still not compliant: put the
                     * words inside the chip and they take the chip's colour, and a red chip that
                     * says something reassuring is how a company talks itself out of a gap.
                     *
                     * Shown in BOTH themes, unlike cell.sub. The navy theme drops "Expired"
                     * because it repeats what the red already says on every affected row; a
                     * booking is on almost no rows and says something nothing else does.
                     *
                     * Only a LIVE booking is captioned. Once the date has gone by the cell reads
                     * as plain overdue again, and the missed booking moves to the record.
                     */
                    const inner = cell.bookingCaption ? (
                      <span className="inline-flex flex-col items-center">
                        {chip}
                        <span className="booking-note">{cell.bookingCaption}</span>
                      </span>
                    ) : (
                      chip
                    );
                    return (
                      <td key={c.id}>
                        {editable ? (
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
                );
              })}
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
        {/* CAREFUL WITH THIS SENTENCE. It first said a booked course "stays on the chasing
            list", which is not true: the daily digest chases recorded training that is running
            out, and a course nobody has ever done is not in it at all. Copy that promises a
            reminder nobody will get is worse than saying nothing. */}
        {" "}A booking under a cell is the date the training is arranged for. It does not make the
        course compliant: it counts as outstanding until the training itself is recorded.
        {canManage ? " Click any cell to record, book or update it." : ""}
        {canManage && people.length !== readable.length
          ? " Carers in branches you do not run are left off: their training records are not yours to see."
          : ""}
      </p>

      {bulkOpen ? (
        <BulkTrainingDialog
          courses={courses}
          /* inBranch is already only carers this manager can write to, but the filter stays:
             a bulk record that silently drops half the ticked list is worse than not offering
             them, and this is the last line before the write. */
          people={inBranch
            .filter(canEdit)
            .map((p) => ({ id: p.id, full_name: p.full_name, branch_name: p.branch_name }))}
          onClose={() => setBulkOpen(false)}
        />
      ) : null}

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
