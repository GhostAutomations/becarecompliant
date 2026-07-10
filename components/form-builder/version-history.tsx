"use client";

/**
 * Be Care Compliant — Form builder: version history panel.
 * Every published version stays on record; Evidence pins its own version, so past
 * Evidence renders identically forever. Read only.
 */

import type { FormVersionRow } from "@/lib/form-builder/types";

const STATUS_PILL: Record<FormVersionRow["status"], string> = {
  draft: "pill-amber",
  published: "pill-green",
  archived: "pill-neutral",
};

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function VersionHistory({ versions }: { versions: FormVersionRow[] }) {
  if (versions.length === 0) return null;
  return (
    <details className="glass-card section-card">
      <summary>Version history</summary>
      <div className="border-t border-white/10 p-5">
        <ul className="space-y-2">
          {versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-semibold text-white">v{v.version}</span>
              <span className={`pill ${STATUS_PILL[v.status]}`}>{v.status}</span>
              {v.isCurrent && <span className="pill pill-neutral">current</span>}
              <span className="text-white/50">{fmt(v.createdAt)}</span>
              {v.createdByName && <span className="text-white/40">by {v.createdByName}</span>}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
