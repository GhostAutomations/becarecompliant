"use client";

/**
 * Be Care Compliant — the People register as a compliance matrix (Phase 3),
 * mirroring the manager's Monday board column for column. Sticky Carer column;
 * recurring checks (Manual Handling, Medication Competency, Spot Check, Appraisal,
 * Supervision 1/2/3) show their due dates with RAG; directly-recorded trackers
 * (DBS, Enhanced DBS, Right to Work + limits, Probation) show as columns too.
 * Styled only with canonical classes from globals.css.
 */

import { useRef } from "react";
import Link from "next/link";
import {
  type RegisterRow,
  RTW_LIMIT_LABELS,
  PROBATION_STATUS_LABELS,
  WORKING_STATUS_LABELS,
} from "@/lib/people/types";
import { formatDisplayDate, supervisionSlots, appraisalSlot, dateRag } from "@/lib/people/logic";
import { setEmploymentStatus, updateTracker } from "@/lib/people/actions";
import { PillSelect, toneClass, type Tone } from "@/components/register/pill-select";
import { HorizontalScrollbar } from "@/components/register/horizontal-scrollbar";
import { VerticalScrollbar } from "@/components/register/vertical-scrollbar";
import ExtraCheckCell from "@/components/register/extra-check-cell";
import type { RegisterCheckColumn } from "@/lib/register/custom-columns";

function workingTone(v: string | null): Tone {
  if (v === "active") return "green";
  if (v === "mat_leave" || v === "lts") return "amber";
  if (v === "leaver") return "red";
  return "neutral";
}

