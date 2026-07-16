"use client";

/**
 * Be Care Compliant — Complaints register (Phase 10 Additions). A calm list of
 * complaint cases, filtered by status and branch on the client (rows are loaded
 * once and RLS-scoped). A complaint is a lifecycle case, so there is no compliance
 * matrix; the response-deadline RAG shows which cases need attention.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  COMPLAINT_STATUS_LABELS,
  RELATIONSHIP_LABELS,
  type ComplaintRecord,
  type ComplaintStatus,
} from "@/lib/complaints/types";
import { responseRag, formatUkDate as formatDisplayDate } from "@/lib/complaints/logic";

function statusPill(status: ComplaintStatus) {
  const cls = status === "closed" ? "pill-green" : status === "in_progress" ? "pill-amber" : "pill-neutral";
  return <span className={cls}>{COMPLAINT_STATUS_LABELS[status]}</span>;
}

function ragPill(status: string, responseDue: string | null, amberDays: number) {
  const rag = responseRag(status, responseDue, amberDays);
  if (rag === "red") return <span className="pill-red"><span className="pill-dot" /> Overdue</span>;
  if (rag === "amber") return <span className="pill-amber"><span className="pill-dot" /> Due soon</span>;
  if (rag === "green") return <span className="pill-green"><span className="pill-dot" /> On track</span>;
  if (rag === "closed") return <span className="pill-neutral">Resolved</span>;
  return <span className="pill-neutral">No deadline</span>;
}

export default function ComplaintsRegister({
  rows,
  branches,
  amberDays,
  canManage,
}: {
  rows: ComplaintRecord[];
  branches: Array<{ id: string; name: string }>;
  amberDays: number;
  canManage: boolean;
}) {
  const [status, setStatus] = useState<"all" | ComplaintStatus>("all");
  const [branch, setBranch] = useState<string>("");

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) => (status === "all" || r.status === status) && (branch === "" || r.branch_id === branch),
      ),
    [rows, status, branch],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Complaints</h1>
          <p className="page-subtitle">
            Complaints and concerns, from raised to resolved, with their response deadlines.
          </p>
        </div>
        {canManage ? (
          <Link href="/complaints/new" className="btn-primary px-4 py-2 text-sm">
            Log a complaint
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="status_filter" className="form-label">Status</label>
          <select
            id="status_filter"
            value={status}
            onChange={(e) => setStatus(e.target.value as "all" | ComplaintStatus)}
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        {branches.length > 1 ? (
          <div>
            <label htmlFor="branch_filter" className="form-label">Branch</label>
            <select id="branch_filter" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-white/60">
          {rows.length === 0
            ? "No complaints logged yet. When a complaint or concern comes in, log it here to track it through to resolution."
            : "No complaints match these filters."}
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full min-w-[840px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-white/40">
                <th className="px-4 py-3 font-medium">Ref</th>
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">Complainant</th>
                <th className="px-4 py-3 font-medium">Raised</th>
                <th className="px-4 py-3 font-medium">Initial response due</th>
                <th className="px-4 py-3 font-medium">Response due</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Response</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 text-white/50">#{r.ref_number}</td>
                  <td className="px-4 py-3">
                    <Link href={`/complaints/${r.id}`} className="font-medium text-white hover:underline">
                      {r.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-white/70">{r.branch_name ?? "—"}</td>
                  <td className="px-4 py-3 text-white/70">
                    {r.complainant_name || (r.complainant_relationship ? RELATIONSHIP_LABELS[r.complainant_relationship] : "—")}
                  </td>
                  <td className="px-4 py-3 text-white/70">{formatDisplayDate(r.date_raised) || "—"}</td>
                  <td className="px-4 py-3 text-white/70">
                    {r.date_acknowledged ? (
                      <span className="pill-green">Sent {formatDisplayDate(r.date_acknowledged)}</span>
                    ) : (
                      formatDisplayDate(r.acknowledgement_due) || "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-white/70">{formatDisplayDate(r.response_due) || "—"}</td>
                  <td className="px-4 py-3">{statusPill(r.status)}</td>
                  <td className="px-4 py-3">{ragPill(r.status, r.response_due, amberDays)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
