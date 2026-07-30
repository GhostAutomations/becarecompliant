"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IDLE_STATE } from "@/lib/forms";
import { deleteReg80Reviews } from "@/lib/reg80/actions";
import type { Reg80ReviewListItem } from "@/lib/reg80/data";

function fmtDate(v: string | null): string {
  if (!v) return "";
  const [y, m, d] = v.slice(0, 10).split("-");
  return d ? `${d}/${m}/${y}` : v;
}

export default function Reg80ReportsManager({
  reports,
  canDelete,
}: {
  reports: Reg80ReviewListItem[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [state, action, pending] = useActionState(deleteReg80Reviews, IDLE_STATE);

  useEffect(() => {
    if (state.ok) {
      setSelected(new Set());
      setConfirming(false);
      router.refresh();
    }
  }, [state.ok, router]);

  const allSelected = reports.length > 0 && selected.size === reports.length;
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(reports.map((r) => r.id)));
  }
  function fileName(r: Reg80ReviewListItem | undefined, id: string): string {
    const base = (r?.reference ?? `reg80 ${r?.branch_name ?? id}`).replace(/[^\w %.-]+/g, "").trim().replace(/\s+/g, "-");
    return `${base || "reg80"}.pdf`;
  }
  async function downloadSelected() {
    setDownloading(true);
    for (const id of selected) {
      const r = reports.find((x) => x.id === id);
      try {
        const res = await fetch(`/api/reports/reg80/${id}/pdf`);
        if (!res.ok) continue;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName(r, id);
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {
        // skip a file that failed and carry on with the rest
      }
    }
    setDownloading(false);
  }

  if (reports.length === 0) {
    return <div className="glass-card p-6 text-sm text-white/60">No Regulation 80 reports yet.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="glass-card flex flex-wrap items-center gap-3 p-3">
        <span className="text-xs text-white/50">{selected.size} selected</span>
        <button
          type="button"
          onClick={downloadSelected}
          disabled={selected.size === 0 || downloading}
          className="btn-outline px-3 py-2 text-xs disabled:opacity-40"
        >
          {downloading ? "Downloading…" : "Download selected"}
        </button>
        {canDelete ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={selected.size === 0}
            className="btn-outline border-rag-red/40 px-3 py-2 text-xs text-rag-red-soft hover:bg-rag-red/10 disabled:opacity-40"
          >
            Delete selected
          </button>
        ) : null}
        {state.error ? <span className="w-full text-xs text-red-300">{state.error}</span> : null}
      </div>

      {confirming ? (
        <div className="glass-card flex flex-wrap items-center gap-3 border border-rag-red/30 p-3">
          <span className="text-sm text-white/80">Delete {selected.size} report(s)? This cannot be undone.</span>
          <form action={action} className="ml-auto flex items-center gap-2">
            <input type="hidden" name="ids" value={[...selected].join(",")} />
            <button
              type="submit"
              disabled={pending}
              className="btn border border-rag-red/40 px-3 py-2 text-xs text-rag-red-soft hover:bg-rag-red/10"
            >
              {pending ? "Deleting…" : "Confirm delete"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="btn-ghost px-3 py-2 text-xs">
              Cancel
            </button>
          </form>
        </div>
      ) : null}

      <div className="glass-card overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase text-white/50">
              <th className="px-3 py-2">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
              </th>
              <th className="px-3 py-2">Report</th>
              <th className="px-3 py-2">Branch</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Updated</th>
              <th className="px-3 py-2">PDF</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id} className="border-b border-white/5">
                <td className="px-3 py-2">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label="Select report" />
                </td>
                <td className="px-3 py-2">
                  <Link href={`/reports/reg80/${r.id}`} className="font-medium text-white hover:text-gold-300">
                    {r.reference ?? `Review to ${fmtDate(r.period_end)}`}
                  </Link>
                </td>
                <td className="px-3 py-2 text-white/70">{r.branch_name}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      r.status === "submitted"
                        ? "rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-semibold text-emerald-300"
                        : "rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/60"
                    }
                  >
                    {r.status === "submitted" ? "Submitted" : "Draft"}
                  </span>
                </td>
                <td className="px-3 py-2 text-white/60">{fmtDate(r.updated_at)}</td>
                <td className="px-3 py-2">
                  <a href={`/api/reports/reg80/${r.id}/pdf`} className="text-gold-300 underline">
                    PDF
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
