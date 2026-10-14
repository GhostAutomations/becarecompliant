"use client";

/**
 * Be Care Compliant: "Who gets the morning emails" on Settings, Notifications (0475, Phil
 * 2026-10-15; docs/decisions/personal-notifications.md). The four morning emails down the left,
 * each saying what is in it; people across the top; one Receive tick each. Starts as each role
 * was before, so nothing changes until an Admin changes it. Each email still covers only what that
 * person can open. One Save; only people whose ticks changed are sent; a refused save keeps every
 * tick. Company Admin and Founder only; the database refuses anyone else.
 */

import { useActionState, useEffect, useState } from "react";
import { saveMorningEmailGrid } from "@/lib/notifications/preference-actions";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import { submitKeepingTyped } from "@/components/forms/keep-typed";
import { MORNING_EMAILS } from "@/lib/notifications/morning";
import { coversWholeCompany } from "@/lib/notifications/activity";
import type { GridPerson } from "@/components/settings/notification-grid";

export default function MorningEmailGrid({
  people,
  initial,
  branches,
  digestOn,
}: {
  people: GridPerson[];
  /** initial[personId][emailKey] */
  initial: Record<string, Record<string, boolean>>;
  branches: Array<{ id: string; name: string }>;
  /** The company's own "morning emails on" switch, above. */
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

  const setTick = (pid: string, key: string, on: boolean) => {
    reset();
    setChanged((c) => (c.includes(pid) ? c : [...c, pid]));
    setTicks((t) => ({ ...t, [pid]: { ...(t[pid] ?? {}), [key]: on } }));
  };

  return (
    <div className="space-y-3">
      {!digestOn ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          The morning emails are switched off for the company above, so nobody gets them, whatever is ticked here.
        </p>
      ) : null}
      <form id="morning-email-grid" onSubmit={submitKeepingTyped(formAction)}>
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
          <tbody>
            {MORNING_EMAILS.map((m) => (
              <tr key={m.key} className="border-t border-white/5 align-top">
                <th className="sticky left-0 z-10 bg-navy-900 p-2 text-left font-normal">
                  <span className="block font-semibold text-white">{m.name}</span>
                  <span className="block text-[11px] text-white/55">{m.whatsInIt}</span>
                </th>
                {people.map((p) => (
                  <td key={p.id} className="border-l border-white/10 p-1.5 text-center">
                    <input
                      type="checkbox"
                      form="morning-email-grid"
                      name="receive"
                      value={`${p.id}:${m.key}`}
                      checked={ticks[p.id]?.[m.key] ?? false}
                      onChange={(e) => setTick(p.id, m.key, e.target.checked)}
                      aria-label={`${p.name}: ${m.name}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
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
