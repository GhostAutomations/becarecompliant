"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtDateTime } from "@/lib/on-call/format";
import { relationshipLabel, type OnCallLog } from "@/lib/on-call/types";

export default function LogRegister({ rows }: { rows: OnCallLog[] }) {
  const [onlyFollowUps, setOnlyFollowUps] = useState(false);
  const shown = onlyFollowUps ? rows.filter((r) => r.follow_up_required && !r.follow_up_done) : rows;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={onlyFollowUps} onChange={(e) => setOnlyFollowUps(e.target.checked)} />
          Open follow-ups only
        </label>
        <a href="/api/on-call/export" className="btn-ghost text-sm">Export CSV</a>
      </div>

      {shown.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-white/50">
          {onlyFollowUps ? "No open follow-ups." : "No calls logged yet."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/45">
                <th className="px-3 py-2">Ref</th>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Branch</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Caller</th>
                <th className="px-3 py-2">Follow-up</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.04]">
                  <td className="px-3 py-2">
                    <Link href={`/on-call/log/${r.id}`} className="font-medium text-gold-300">#{r.ref_number}</Link>
                  </td>
                  <td className="px-3 py-2 text-white/80">{fmtDateTime(r.occurred_at)}</td>
                  <td className="px-3 py-2 text-white/70">{r.branch_name}</td>
                  <td className="px-3 py-2 text-white/70">{r.category ?? "—"}</td>
                  <td className="px-3 py-2 text-white/70">
                    {r.caller_name ?? "—"}
                    {r.caller_relationship ? <span className="text-white/40"> · {relationshipLabel(r.caller_relationship)}</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    {!r.follow_up_required ? (
                      <span className="text-white/40">—</span>
                    ) : r.follow_up_done ? (
                      <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-semibold text-emerald-200">Done</span>
                    ) : (
                      <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-semibold text-amber-200">Open</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
