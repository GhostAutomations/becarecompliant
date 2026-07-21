"use client";

import { useMemo, useState } from "react";
import type { SatisfactionRow } from "@/lib/service-users/satisfaction";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : "—";
}

function ans(v: "Yes" | "No" | null | undefined) {
  if (v === "Yes") return <span className="pill pill-green">Yes</span>;
  if (v === "No") return <span className="pill pill-red">No</span>;
  return <span className="text-white/35">—</span>;
}

export default function SatisfactionRegisterTable({
  rows,
  questions,
}: {
  rows: SatisfactionRow[];
  questions: { key: string; label: string }[];
}) {
  const withReviews = useMemo(() => rows.filter((r) => r.reviewsInWindow > 0), [rows]);
  const branches = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of withReviews) if (r.branch_id) seen.set(r.branch_id, r.branch_name ?? "Branch");
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [withReviews]);

  const [branchId, setBranchId] = useState("");
  const shown = branchId ? withReviews.filter((r) => r.branch_id === branchId) : withReviews;

  const positive = shown.reduce((n, r) => n + r.positive, 0);
  const answered = shown.reduce((n, r) => n + r.answered, 0);
  const reviewCount = shown.reduce((n, r) => n + r.reviewsInWindow, 0);
  const pct = answered > 0 ? Math.round((positive / answered) * 100) : null;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card p-4">
          <p className="text-xs uppercase tracking-wide text-white/45">Customer satisfaction</p>
          <p className="mt-2 text-2xl font-bold text-emerald-300">{pct === null ? "—" : `${pct}%`}</p>
          <p className="text-xs text-white/45">positive answers, for the PQS return</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs uppercase tracking-wide text-white/45">Reviews in period</p>
          <p className="mt-2 text-2xl font-bold text-white">{reviewCount}</p>
          <p className="text-xs text-white/45">with feedback captured</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs uppercase tracking-wide text-white/45">Positive answers</p>
          <p className="mt-2 text-2xl font-bold text-white">{positive}</p>
          <p className="text-xs text-white/45">of {answered} answered</p>
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
            No personal plan reviews with feedback in this period yet. Satisfaction is gathered when a review is completed.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-white/45">
                  <th className="py-2 pr-3">Service user</th>
                  <th className="py-2 pr-3">Branch</th>
                  <th className="py-2 pr-3">Last review</th>
                  {questions.map((q) => (
                    <th key={q.key} className="py-2 pr-3">{q.label}</th>
                  ))}
                  <th className="py-2 pr-3 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-t border-white/10 align-top">
                    <td className="py-2 pr-3 text-white/85">{r.full_name}</td>
                    <td className="py-2 pr-3 text-white/60">{r.branch_name}</td>
                    <td className="py-2 pr-3 text-white/60">{fmtDate(r.latestReviewAt)}</td>
                    {questions.map((q) => (
                      <td key={q.key} className="py-2 pr-3">{ans(r.latestAnswers[q.key])}</td>
                    ))}
                    <td className="py-2 pr-3 text-right">
                      {r.pct === null ? (
                        <span className="text-white/40">—</span>
                      ) : (
                        <span className={r.pct >= 80 ? "text-emerald-300" : r.pct >= 50 ? "text-white/80" : "text-amber-300"}>
                          {r.pct}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] text-white/40">
              Yes / No shows the answers from each service user&apos;s most recent review in the period. The % is their positive
              rate across all their reviews in the period.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
