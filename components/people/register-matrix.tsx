"use client";

/**
 * Be Care Compliant — the People register as a compliance matrix (Phase 3),
 * mirroring the manager's Monday board column for column. Sticky Carer column;
 * recurring checks (Manual Handling, Medication Competency, Spot Check, Appraisal,
 * Supervision 1/2/3) show their due dates with RAG; directly-recorded trackers
 * (DBS, Enhanced DBS, Right to Work + limits, Probation) show as columns too.
 * Styled only with canonical classes from globals.css.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  type RegisterRow,
  RTW_LIMIT_LABELS,
  PROBATION_STATUS_LABELS,
  WORKING_STATUS_LABELS,
} from "@/lib/people/types";
import { formatDisplayDate, supervisionSlots, dateRag } from "@/lib/people/logic";

type MatrixConfig = {
  supInterval: number;
  supAmber: number;
  rtwAmber: number;
  probationAmber: number;
};

const RAG_ORDER: Record<string, number> = { red: 0, amber: 1, green: 2, none: 3 };

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

function RollupPill({ rag }: { rag: string }) {
  if (rag === "red") return <span className="pill-red"><span className="pill-dot" /> Overdue</span>;
  if (rag === "amber") return <span className="pill-amber"><span className="pill-dot" /> Due soon</span>;
  if (rag === "green") return <span className="pill-green"><span className="pill-dot" /> Compliant</span>;
  return <span className="pill-neutral">No checks</span>;
}

function WorkingStatusPill({ status }: { status: string }) {
  const label = WORKING_STATUS_LABELS[status as keyof typeof WORKING_STATUS_LABELS] ?? status;
  if (status === "active") return <span className="pill-green"><span className="pill-dot" /> {label}</span>;
  if (status === "mat_leave" || status === "lts") return <span className="pill-amber"><span className="pill-dot" /> {label}</span>;
  return <span className="pill-neutral">{label}</span>;
}

export default function RegisterMatrix({
  rows,
  config,
}: {
  rows: RegisterRow[];
  config: MatrixConfig;
}) {
  const [search, setSearch] = useState("");
  const [worstFirst, setWorstFirst] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = rows;
    if (term) {
      list = rows.filter(
        (r) =>
          r.person.full_name.toLowerCase().includes(term) ||
          (r.person.job_title ?? "").toLowerCase().includes(term) ||
          (r.person.team ?? "").toLowerCase().includes(term),
      );
    }
    if (worstFirst) {
      list = [...list].sort(
        (a, b) =>
          (RAG_ORDER[a.rollup?.rag ?? "none"] ?? 3) - (RAG_ORDER[b.rollup?.rag ?? "none"] ?? 3),
      );
    }
    return list;
  }, [rows, search, worstFirst]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search people"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
          aria-label="Search people"
        />
        <button
          type="button"
          className={worstFirst ? "btn-primary" : "btn-outline"}
          onClick={() => setWorstFirst((v) => !v)}
        >
          {worstFirst ? "Sorted by status" : "Sort by status"}
        </button>
        <span className="ml-auto text-xs text-white/50">
          {filtered.length} {filtered.length === 1 ? "record" : "records"}
        </span>
      </div>

      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th className="col-carer">Carer</th>
              <th>Working Status</th>
              <th>Compliance</th>
              <th>Team</th>
              <th>Start date</th>
              <th>Manual Handling</th>
              <th>Medication Competency</th>
              <th>DBS</th>
              <th>Enhanced DBS</th>
              <th>RTW Expiry</th>
              <th>RTW Limits</th>
              <th>Probation End Due</th>
              <th>Probation End Actual</th>
              <th>Probation Status</th>
              <th>Probation Extension</th>
              <th>Spot Check Due</th>
              <th>Recent Spot Check</th>
              <th>Sup 1 Due</th>
              <th>Sup 1 Comp</th>
              <th>Sup 2 Due</th>
              <th>Sup 2 Comp</th>
              <th>Sup 3 Due</th>
              <th>Sup 3 Comp</th>
              <th>AA Next Due</th>
              <th>AA Comp</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const t = row.tracker;
              const mh = row.statusByKey["manual_handling"];
              const mc = row.statusByKey["competency"];
              const sc = row.statusByKey["spot_check"];
              const aa = row.statusByKey["appraisal"];
              const sup = supervisionSlots(
                row.person.start_date,
                config.supInterval,
                row.supComps,
                config.supAmber,
              );
              return (
                <tr key={row.person.id}>
                  <td className="col-carer">
                    <Link href={`/people/${row.person.id}`} className="font-semibold text-white hover:text-gold-300">
                      {row.person.full_name}
                    </Link>
                    {row.person.job_title ? (
                      <div className="text-[11px] text-white/45">{row.person.job_title}</div>
                    ) : null}
                  </td>
                  <td><WorkingStatusPill status={row.person.employment_status} /></td>
                  <td><RollupPill rag={row.rollup?.rag ?? "none"} /></td>
                  <td className="text-white/70">{row.person.team ?? "—"}</td>
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
                    {t?.rtw_limits ? RTW_LIMIT_LABELS[t.rtw_limits] : "—"}
                  </td>
                  <td>
                    <RagDate
                      date={t?.probation_end_due ?? null}
                      rag={dateRag(t?.probation_end_due ?? null, config.probationAmber)}
                    />
                  </td>
                  <td><Plain date={t?.probation_end_actual ?? null} /></td>
                  <td className="text-white/70">
                    {t?.probation_status ? PROBATION_STATUS_LABELS[t.probation_status] : "—"}
                  </td>
                  <td><Plain date={t?.probation_extension_date ?? null} /></td>
                  <td><RagDate date={sc?.due_date ?? null} rag={sc?.rag ?? "none"} /></td>
                  <td><Plain date={sc?.last_completed_on ?? null} /></td>
                  <td><RagDate date={sup[0].due} rag={sup[0].rag} /></td>
                  <td><Plain date={sup[0].comp} /></td>
                  <td><RagDate date={sup[1].due} rag={sup[1].rag} /></td>
                  <td><Plain date={sup[1].comp} /></td>
                  <td><RagDate date={sup[2].due} rag={sup[2].rag} /></td>
                  <td><Plain date={sup[2].comp} /></td>
                  <td><RagDate date={aa?.due_date ?? null} rag={aa?.rag ?? "none"} /></td>
                  <td><Plain date={aa?.last_completed_on ?? null} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
