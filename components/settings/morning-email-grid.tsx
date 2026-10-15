"use client";

/**
 * Be Care Compliant: "Who gets the morning emails" on Settings, Notifications (0475, 0476, Phil
 * 2026-10-15; docs/decisions/personal-notifications.md). Down the left: the Branch digest, the
 * People report and the Service User report broken into their parts (each check type; for People
 * also Training, Social Care Wales, DBS and Right to Work), and Briefings overdue. People across the
 * top, one Receive tick each. The report bands carry an "all" box per person, ticked only when
 * every part under it is. Starts as each role got them before. Each email still covers only what
 * that person can open. One Save; a refused save keeps every tick. Admin and Founder only.
 */

import { useActionState, useEffect, useState } from "react";
import { saveMorningEmailGrid } from "@/lib/notifications/preference-actions";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import { submitKeepingTyped } from "@/components/forms/keep-typed";
import { MORNING_EMAILS } from "@/lib/notifications/morning";
import { coversWholeCompany } from "@/lib/notifications/activity";
import type { GridPerson } from "@/components/settings/notification-grid";

export type MorningPart = { key: string; part: string; name: string };
const cell = (p: MorningPart) => `${p.key}|${p.part}`;

export default function MorningEmailGrid({
  people,
  parts,
  initial,
  branches,
  digestOn,
}: {
  people: GridPerson[];
  parts: MorningPart[];
  /** initial[personId]["key|part"] */
  initial: Record<string, Record<string, boolean>>;
  branches: Array<{ id: string; name: string }>;
  digestOn: boolean;
}) {
  const [ticks, setTicks] = useState(initial);
  const [changed, setChanged] = useState<string[]>([]);
  const [state, formAction, pending] = useActionState(saveMorningEmailGrid, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  useEffect(() => {
    if (state.ok && !pending) {
      flash();
      setChanged([]);
    }
  }, [state, pending, flash]);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  if (people.length === 0) {
    return <p className="text-sm text-white/60">Nobody here can get the morning emails yet.</p>;
  }

  const setMany = (pid: string, cells: MorningPart[], on: boolean) => {
    reset();
    setChanged((c) => (c.includes(pid) ? c : [...c, pid]));
    setTicks((t) => {
      const mine = { ...(t[pid] ?? {}) };
      for (const p of cells) mine[cell(p)] = on;
      return { ...t, [pid]: mine };
    });
  };
  const isOn = (pid: string, p: MorningPart) => ticks[pid]?.[cell(p)] ?? false;

  const tickCell = (person: GridPerson, p: MorningPart) => (
    <td key={person.id} className="border-l border-white/10 p-1.5 text-center">
      <input
        type="checkbox"
        form="morning-email-grid"
        name="receive"
        value={`${person.id}~${p.key}~${p.part}`}
        checked={isOn(person.id, p)}
        onChange={(e) => setMany(person.id, [p], e.target.checked)}
        aria-label={`${person.name}: ${p.name}`}
      />
    </td>
  );

  const emailMeta = (key: string) => MORNING_EMAILS.find((m) => m.key === key)!;

  return (
    <div className="space-y-3">
      {!digestOn ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          The morning emails are switched off for the company above, so nobody gets them, whatever is ticked here.
        </p>
      ) : null}
      <form id="morning-email-grid" onSubmit={submitKeepingTyped(formAction)}>
        {parts.map((p) => (
          <input key={cell(p)} type="hidden" name="part" value={`${p.key}~${p.part}`} />
        ))}
        {changed.map((pid) => (
          <input key={pid} type="hidden" name="changed" value={pid} />
        ))}
      </form>
      <div className="notify-grid overflow-x-auto rounded-xl border border-white/10">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="align-top">
              <th className="sticky left-0 z-10 min-w-[14rem] bg-navy-900 p-2 text-left font-medium text-white/50">Morning email</th>
              {people.map((p) => (
                <th key={p.id} className="min-w-[8rem] border-l border-white/10 p-2 text-left font-normal">
                  <span className="block font-semibold text-white">{p.name}</span>
                  <span className="block text-white/50">
                    {p.roleLabel}
                    {p.invited ? ", invited" : ""}
                  </span>
                  <span className="mt-1 block text-white/70">
                    {coversWholeCompany(p.role)
                      ? "All branches"
                      : p.branchIds.length === 0
                        ? "No branch yet"
                        : p.branchIds.map((b) => branchName.get(b) ?? "Branch").join(", ")}
                  </span>
                </th>
              ))}
            </tr>
            <tr className="text-white/45">
              <th className="sticky left-0 z-10 bg-navy-900 p-2" />
              {people.map((p) => (
                <th key={p.id} className="border-l border-white/10 p-1 text-center font-normal">
                  Receive
                </th>
              ))}
            </tr>
          </thead>
          {MORNING_EMAILS.map((m) => {
            const mine = parts.filter((p) => p.key === m.key);
            if (mine.length === 0) return null;
            const whole = m.key === "branch_digest" || m.key === "briefings_overdue";
            if (whole) {
              const p = mine[0];
              return (
                <tbody key={m.key}>
                  <tr className="border-t-2 border-white/20 align-top">
                    <th className="sticky left-0 z-10 bg-navy-900 p-2 text-left font-normal">
                      <span className="block text-sm font-bold text-white">{m.name}</span>
                      <span className="block text-[11px] text-white/55">{m.whatsInIt}</span>
                    </th>
                    {people.map((person) => tickCell(person, p))}
                  </tr>
                </tbody>
              );
            }
            return (
              <tbody key={m.key}>
                {/* The report's band: bold, shaded, with an "all" box per person. */}
                <tr className="border-t-2 border-white/20 bg-navy-800 align-top">
                  <th className="sticky left-0 z-10 bg-navy-800 p-2 text-left font-normal">
                    <span className="block text-sm font-bold text-white">{m.name}</span>
                    <span className="block text-[11px] text-white/55">{emailMeta(m.key).whatsInIt}</span>
                  </th>
                  {people.map((person) => (
                    <td key={person.id} className="border-l border-white/10 p-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={mine.every((p) => isOn(person.id, p))}
                        onChange={(e) => setMany(person.id, mine, e.target.checked)}
                        aria-label={`${person.name}: all of the ${m.name}`}
                      />
                    </td>
                  ))}
                </tr>
                {mine.map((p) => (
                  <tr key={cell(p)} className="border-t border-white/5">
                    <th className="sticky left-0 z-10 bg-navy-900 p-2 pl-4 text-left font-normal text-white/80">{p.name}</th>
                    {people.map((person) => tickCell(person, p))}
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" form="morning-email-grid" disabled={pending} className={saved ? "btn-saved" : "btn-primary"}>
          {pending ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
        {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
      </div>
      <p className="text-xs text-white/45">
        Each email covers only what that person can open: the whole company for an Admin, Responsible Individual, Registered Manager or
        Recruiter, their branches for anyone else. The ticks start as each role got them before.
      </p>
    </div>
  );
}
