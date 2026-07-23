"use client";

import Link from "next/link";
import { shiftLabel } from "@/lib/on-call/format";
import type { OnCallLog } from "@/lib/on-call/types";

function loggedPill(count: number, logged: boolean) {
  if (count === 0) return <span className="text-white/40">0</span>;
  return (
    <span>
      {count}
      <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${logged ? "bg-emerald-400/15 text-emerald-200" : "bg-amber-400/20 text-amber-200"}`}>
        {logged ? "logged" : "not logged"}
      </span>
    </span>
  );
}

export default function LogRegister({ rows }: { rows: OnCallLog[] }) {
  const hasBranch = rows.some((r) => r.branch_name);

  if (rows.length === 0) {
    return <div className="glass-card p-8 text-center text-sm text-white/50">No shifts logged yet.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/45">
            <th className="px-3 py-2">Shift</th>
            {hasBranch ? <th className="px-3 py-2">Branch</th> : null}
            <th className="px-3 py-2">Complaints</th>
            <th className="px-3 py-2">Absences</th>
            <th className="px-3 py-2">Urgent</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.04]">
              <td className="px-3 py-2">
                <Link href={`/on-call/log/${r.id}`} className="font-medium text-gold-300">{shiftLabel(r.shift_date, r.slot)}</Link>
              </td>
              {hasBranch ? <td className="px-3 py-2 text-white/70">{r.branch_name ?? "—"}</td> : null}
              <td className="px-3 py-2 text-white/80">{loggedPill(r.complaints_count, r.complaints_logged)}</td>
              <td className="px-3 py-2 text-white/80">{loggedPill(r.absences_count, r.absences_logged)}</td>
              <td className="px-3 py-2">
                {r.follow_up_required && !r.follow_up_done ? (
                  <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-semibold text-amber-200">Yes</span>
                ) : (
                  <span className="text-white/40">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
