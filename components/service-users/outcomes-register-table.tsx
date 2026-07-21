"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { REVIEW_RAG_PILL } from "@/lib/service-users/outcome-consts";
import type { OutcomesRegisterRow } from "@/lib/service-users/data";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function OutcomesRegisterTable({ rows }: { rows: OutcomesRegisterRow[] }) {
  const branches = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (r.branch_id) seen.set(r.branch_id, r.branch_name ?? "Branch");
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const [branchId, setBranchId] = useState("");
  const shown = branchId ? rows.filter((r) => r.branch_id === branchId) : rows;

  const totalInScope = shown.reduce((n, r) => n + r.total, 0);
  const totalAP = shown.reduce((n, r) => n + r.achievingOrProgressing, 0);
  const pqsPct = totalInScope > 0 ? Math.round((totalAP / totalInScope) * 100) : null;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card p-4">
          <p className="text-xs uppercase tracking-wide text-white/45">Achieving or progressing</p>
          <p className="mt-2 text-2xl font-bold text-emerald-300">{pqsPct === null ? "—" : `${pqsPct}%`}</p>
          <p className="text-xs text-white/45">for the PQS return</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs uppercase tracking-wide text-white/45">Outcomes tracked</p>
          <p className="mt-2 text-2xl font-bold text-white">{totalInScope}</p>
          <p className="text-xs text-white/45">across active service users</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs uppercase tracking-wide text-white/45">Achieving or progressing</p>
          <p className="mt-2 text-2xl font-bold text-white">{totalAP}</p>
          <p className="text-xs text-white/45">of {totalInScope}</p>
        </div>
      </section>

      <section className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white/80">Service users</h2>
          {branches.length > 1 ? (
            <label className="inline-flex items-center gap-2 text-xs text-white/55">
              Branch
              <select className="ctl-sm" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {shown.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-white/50">
            No active service users in this view. Add personal outcomes from a service user record.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-white/45">
                  <th className="py-2 pr-3">Service user</th>
                  <th className="py-2 pr-3">Branch</th>
                  <th className="py-2 pr-3 text-right">Outcomes</th>
                  <th className="py-2 pr-3 text-right">On track</th>
                  <th className="py-2 pr-3 text-right">%</th>
                  <th className="py-2 pr-3">Updates</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-t border-white/10">
                    <td className="py-2 pr-3">
                      <Link href={`/service-users/${r.id}/outcomes?from=/service-users/outcomes`} className="text-gold-300 hover:underline">
                        {r.full_name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-white/60">{r.branch_name}</td>
                    <td className="py-2 pr-3 text-right text-white/70">{r.total}</td>
                    <td className="py-2 pr-3 text-right text-white/70">{r.achievingOrProgressing}</td>
                    <td className="py-2 pr-3 text-right">
                      {r.pct === null ? (
                        <span className="text-white/40">—</span>
                      ) : (
                        <span className={r.pct >= 100 ? "text-emerald-300" : r.pct >= 50 ? "text-white/80" : "text-amber-300"}>
                          {r.pct}%
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {r.reviewRag === "none" ? (
                        <span className="text-white/40">—</span>
                      ) : (
                        <span className={`pill ${REVIEW_RAG_PILL[r.reviewRag]}`} title={r.reviewDue ? `Update due ${fmtDate(r.reviewDue)}` : undefined}>
                          {r.reviewLabel}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
