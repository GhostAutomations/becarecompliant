"use client";

/**
 * Be Care Compliant: "Who is told when a check is completed" on Settings, Notifications (0473,
 * Phil 2026-10-14; docs/decisions/personal-notifications.md). Check types down the left, people
 * across the top, two ticks each: Recent activity and Email (Email comes with Recent activity).
 * Under each name, the branches they are told about, with Add a branch, which also gives them
 * access to it. One Save for the whole grid; only the people whose ticks changed are sent. A
 * refused save keeps every tick. Company Admin and Founder only; the database refuses anyone else.
 */

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addNotificationBranch, saveNotificationGrid } from "@/lib/notifications/preference-actions";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import { submitKeepingTyped } from "@/components/forms/keep-typed";
import { activityTitle, coversWholeCompany } from "@/lib/notifications/activity";

export type GridPerson = {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  invited: boolean;
  primaryBranchId: string | null;
  branchIds: string[];
};
export type GridDefinition = { id: string; population: "people" | "service_users"; name: string };
type Tick = { inApp: boolean; email: boolean };

function BranchAdd({ person, branches }: { person: GridPerson; branches: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(addNotificationBranch, IDLE_STATE);
  useEffect(() => {
    if (state.ok && !pending) router.refresh();
  }, [state, pending, router]);
  const addable = branches.filter((b) => !person.branchIds.includes(b.id));
  if (addable.length === 0) return null;
  return (
    <form onSubmit={submitKeepingTyped(action)} className="mt-1 space-y-1">
      <input type="hidden" name="user_id" value={person.id} />
      <select name="branch_id" defaultValue="" aria-label={`Add a branch for ${person.name}`}>
        <option value="">Add a branch</option>
        {addable.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="btn-outline btn-xs">
        {pending ? "Adding…" : "Add"}
      </button>
      {state.error ? <p className="text-[11px] text-red-300">{state.error}</p> : null}
    </form>
  );
}

export default function NotificationGrid({
  people,
  definitions,
  initial,
  branches,
  emailConfigured,
}: {
  people: GridPerson[];
  definitions: GridDefinition[];
  /** initial[personId][definitionId] */
  initial: Record<string, Record<string, Tick>>;
  branches: Array<{ id: string; name: string }>;
  emailConfigured: boolean;
}) {
  const [ticks, setTicks] = useState(initial);
  const [changed, setChanged] = useState<string[]>([]);
  const [state, formAction, pending] = useActionState(saveNotificationGrid, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  useEffect(() => {
    if (state.ok && !pending) {
      flash();
      setChanged([]);
    }
  }, [state, pending, flash]);

  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  const setTick = (pid: string, did: string, which: "inApp" | "email", on: boolean) => {
    reset();
    setChanged((c) => (c.includes(pid) ? c : [...c, pid]));
    setTicks((t) => {
      const cur = t[pid]?.[did] ?? { inApp: false, email: false };
      const next = which === "email" ? { inApp: on ? true : cur.inApp, email: on } : { inApp: on, email: on ? cur.email : false };
      return { ...t, [pid]: { ...(t[pid] ?? {}), [did]: next } };
    });
  };

  /* "ALL" ON EACH HEADING BAND (Phil, 2026-10-15): one box per person per tick column that sets
     every check in that group at once. Shown ticked only when every box below it is ticked (popup:
     "Empty until all are ticked"). Like a single tick, Email also ticks Recent activity. */
  const setGroup = (pid: string, rows: GridDefinition[], which: "inApp" | "email", on: boolean) => {
    reset();
    setChanged((c) => (c.includes(pid) ? c : [...c, pid]));
    setTicks((t) => {
      const mine = { ...(t[pid] ?? {}) };
      for (const d of rows) {
        const cur = mine[d.id] ?? { inApp: false, email: false };
        mine[d.id] = which === "email" ? { inApp: on ? true : cur.inApp, email: on } : { inApp: on, email: on ? cur.email : false };
      }
      return { ...t, [pid]: mine };
    });
  };
  const allOn = (pid: string, rows: GridDefinition[], which: "inApp" | "email") =>
    rows.length > 0 && rows.every((d) => (ticks[pid]?.[d.id] ?? { inApp: false, email: false })[which]);

  if (people.length === 0) {
    return (
      <p className="text-sm text-white/60">
        Nobody here can be told about completed checks yet. Admins, Registered Managers, Branch Managers, Supervisors and Recruiters appear
        here once they are invited.
      </p>
    );
  }

  const groups: Array<{ title: string; rows: GridDefinition[] }> = [
    { title: "People", rows: definitions.filter((d) => d.population === "people") },
    { title: "Service Users", rows: definitions.filter((d) => d.population === "service_users") },
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-3">
      {!emailConfigured ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Emails are not set up on this site (RESEND_API_KEY and RESEND_FROM), so the Email ticks send nothing until they are. Recent
          activity still works.
        </p>
      ) : null}

      <form id="notification-grid" onSubmit={submitKeepingTyped(formAction)}>
        {definitions.map((d) => (
          <input key={d.id} type="hidden" name="definition_id" value={d.id} />
        ))}
        {changed.map((pid) => (
          <input key={pid} type="hidden" name="changed" value={pid} />
        ))}
      </form>

      <div className="notify-grid overflow-x-auto rounded-xl border border-white/10">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="align-top">
              <th className="sticky left-0 z-10 min-w-[11rem] bg-navy-900 p-2 text-left font-medium text-white/50">
                Told when completed
              </th>
              {people.map((p) => (
                <th key={p.id} colSpan={2} className="min-w-[9.5rem] border-l border-white/10 p-2 text-left font-normal">
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
                  {coversWholeCompany(p.role) ? null : <BranchAdd person={p} branches={branches} />}
                </th>
              ))}
            </tr>
            <tr className="text-white/45">
              <th className="sticky left-0 z-10 bg-navy-900 p-2" />
              {people.map((p) => (
                <th key={p.id} colSpan={2} className="border-l border-white/10 p-0">
                  <div className="grid grid-cols-2 text-center font-normal">
                    <span className="p-1">Recent activity</span>
                    <span className="p-1">Email</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.title}>
              {/* The heading band: its own shaded row, bold white, with the "all" boxes. */}
              <tr className="border-t-2 border-white/20 bg-navy-800">
                <th className="sticky left-0 z-10 bg-navy-800 p-2 text-left text-sm font-bold text-white">
                  {g.title}
                  <span className="block text-[11px] font-normal text-white/50">All {g.title.toLowerCase()} checks</span>
                </th>
                {people.map((p) => (
                  <td key={p.id} colSpan={2} className="border-l border-white/10 p-0">
                    <div className="grid grid-cols-2 text-center">
                      <span className="p-1.5">
                        <input
                          type="checkbox"
                          checked={allOn(p.id, g.rows, "inApp")}
                          onChange={(e) => setGroup(p.id, g.rows, "inApp", e.target.checked)}
                          aria-label={`${p.name}: all ${g.title} checks, Recent activity`}
                        />
                      </span>
                      <span className="p-1.5">
                        <input
                          type="checkbox"
                          checked={allOn(p.id, g.rows, "email")}
                          onChange={(e) => setGroup(p.id, g.rows, "email", e.target.checked)}
                          aria-label={`${p.name}: all ${g.title} checks, Email`}
                        />
                      </span>
                    </div>
                  </td>
                ))}
              </tr>
              {g.rows.map((d) => (
                <tr key={d.id} className="border-t border-white/5">
                  <th className="sticky left-0 z-10 bg-navy-900 p-2 text-left font-normal text-white/80">{activityTitle(d.name)}</th>
                  {people.map((p) => {
                    const t = ticks[p.id]?.[d.id] ?? { inApp: false, email: false };
                    return (
                      <td key={p.id} colSpan={2} className="border-l border-white/10 p-0">
                        <div className="grid grid-cols-2 text-center">
                          <span className="p-1.5">
                            <input
                              type="checkbox"
                              form="notification-grid"
                              name="in_app"
                              value={`${p.id}:${d.id}`}
                              checked={t.inApp}
                              onChange={(e) => setTick(p.id, d.id, "inApp", e.target.checked)}
                              aria-label={`${p.name}: ${activityTitle(d.name)}, Recent activity`}
                            />
                          </span>
                          <span className="p-1.5">
                            <input
                              type="checkbox"
                              form="notification-grid"
                              name="email"
                              value={`${p.id}:${d.id}`}
                              checked={t.email}
                              onChange={(e) => setTick(p.id, d.id, "email", e.target.checked)}
                              aria-label={`${p.name}: ${activityTitle(d.name)}, Email`}
                            />
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" form="notification-grid" disabled={pending} className={saved ? "btn-saved" : "btn-primary"}>
          {pending ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
        {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
      </div>
      <p className="text-xs text-white/45">
        Each person is told about completions in the branches under their name, and only about records they can open. Adding a branch also
        lets them open that branch&rsquo;s records. Carers, Viewers and On Call cannot open other people&rsquo;s checks, so they are not listed.
      </p>
    </div>
  );
}
