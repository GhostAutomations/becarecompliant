"use client";

/**
 * Be Care Compliant — the People register as a compliance matrix (Phase 3).
 * One row per Record; a sticky Carer column; one RAG cell per Check showing the
 * next due date with the last completed date beneath. Client side: search and a
 * worst-first sort. RAG colours mean the same everywhere: green compliant, amber
 * due soon, red overdue. Styled only with canonical classes from globals.css.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CheckDefinition, RegisterRow } from "@/lib/people/types";
import { formatDisplayDate } from "@/lib/people/logic";

const RAG_ORDER: Record<string, number> = { red: 0, amber: 1, green: 2, none: 3 };

function RagCell({ row, def }: { row: RegisterRow; def: CheckDefinition }) {
  const status = row.statuses[def.id];
  if (!status) {
    return <span className="rag-cell rag-cell-none">Not applied</span>;
  }
  const cls =
    status.rag === "red"
      ? "rag-cell-red"
      : status.rag === "amber"
        ? "rag-cell-amber"
        : status.rag === "green"
          ? "rag-cell-green"
          : "rag-cell-none";
  const main =
    status.due_date
      ? formatDisplayDate(status.due_date)
      : def.anchor === "expiry"
        ? "N/A"
        : status.last_completed_on
          ? "Complete"
          : "Not set";
  return (
    <span className={`rag-cell ${cls}`}>
      {main}
      {status.last_completed_on ? (
        <span className="rag-sub">Done {formatDisplayDate(status.last_completed_on)}</span>
      ) : null}
    </span>
  );
}

function RollupPill({ rag }: { rag: string }) {
  if (rag === "red") return <span className="pill-red"><span className="pill-dot" /> Overdue</span>;
  if (rag === "amber") return <span className="pill-amber"><span className="pill-dot" /> Due soon</span>;
  if (rag === "green") return <span className="pill-green"><span className="pill-dot" /> Compliant</span>;
  return <span className="pill-neutral">No checks</span>;
}

export default function RegisterMatrix({
  rows,
  definitions,
}: {
  rows: RegisterRow[];
  definitions: CheckDefinition[];
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
              <th>Status</th>
              <th>Team</th>
              <th>Start date</th>
              {definitions.map((def) => (
                <th key={def.id}>{def.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.person.id}>
                <td className="col-carer">
                  <Link href={`/people/${row.person.id}`} className="font-semibold text-white hover:text-gold-300">
                    {row.person.full_name}
                  </Link>
                  {row.person.job_title ? (
                    <div className="text-[11px] text-white/45">{row.person.job_title}</div>
                  ) : null}
                </td>
                <td>
                  <RollupPill rag={row.rollup?.rag ?? "none"} />
                </td>
                <td className="text-white/70">{row.person.team ?? "—"}</td>
                <td className="text-white/70">{formatDisplayDate(row.person.start_date) || "—"}</td>
                {definitions.map((def) => (
                  <td key={def.id}>
                    <RagCell row={row} def={def} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
