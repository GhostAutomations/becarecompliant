"use client";

/**
 * Be Care Compliant — Whistleblowing register (THE LIST item 21, increment 2).
 *
 * The list shows the date, the category and the status — NOT the disclosure itself.
 * Somebody's account of what a colleague did should take a deliberate click to read,
 * not appear over a shoulder in an open-plan office.
 *
 * No live refresh here on purpose: whistleblowing_disclosures is deliberately kept off
 * the realtime publication (migration 0176).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  DISCLOSURE_STATUS_LABELS,
  type DisclosureRecord,
  type DisclosureStatus,
} from "@/lib/whistleblowing/types";
import { countable, summariseDisclosures } from "@/lib/whistleblowing/summary";
import { formatUkDate } from "@/lib/whistleblowing/logic";

function statusPill(status: DisclosureStatus) {
  const cls =
    status === "closed" ? "pill-green" : status === "under_review" ? "pill-amber" : "pill-neutral";
  return <span className={cls}>{DISCLOSURE_STATUS_LABELS[status]}</span>;
}

export default function WhistleblowingRegister({
  rows,
  canManage,
}: {
  rows: DisclosureRecord[];
  canManage: boolean;
}) {
  const [status, setStatus] = useState<"all" | DisclosureStatus>("all");

  const filtered = useMemo(
    () => rows.filter((r) => status === "all" || r.status === status),
    [rows, status],
  );
  const summary = useMemo(() => summariseDisclosures(countable(rows)), [rows]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Whistleblowing</h1>
          <p className="page-subtitle">
            Disclosures made in the public interest, and what was done about them.
          </p>
        </div>
        {canManage ? (
          <Link href="/whistleblowing/new" className="btn-primary px-4 py-2 text-sm">
            Record a disclosure
          </Link>
        ) : null}
      </div>

      <div className="glass-card border border-amber-300/20 p-4 text-sm text-white/70">
        <p className="font-medium text-white/90">Confidential</p>
        <p className="mt-1">
          This register is visible to the Admin and the Responsible Individual only. Branch
          managers cannot see it at any level, and that is enforced by the database rather
          than by a hidden menu — a disclosure is commonly about a manager.
        </p>
      </div>

      {rows.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass-card p-4">
            <p className="text-xs uppercase tracking-wide text-white/40">Received</p>
            <p className="mt-1 text-2xl font-semibold text-white">{summary.total}</p>
            <p className="text-xs text-white/50">{summary.anonymous} anonymous</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs uppercase tracking-wide text-white/40">Open</p>
            <p className="mt-1 text-2xl font-semibold text-white">{summary.open}</p>
            <p className="text-xs text-white/50">{summary.underReview} under review</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs uppercase tracking-wide text-white/40">Closed</p>
            <p className="mt-1 text-2xl font-semibold text-white">{summary.closed}</p>
            <p className="text-xs text-white/50">
              {summary.medianDaysToClose === null
                ? "No closing dates yet"
                : `Typically ${summary.medianDaysToClose} days`}
            </p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs uppercase tracking-wide text-white/40">Commonest</p>
            <p className="mt-1 text-sm font-semibold text-white">
              {summary.byCategory[0]?.category ?? "—"}
            </p>
            <p className="text-xs text-white/50">
              {summary.byCategory[0] ? `${summary.byCategory[0].count} of ${summary.total}` : ""}
            </p>
          </div>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="disclosure_status_filter" className="form-label">Status</label>
            <select
              id="disclosure_status_filter"
              value={status}
              onChange={(e) => setStatus(e.target.value as "all" | DisclosureStatus)}
            >
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="under_review">Under review</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-white/60">
          {rows.length === 0
            ? "No disclosures recorded. When somebody raises a concern in the public interest, record it here."
            : "No disclosures match this filter."}
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-center text-xs uppercase tracking-wide text-white/40">
                <th className="px-4 py-3 font-medium">Received</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">Discloser</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-white/5 text-center hover:bg-white/5">
                  <td className="px-4 py-3 text-white/70">{formatUkDate(r.received_on)}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/whistleblowing/${r.id}`}
                      className="font-medium text-white hover:underline"
                    >
                      {r.category}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-white/70">{r.branch_name ?? "Company wide"}</td>
                  <td className="px-4 py-3 text-white/70">
                    {r.anonymous ? (
                      <span className="pill-neutral">Anonymous</span>
                    ) : (
                      r.discloser_name || "Named"
                    )}
                  </td>
                  <td className="px-4 py-3">{statusPill(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
