"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { assignCell, setRotaScope } from "@/lib/on-call/actions";
import { IDLE_STATE } from "@/lib/forms";
import { dayHeading } from "@/lib/on-call/format";
import type { BranchOption, PersonOption, RotaCell, RotaScope, RotaWeek } from "@/lib/on-call/types";

type Cells = Record<string, RotaCell>;
const SLOTS: Array<{ key: "am" | "pm"; label: string }> = [
  { key: "am", label: "AM" },
  { key: "pm", label: "PM" },
];

function firstName(name: string | null): string {
  return (name ?? "Assigned").trim().split(/\s+/)[0] || "Assigned";
}
function surname(name: string | null): string {
  return (name ?? "").trim().split(/\s+/).slice(1).join(" ");
}

export default function RotaGrid({
  scope,
  canChangeScope,
  canManage,
  branches,
  selectedBranchId,
  weeks,
  cells,
  people,
  todayIso,
  currentSlot,
}: {
  scope: RotaScope;
  canChangeScope: boolean;
  canManage: boolean;
  branches: BranchOption[];
  selectedBranchId: string | null;
  weeks: RotaWeek[];
  cells: Cells;
  people: PersonOption[];
  todayIso: string;
  currentSlot: "am" | "pm";
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ date: string; slot: "am" | "pm" } | null>(null);
  const [pending, startTransition] = useTransition();
  // Optimistic overrides so a picked name shows instantly and stays put through
  // the background refresh (no blank flash). A key mapped to null means cleared.
  const [overrides, setOverrides] = useState<Record<string, RotaCell | null>>({});

  const cellFor = (key: string): RotaCell | null => (key in overrides ? overrides[key] : cells[key] ?? null);
  const nowCell = cellFor(`${todayIso}|${currentSlot}`);

  function pick(date: string, slot: "am" | "pm", profileId: string) {
    const key = `${date}|${slot}`;
    const person = people.find((p) => p.id === profileId);
    setOverrides((prev) => ({
      ...prev,
      [key]: profileId ? { id: "optimistic", name: person?.name ?? null, phone: null, profileId } : null,
    }));
    setEditing(null);
    startTransition(async () => {
      await assignCell(scope, selectedBranchId, date, slot, profileId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Rota</h1>
        <p className="text-sm text-white/60">
          On call now:{" "}
          <span className="font-medium text-white">
            {nowCell?.name ?? "no one assigned"}
            {nowCell?.phone ? ` · ${nowCell.phone}` : ""}
          </span>
        </p>
      </div>

      {/* Scope + branch controls */}
      <div className="flex flex-wrap items-center gap-3">
        {canChangeScope ? <ScopeToggle scope={scope} /> : null}
        {scope === "branch" && branches.length > 1 ? (
          <select
            aria-label="Branch"
            value={selectedBranchId ?? ""}
            onChange={(e) => router.push(`/on-call?branch=${e.target.value}`)}
            className="w-auto"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        ) : null}
        {scope === "branch" && branches.length === 1 ? (
          <span className="text-sm text-white/50">{branches[0].name}</span>
        ) : null}
      </div>

      {weeks.map((week) => (
        <section key={week.label}>
          <h2 className="mb-2 text-sm font-semibold text-white/80">{week.label}</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  <th className="w-10" />
                  {week.days.map((d) => {
                    const h = dayHeading(d);
                    const isToday = d === todayIso;
                    return (
                      <th key={d} className={`px-1 py-1 text-center text-xs font-semibold ${isToday ? "text-gold-300" : "text-white/60"}`}>
                        {h.dow} {h.dom}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {SLOTS.map((s) => (
                  <tr key={s.key}>
                    <th className="pr-1 text-right align-middle text-xs font-semibold text-white/45">{s.label}</th>
                    {week.days.map((d) => {
                      const cell = cellFor(`${d}|${s.key}`);
                      const isNow = d === todayIso && s.key === currentSlot;
                      const isActive = editing?.date === d && editing?.slot === s.key;
                      const cellClasses = [
                        "h-14 w-full overflow-hidden rounded-lg border px-2 text-left transition",
                        cell ? "border-white/10 bg-white/[0.06]" : "border-dashed border-white/10 bg-transparent",
                        isNow ? "ring-1 ring-gold-400/70" : "",
                      ].join(" ");
                      return (
                        <td key={d}>
                          {isActive && canManage ? (
                            <select
                              autoFocus
                              disabled={pending}
                              defaultValue={cell?.profileId ?? ""}
                              onChange={(e) => pick(d, s.key, e.target.value)}
                              onBlur={() => setEditing(null)}
                              className={`${cellClasses} cursor-pointer text-xs`}
                            >
                              <option value="">{cell ? "Clear" : "Choose…"}</option>
                              {people.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          ) : (
                            <button
                              type="button"
                              disabled={!canManage}
                              onClick={() => canManage && setEditing({ date: d, slot: s.key })}
                              className={`${cellClasses} ${canManage ? "hover:border-gold-400/40 hover:bg-white/[0.09]" : "cursor-default"}`}
                            >
                              {cell ? (
                                <span className="flex h-full flex-col justify-center">
                                  <span className="block truncate text-xs font-medium leading-tight text-white">{firstName(cell.name)}</span>
                                  {surname(cell.name) ? <span className="block truncate text-xs leading-tight text-white/70">{surname(cell.name)}</span> : null}
                                </span>
                              ) : (
                                <span className="text-white/25">{canManage ? "+" : ""}</span>
                              )}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function ScopeToggle({ scope }: { scope: RotaScope }) {
  const [, formAction, pending] = useActionState(setRotaScope, IDLE_STATE);
  return (
    <form action={formAction} className="inline-flex overflow-hidden rounded-lg border border-white/15">
      {(["company", "branch"] as RotaScope[]).map((s) => (
        <button
          key={s}
          type="submit"
          name="scope"
          value={s}
          disabled={pending || scope === s}
          className={`px-3 py-1.5 text-xs font-medium ${scope === s ? "bg-gold-400/20 text-gold-200" : "text-white/60 hover:bg-white/5"}`}
        >
          {s === "company" ? "By company" : "By branch"}
        </button>
      ))}
    </form>
  );
}