/** Toast message shown when a Status change moves a person to another view. */
const STATUS_MOVE: Record<string, string> = {
  active: "Moved to Main",
  leaver: "Moved to Leavers",
  lts: "Moved to LTS & Mat Leave",
  mat_leave: "Moved to LTS & Mat Leave",
  archive: "Moved to Archive",
};
function rtwTone(v: string | null): Tone {
  if (v === "none") return "green";
  if (v === "20hrs_term" || v === "20hrs_2nd_job") return "amber";
  if (v === "visa_expires") return "red";
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

const WORKING_STATUS_OPTIONS = (Object.keys(WORKING_STATUS_LABELS) as Array<keyof typeof WORKING_STATUS_LABELS>).map(
  (k) => ({ value: k, label: WORKING_STATUS_LABELS[k] }),
);
const RTW_LIMIT_OPTIONS = [
  { value: "", label: "—" },
  ...(Object.keys(RTW_LIMIT_LABELS) as Array<keyof typeof RTW_LIMIT_LABELS>).map((k) => ({
    value: k,
    label: RTW_LIMIT_LABELS[k],
  })),
];
type MatrixConfig = {
  supInterval: number;
  supAmber: number;
  rtwAmber: number;
  probationAmber: number;
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
  return <span className="text-white/70">{date ? formatDisplayDate(date) : "—"}</span>;
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
  returnTo = "/people",
  scope = "active",
}: {
  rows: RegisterRow[];
  config: MatrixConfig;
  editable: boolean;
  columnLabels: Record<string, string>;
  /** Custom (non-curated) check columns to render at the right, already ordered + shown-only. */
  extraColumns?: RegisterCheckColumn[];
  /** Where "Back to People" should return (the current view's URL). */
  returnTo?: string;
  /** Which view this is; the Status pill offers Archive only in the Leavers view. */
  scope?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const col = (key: string, def: string) => columnLabels[key] || def;
  const fromQuery = `?from=${encodeURIComponent(returnTo)}`;
  // Archive is offered on the Status pill only when viewing Leavers (to clear them out).
  const statusOptions =
    scope === "leaver"
      ? [...WORKING_STATUS_OPTIONS, { value: "archive", label: "Archive" }]
      : WORKING_STATUS_OPTIONS;

  const filtered = rows;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
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
              <th className="col-carer">Carer</th>
              <th>{col("status", "Status")}</th>
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
              <th>{col("sup1_due", "Sup 1 Due")}</th>
              <th>{col("sup1_comp", "Sup 1 Comp")}</th>
              <th>{col("sup2_due", "Sup 2 Due")}</th>
              <th>{col("sup2_comp", "Sup 2 Comp")}</th>
              <th>{col("sup3_due", "Sup 3 Due")}</th>
              <th>{col("sup3_comp", "Sup 3 Comp")}</th>
              <th>{col("aa_due", "AA Next Due")}</th>
              <th>{col("aa_comp", "AA Comp")}</th>
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
              const sup = supervisionSlots(
                config.supInterval,
                row.supCompDates,
                config.supAmber,
                row.appraisalCompDates,
                t?.probation_end_actual ?? null,
              );
              const aaSlot = appraisalSlot(
                row.appraisalCompDates,
                row.supCompDates,
                config.supInterval,
                config.supAmber,
              );
              return (
                <tr key={row.person.id}>
                  <td className="col-carer">
                    <Link href={`/people/${row.person.id}${fromQuery}`} className="font-semibold text-white hover:text-gold-300">
                      {row.person.full_name}
                    </Link>
                  </td>
                  <td>
                    {editable ? (
                      <PillSelect
                        recordId={row.person.id}
                        recordField="person_id"
                        field="status"
                        value={row.person.employment_status}
                        options={statusOptions}
                        action={setEmploymentStatus}
                        toneOf={workingTone}
                        moveToast={STATUS_MOVE}
                      />
                    ) : (
                      <WorkingStatusPill status={row.person.employment_status} />
                    )}
                  </td>
                  <td><Plain date={row.person.start_date} /></td>
                  <td><RagDate date={mh?.due_date ?? null} rag={mh?.rag ?? "none"} /></td>
                  <td><RagDate date={mc?.due_date ?? null} rag={mc?.rag ?? "none"} /></td>
                  <td><Plain date={t?.dbs_date ?? null} /></td>
                  <td><Plain date={t?.enhanced_dbs_date ?? null} /></td>
                  <td>
                    <RagDate
                      date={t?.rtw_expiry_date ?? null}
                      rag={dateRag(t?.rtw_expiry_date ?? null, config.rtwAmber)}
                    />
                  </td>
                  <td className="text-white/70">
                    {editable ? (
                      <PillSelect
                        recordId={row.person.id}
                        recordField="person_id"
                        field="rtw_limits"
                        value={t?.rtw_limits ?? ""}
                        options={RTW_LIMIT_OPTIONS}
                        action={updateTracker}
                        toneOf={rtwTone}
                      />
                    ) : t?.rtw_limits ? (
                      RTW_LIMIT_LABELS[t.rtw_limits]
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <RagDate
                      date={t?.probation_end_due ?? null}
                      rag={dateRag(t?.probation_end_due ?? null, config.probationAmber)}
                    />
                  </td>
                  <td><Plain date={t?.probation_end_actual ?? null} /></td>
                  <td className="text-white/70">
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
                  {/* Pill rule: once a slot is completed the DUE clears and the
                      COMPLETED date carries the pill, green if done on/before the due
                      date, red if late (sup[n].rag). Outstanding: due carries amber/red. */}
                  <td>{sup[0].comp ? (sup[0].due ? <Plain date={sup[0].due} /> : <RagDate date={null} rag="none" />) : <RagDate date={sup[0].due} rag={sup[0].rag} />}</td>
                  <td>{sup[0].comp ? <RagDate date={sup[0].comp} rag={sup[0].rag} /> : <RagDate date={null} rag="none" />}</td>
                  <td>{sup[1].comp ? (sup[1].due ? <Plain date={sup[1].due} /> : <RagDate date={null} rag="none" />) : <RagDate date={sup[1].due} rag={sup[1].rag} />}</td>
                  <td>{sup[1].comp ? <RagDate date={sup[1].comp} rag={sup[1].rag} /> : <RagDate date={null} rag="none" />}</td>
                  <td>{sup[2].comp ? (sup[2].due ? <Plain date={sup[2].due} /> : <RagDate date={null} rag="none" />) : <RagDate date={sup[2].due} rag={sup[2].rag} />}</td>
                  <td>{sup[2].comp ? <RagDate date={sup[2].comp} rag={sup[2].rag} /> : <RagDate date={null} rag="none" />}</td>
                  <td><RagDate date={aaSlot.nextDue} rag={aaSlot.nextDueRag} /></td>
                  <td>{aaSlot.comp ? <RagDate date={aaSlot.comp} rag={aaSlot.compRag} /> : <RagDate date={null} rag="none" />}</td>
                  {extraColumns.map((c) => (
                    <td key={c.id}>
                      <ExtraCheckCell
                        status={row.statusByKey[c.key]}
                        recordId={row.person.id}
                        basePath="/people"
                        fromQuery={fromQuery}
                        editable={editable}
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
