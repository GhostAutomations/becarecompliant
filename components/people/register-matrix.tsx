"use client";

/**
 * Be Care Compliant — the People register as a compliance matrix (Phase 3),
 * mirroring the manager's Monday board column for column. Sticky Carer column;
 * recurring checks (Manual Handling, Medication Competency, Spot Check, Appraisal,
 * Supervision 1/2/3) show their due dates with RAG; directly-recorded trackers
 * (DBS, Enhanced DBS, Right to Work + limits, Probation) show as columns too.
 * Styled only with canonical classes from globals.css.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  type RegisterRow,
  RTW_LIMIT_LABELS,
  PROBATION_STATUS_LABELS,
  WORKING_STATUS_LABELS,
} from "@/lib/people/types";
import { formatDisplayDate, supervisionSlots, appraisalSlot, dateRag } from "@/lib/people/logic";
import { probationDueCountsDown } from "@/lib/people/probation";
import { toneClass, type Tone } from "@/components/register/pill-select";
import { HorizontalScrollbar } from "@/components/register/horizontal-scrollbar";
import { useRememberedScroll } from "@/components/register/use-remembered-scroll";
import { VerticalScrollbar } from "@/components/register/vertical-scrollbar";
import { NameSortHeader, sortByName, useNameSort, type SortMode } from "@/components/register/name-sort-header";
import ExtraCheckCell from "@/components/register/extra-check-cell";
import { cellText, type RegisterCheckColumn } from "@/lib/register/custom-columns";

function workingTone(v: string | null): Tone {
  if (v === "active") return "green";
  if (v === "mat_leave" || v === "lts") return "amber";
  if (v === "leaver") return "red";
  return "neutral";
}

function probationTone(v: string | null, dueDate: string | null, amberDays: number): Tone {
  if (v === "passed") return "green";
  if (v === "extended") return "amber";
  if (v === "failed") return "red";
  if (v === "due") {
    // Colourless until the end-due date is within range, then amber, then red.
    const r = dateRag(dueDate, amberDays);
    return r === "red" ? "red" : r === "amber" ? "amber" : "neutral";
  }
  return "neutral";
}

type MatrixConfig = {
  supInterval: number;
  supAmber: number;
  rtwAmber: number;
  probationAmber: number;
  /** Notice a DBS renewal gets before it ambers. Ninety days by default: see DBS_AMBER_DAYS. */
  dbsAmber: number;
  cycleMode: "appraisal" | "four_supervisions";
};


function ragClass(rag: string): string {
  return rag === "red"
    ? "rag-cell-red"
    : rag === "amber"
      ? "rag-cell-amber"
      : rag === "green"
        ? "rag-cell-green"
        : "rag-cell-none";
}

function RagDate({ date, rag }: { date: string | null; rag: string }) {
  if (!date) return <span className="rag-cell rag-cell-none">—</span>;
  return <span className={`rag-cell ${ragClass(rag)}`}>{formatDisplayDate(date)}</span>;
}

function Plain({ date }: { date: string | null }) {
  return <span>{date ? formatDisplayDate(date) : "—"}</span>;
}

/**
 * A COMPLETED date in the Supervision / Appraisal cycle: white, bold, no pill.
 *
 * Phil, 2026-09-16: "for reviews, supervisions and appraisals, i only want pills in the due
 * columns."
 *
 * The split earns its keep. A DUE date is a deadline, and a deadline has a state - met,
 * close, missed - which is exactly what a pill says. A DONE date is a fact: it happened, on
 * that day, and colouring a fact only repeats the verdict already sitting in the cell beside
 * it. So the colour runs down one column and the dates read across the row.
 */
function CycleDate({ date }: { date: string | null }) {
  return <span>{date ? formatDisplayDate(date) : "—"}</span>;
}

/**
 * A COMPLETED date in the cycle columns: bold, no pill, coloured by whether it was on time.
 *
 * Phil, 2026-09-16: "if completed on time - green bold no pill / if completed late - amber
 * bold no pill."
 *
 * Amber for late rather than red, because it did happen. Red in this product means the thing
 * is not done, and spending it on a supervision that ran a fortnight over is how red stops
 * meaning anything.
 */
function DoneDate({ date, late }: { date: string | null; late: boolean }) {
  if (!date) return <span>—</span>;
  return <span className={late ? "done-late" : "done-on-time"}>{formatDisplayDate(date)}</span>;
}

function WorkingStatusPill({ status }: { status: string }) {
  const label = WORKING_STATUS_LABELS[status as keyof typeof WORKING_STATUS_LABELS] ?? status;
  return <span className={toneClass(workingTone(status))}>{label}</span>;
}

