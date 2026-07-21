import "server-only";

/**
 * Be Care Compliant — a record's history timeline (Phase 8).
 * The Person / Service User drill down history tab: that record's changes and its
 * Evidence in one chronological order, oldest at top and newest at bottom (the
 * chat/timeline ordering rule). Read only, fed by the record_audit_trail RPC
 * which is guarded by can_manage_person / can_manage_service_user. Includes the
 * inspection ready export buttons for the record.
 */

import type { AuditEntry } from "@/lib/audit-log/data";
import { fmtDateTime } from "@/lib/export/format";

function actionTone(action: string): string {
  if (action.includes("archived") || action.includes("deleted")) return "pill-red";
  if (action.startsWith("evidence.")) return "pill-green";
  if (action.includes("status") || action.includes("transferred")) return "pill-amber";
  return "pill-neutral";
}

export default function RecordHistory({
  recordType,
  recordId,
  entries,
  entitled,
}: {
  recordType: "person" | "service_user";
  recordId: string;
  entries: AuditEntry[];
  /** Pro and above unlocks the pack and history exports. */
  entitled: boolean;
}) {
  const packBase = `/api/reports/evidence-pack?type=${recordType}&record=${recordId}`;
  const histBase = `/api/reports/audit?scope=record&type=${recordType}&record=${recordId}`;

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          History{entries.length > 0 ? ` (${entries.length})` : ""}
        </h2>
        <span className="text-xs text-white/45 group-open:hidden">Show</span>
        <span className="hidden text-xs text-white/45 group-open:inline">Hide</span>
      </summary>

      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {entitled ? (
            <>
              <a href={`${packBase}&format=pdf`} className="btn-primary px-3 py-1.5 text-xs">
                Evidence pack PDF
              </a>
              <a href={`${packBase}&format=csv`} className="btn-outline px-3 py-1.5 text-xs">
                Evidence index CSV
              </a>
              <a href={`${histBase}&format=pdf`} className="btn-outline px-3 py-1.5 text-xs">
                Export history PDF
              </a>
            </>
          ) : (
            <span className="text-xs text-white/40">
              Evidence packs and history exports are a Pro feature.
            </span>
          )}
        </div>

        {entries.length === 0 ? (
          <div className="glass-card p-6 text-sm text-white/60">
            No history yet. Changes to this record and its evidence appear here in order.
          </div>
        ) : (
          <ol className="glass-card divide-y divide-white/5">
            {entries.map((e, i) => (
              <li key={e.id ?? i} className="flex items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-white/85">{e.summary || e.action.replace(/[._]/g, " ")}</p>
                  <p className="mt-0.5 text-[11px] text-white/45">
                    {fmtDateTime(e.created_at)} · {e.actor_email || "System"}
                  </p>
                </div>
                <span className={actionTone(e.action)}>{e.action.split(".")[0]}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}
