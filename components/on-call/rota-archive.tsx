"use client";

import { useRouter } from "next/navigation";
import { dayHeading } from "@/lib/on-call/format";
import type { ArchiveWeek } from "@/lib/on-call/data";
import type { BranchOption, RotaScope } from "@/lib/on-call/types";

const SLOTS: Array<{ key: "am" | "pm"; label: string }> = [
  { key: "am", label: "AM" },
  { key: "pm", label: "PM" },
];

function firstName(name: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0] || "";
}
function surname(name: string | null): string {
  return (name ?? "").trim().split(/\s+/).slice(1).join(" ");
}
function rangeLabel(days: string[]): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" };
  const s = new Date(`${days[0]}T00:00:00Z`).toLocaleDateString("en-GB", opts);
  const e = new Date(`${days[6]}T00:00:00Z`).toLocaleDateString("en-GB", { ...opts, year: "numeric" });
  return `${s} – ${e}`;
}

export default function RotaArchive({
  scope,
  branches,
  selectedBranchId,
  weeks,
}: {
  scope: RotaScope;
  branches: BranchOption[];
  selectedBranchId: string | null;
  weeks: ArchiveWeek[];
}) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      {scope === "branch" && branches.length > 1 ? (
        <select
          aria-label="Branch"
          value={selectedBranchId ?? ""}
          onChange={(e) => router.push(`/on-call/archive?branch=${e.target.value}`)}
          className="w-auto"
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      ) : null}

      {weeks.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-white/50">No past rotas yet.</div>
      ) : (
        weeks.map((week) => (
          <section key={week.mondayIso}>
            <h2 className="mb-2 text-sm font-semibold text-white/80">{rangeLabel(week.days)}</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-1 text-sm">
                <thead>
                  <tr>
                    <th className="w-10" />
                    {week.days.map((d) => {
                      const h = dayHeading(d);
                      return (
                        <th key={d} className="px-1 py-1 text-center text-xs font-semibold text-white/60">{h.dow} {h.dom}</th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {SLOTS.map((s) => (
                    <tr key={s.key}>
                      <th className="pr-1 text-right align-middle text-xs font-semibold text-white/45">{s.label}</th>
                      {week.days.map((d) => {
                        const cell = week.cells[`${d}|${s.key}`];
                        return (
                          <td key={d}>
                            <div className={`h-14 w-full overflow-hidden rounded-lg border px-2 ${cell ? "border-white/10 bg-white/[0.06]" : "border-white/5 bg-transparent"}`}>
                              {cell ? (
                                <span className="flex h-full flex-col justify-center">
                                  <span className="block truncate text-xs font-medium leading-tight text-white">{firstName(cell.name)}</span>
                                  {surname(cell.name) ? <span className="block truncate text-xs leading-tight text-white/70">{surname(cell.name)}</span> : null}
                                </span>
                              ) : null}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