export default function RegisterMatrix({
  rows,
  config,
  editable,
  columnLabels,
  extraColumns = [],
  columnText = {},
  returnTo = "/people",
  scope = "active",
  initialSort,
}: {
  rows: RegisterRow[];
  config: MatrixConfig;
  editable: boolean;
  columnLabels: Record<string, string>;
  /** Custom (non-curated) check columns to render at the right, already ordered + shown-only. */
  extraColumns?: RegisterCheckColumn[];
  /** Cell text keyed by evidence id, for columns pointed at a question on their form. */
  columnText?: Record<string, string>;
  /** Where "Back to People" should return (the current view's URL). */
  returnTo?: string;
  /** Which view this is; the Status pill offers Archive only in the Leavers view. */
  scope?: string;
  /** The name order this user chose last time, read from their profile by the page. */
  initialSort: SortMode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  useRememberedScroll(wrapRef, `people:${scope}`);
  const col = (key: string, def: string) => columnLabels[key] || def;
  const fromQuery = `?from=${encodeURIComponent(returnTo)}`;
  // Acme "navy" theme only: show one branch at a time with a switcher.
  const [navy, setNavy] = useState(false);
  useEffect(() => {
    setNavy(typeof document !== "undefined" && !!document.querySelector(".theme-navy"));
  }, []);
  const branches = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      if (r.person.branch_id) m.set(r.person.branch_id, r.person.branch_name ?? "Branch");
    }
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);
  const [branchId, setBranchId] = useState<string>("");
  useEffect(() => {
    if (navy && branches.length && !branches.some((b) => b.id === branchId)) {
      setBranchId(branches[0].id);
    }
  }, [navy, branches, branchId]);
  const oneBranch = navy && branches.length > 1;
  const unsorted = oneBranch && branchId ? rows.filter((r) => r.person.branch_id === branchId) : rows;
  // Sorted HERE rather than left to the server so pressing the header reorders what is already
  // on screen, with no round trip and nothing to lose in a filter.
  const { mode, setMode } = useNameSort(initialSort);
  const filtered = useMemo(() => sortByName(unsorted, (r) => r.person.full_name, mode), [unsorted, mode]);
  // Four-supervisions mode: show a Sup 4 column pair and no Annual Appraisal columns.
  const fourSup = config.cycleMode === "four_supervisions";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {oneBranch ? (
          <div className="flex flex-wrap gap-1.5">
            {branches.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBranchId(b.id)}
                className={`navy-branchbtn ${b.id === branchId ? "on" : ""}`}
              >
                {b.name}
              </button>
            ))}
          </div>
        ) : null}
        <span className="ml-auto text-xs text-white/50">
          {filtered.length} {filtered.length === 1 ? "record" : "records"}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1">
        <div className="flex min-h-0 flex-1 gap-1">
          <div ref={wrapRef} className="matrix-wrap min-h-0 flex-1">
            <table className="matrix">
          <thead>
            <tr>
              <NameSortHeader label="Carer" mode={mode} onChange={setMode} />
              <th>{col("status", "Status")}</th>
              <th>{col("job_title", "Job Title")}</th>
              <th>{col("start_date", "Start date")}</th>
              <th>{col("manual_handling", "Manual Handling")}</th>
              <th>{col("medication_competency", "Medication Competency")}</th>
              <th>{col("dbs", "DBS")}</th>
              <th>{col("enhanced_dbs", "Enhanced DBS")}</th>
              <th>{col("rtw_expiry", "RTW Expiry")}</th>
              <th>{col("rtw_limits", "RTW Limits")}</th>
              <th>{col("probation_end_due", "Probation End Due")}</th>
              <th>{col("probation_end_actual", "Probation End Actual")}</th>
              <th>{col("probation_status", "Probation Status")}</th>
              <th>{col("probation_extension", "Probation Extension")}</th>
              <th>{col("spot_check_due", "Spot Check Due")}</th>
              <th>{col("recent_spot_check", "Recent Spot Check")}</th>
              <th>{col("sup1_due", "Supervision 1 Due")}</th>
              <th>{col("sup1_comp", "Supervision 1 Done")}</th>
              <th>{col("sup2_due", "Supervision 2 Due")}</th>
              <th>{col("sup2_comp", "Supervision 2 Done")}</th>
              <th>{col("sup3_due", "Supervision 3 Due")}</th>
              <th>{col("sup3_comp", "Supervision 3 Done")}</th>
              {fourSup ? (
                <>
                  <th>{col("sup4_due", "Supervision 4 Due")}</th>
                  <th>{col("sup4_comp", "Supervision 4 Done")}</th>
                </>
              ) : (
                <>
                  <th>{col("aa_due", "Annual Appraisal Due")}</th>
                  <th>{col("aa_comp", "Annual Appraisal Done")}</th>
                </>
              )}
              <th>{col("audit", "Audit")}</th>
              {extraColumns.map((c) => (
                <th key={c.id}>{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const t = row.tracker;
              const mh = row.statusByKey["manual_handling"];
              const mc = row.statusByKey["competency"];
              const sc = row.statusByKey["spot_check"];
              const supStatus = row.statusByKey["supervision"];
              const sup = supervisionSlots(
                config.supInterval,
                row.supCompDates,
                config.supAmber,
                row.appraisalCompDates,
                t?.probation_end_actual ?? null,
                undefined,
                fourSup ? 4 : 3,
                config.cycleMode,
                // Which supervision each one actually was, where a migration carried it.
                {
                  slotByComp: row.supSlotByComp,
                  dueByComp: row.supDueByComp,
                  openDue: supStatus?.due_date ?? null,
                },
              );
              const aaSlot = appraisalSlot(
                row.appraisalCompDates,
                row.supCompDates,
                config.supInterval,
                config.supAmber,
                undefined,
                // The date in this row's own Supervision 3 Done cell: the appraisal is due one
                // supervision interval after it, so the row reads across.
                sup[2]?.comp ?? null,
              );
              return (
                <tr key={row.person.id}>
                  <td className="col-carer">
                    <Link href={`/people/${row.person.id}${fromQuery}`} className="font-semibold text-white hover:text-gold-300">
                      {row.person.full_name}
                    </Link>
                  </td>
                  {/* READ ONLY (Phil, 2026-09-17), for the same reason as Job Title beside it.
                      Working status decides which VIEW a record lives in, so a stray click on a
                      compliance matrix moves somebody to Leavers. It is changed, with Archive
                      beside it, under Manage record. */}
                  <td><WorkingStatusPill status={row.person.employment_status} /></td>
                  {/* READ ONLY (Phil, 2026-09-17). It was an inline pill so the field that
                      decides which checks and which courses somebody is measured against sat
                      where the judging is shown. Read only is the other half of that argument:
                      a stray click on a compliance matrix should not quietly change what a
                      carer is judged on. It is still changed on Edit person, deliberately. */}
                  <td><span>{row.person.job_title || "—"}</span></td>
                  <td><Plain date={row.person.start_date} /></td>
                  <td><RagDate date={mh?.due_date ?? null} rag={mh?.rag ?? "none"} /></td>
                  <td><RagDate date={mc?.due_date ?? null} rag={mc?.rag ?? "none"} /></td>
                  {/* THE CERTIFICATE DATE IS A FACT, so it is drawn plainly: it happened, it
                      cannot come due, and colouring it would say something about it that is not
                      true. */}
                  <td><Plain date={t?.dbs_date ?? null} /></td>
                  {/* THE RENEWAL DATE IS A DEADLINE, and until 2026-09-22 it was drawn exactly
                      like the fact beside it — plain black text that never changed colour.
                      Thistle's earliest runs out in December 2027 and nothing anywhere would
                      have said a word about it. It is the one column on this matrix an
                      inspector asks to see, so it colours like every other deadline here. */}
                  <td>
                    <RagDate
                      date={t?.enhanced_dbs_date ?? null}
                      rag={dateRag(t?.enhanced_dbs_date ?? null, config.dbsAmber)}
                    />
                  </td>
                  <td>
                    <RagDate
                      date={t?.rtw_expiry_date ?? null}
                      rag={dateRag(t?.rtw_expiry_date ?? null, config.rtwAmber)}
                    />
                  </td>
                  {/* READ ONLY ON THE BOARD (Phil, 2026-09-09: "remove that so it can only
                      be changed in the record page in the right to work tile"). Right to work
                      limits are the one thing on this matrix that says whether somebody may
                      legally do the job, and a dropdown in a dense grid of two hundred rows
                      is a mis-click away from changing the wrong person's. It is set on the
                      record, beside the expiry date and the document it came from, where
                      whoever changes it is looking at the evidence for it. */}
                  <td>{t?.rtw_limits ? RTW_LIMIT_LABELS[t.rtw_limits] : "—"}</td>
                  <td>
                    {/* A DEADLINE ONLY COUNTS DOWN WHILE IT IS ONE (Phil, 2026-09-16: "why
                        are all the probation end due dates red?"). This cell was coloured on
                        the date alone, so a probation that passed months ago drew red for
                        ever, sitting two columns from a green "Passed" on the same row. On a
                        register read at a glance, the red is the part people believe. The
                        date is still shown either way: when the review was due is a fact
                        worth keeping however it turned out. */}
                    <RagDate
                      date={t?.probation_end_due ?? null}
                      rag={
                        probationDueCountsDown(t?.probation_status ?? null)
                          ? dateRag(t?.probation_end_due ?? null, config.probationAmber)
                          : "none"
                      }
                    />
                  </td>
                  <td><Plain date={t?.probation_end_actual ?? null} /></td>
                  <td>
                    {/* Read-only: probation status only changes by completing the
                        Probation Review form (Phil, 2026-07-18), never inline. */}
                    {t?.probation_status ? (
                      <span
                        className={`rag-cell ${toneClass(
                          probationTone(t.probation_status, t?.probation_end_due ?? null, config.probationAmber),
                        )}`}
                      >
                        {PROBATION_STATUS_LABELS[t.probation_status]}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <RagDate
                      date={t?.probation_extension_date ?? null}
                      rag={dateRag(t?.probation_extension_date ?? null, config.probationAmber)}
                    />
                  </td>
                  <td><RagDate date={sc?.due_date ?? null} rag={sc?.rag ?? "none"} /></td>
                  <td><Plain date={sc?.last_completed_on ?? null} /></td>
                  {/* A DEADLINE ONLY COUNTS DOWN WHILE IT IS ONE. An outstanding slot's Due
                      carries the pill - green over 14 days away, amber inside 14, red past.
                      Once the slot is done the Due is plain text, because the verdict has
                      moved to the Done cell: green on time, amber late. Same rule as the
                      probation end date (Phil, 2026-09-16). */}
                  <td>{sup[0].comp ? <CycleDate date={sup[0].due} /> : <RagDate date={sup[0].due} rag={sup[0].rag} />}</td>
                  <td>{sup[0].comp ? <DoneDate date={sup[0].comp} late={sup[0].rag === "red"} /> : <CycleDate date={null} />}</td>
                  <td>{sup[1].comp ? <CycleDate date={sup[1].due} /> : <RagDate date={sup[1].due} rag={sup[1].rag} />}</td>
                  <td>{sup[1].comp ? <DoneDate date={sup[1].comp} late={sup[1].rag === "red"} /> : <CycleDate date={null} />}</td>
                  <td>{sup[2].comp ? <CycleDate date={sup[2].due} /> : <RagDate date={sup[2].due} rag={sup[2].rag} />}</td>
                  <td>{sup[2].comp ? <DoneDate date={sup[2].comp} late={sup[2].rag === "red"} /> : <CycleDate date={null} />}</td>
                  {fourSup ? (
                    <>
                      <td>{sup[3].comp ? <CycleDate date={sup[3].due} /> : <RagDate date={sup[3].due} rag={sup[3].rag} />}</td>
                      <td>{sup[3].comp ? <DoneDate date={sup[3].comp} late={sup[3].rag === "red"} /> : <CycleDate date={null} />}</td>
                    </>
                  ) : (
                    <>
                      {/* The Appraisal pair is not one instance: nextDue is the NEXT appraisal,
                          comp is the LAST one, so the Due normally carries the outstanding pill.
                          NOT when the stored due date is one the last appraisal already met: that
                          cycle is closed and the cell reads like a completed supervision slot. */}
                      <td>{aaSlot.nextDueMet ? <CycleDate date={aaSlot.nextDue} /> : <RagDate date={aaSlot.nextDue} rag={aaSlot.nextDueRag} />}</td>
                      <td><DoneDate date={aaSlot.comp} late={aaSlot.compRag === "red"} /></td>
                    </>
                  )}
                  <td>
                    <ExtraCheckCell
                      status={row.statusByKey["audit"]}
                      recordId={row.person.id}
                      basePath="/people"
                      fromQuery={fromQuery}
                      editable={editable}
                    />
                  </td>
                  {extraColumns.map((c) => (
                    <td key={c.id}>
                      <ExtraCheckCell
                        status={row.statusByKey[c.key]}
                        recordId={row.person.id}
                        basePath="/people"
                        fromQuery={fromQuery}
                        editable={editable}
                        text={cellText(c, row.statusByKey[c.key], columnText)}
                      />
                    </td>
                  ))}
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
    </div>
  );
}
