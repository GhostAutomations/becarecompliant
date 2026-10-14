"use client";

/**
 * Be Care Compliant: Notifications on a login (0473, Phil 2026-10-14;
 * docs/decisions/personal-notifications.md). One row per check type the company has, with two
 * ticks: Recent activity (their dashboard tile) and Email. Email comes with Recent activity. Below,
 * the branches they are told about: every branch they belong to, and the Admin can add one, which
 * also lets them open that branch's records (Phil, popup). Company Admin and Founder only; the
 * database refuses anyone else. A refused save keeps every tick.
 */

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addNotificationBranch,
  loadNotificationSettings,
  saveNotificationSettings,
  type NotificationPrefRow,
} from "@/lib/notifications/preference-actions";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import { submitKeepingTyped } from "@/components/forms/keep-typed";
import { activityTitle, canBeNotified, coversWholeCompany } from "@/lib/notifications/activity";

type Branch = { id: string; name: string };

export default function NotificationPrefsForm({
  userId,
  role,
  roleLabel,
  primaryBranchId,
  additionalBranchIds,
  branches,
}: {
  userId: string;
  role: string;
  roleLabel: string;
  primaryBranchId: string | null;
  additionalBranchIds: string[];
  branches: Branch[];
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<{ rows: NotificationPrefRow[]; emailConfigured: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ticks, setTicks] = useState<Record<string, { inApp: boolean; email: boolean }>>({});
  const notifiable = canBeNotified(role);

  useEffect(() => {
    if (!notifiable) return;
    let live = true;
    loadNotificationSettings(userId).then((r) => {
      if (!live) return;
      if (!r.ok) {
        setLoadError(r.error);
        return;
      }
      setLoaded({ rows: r.rows, emailConfigured: r.emailConfigured });
      setTicks(Object.fromEntries(r.rows.map((x) => [x.definitionId, { inApp: x.inApp, email: x.email }])));
    });
    return () => {
      live = false;
    };
  }, [userId, notifiable]);

  const [state, formAction, pending] = useActionState(saveNotificationSettings, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  useEffect(() => {
    if (state.ok && !pending) flash();
  }, [state, pending, flash]);

  const [branchState, branchAction, branchPending] = useActionState(addNotificationBranch, IDLE_STATE);
  useEffect(() => {
    if (branchState.ok && !branchPending) router.refresh();
  }, [branchState, branchPending, router]);

  if (!notifiable) {
    return (
      <p className="text-xs text-white/50">
        A {roleLabel} cannot open other people&rsquo;s checks, so they cannot be told when one is completed.
      </p>
    );
  }
  if (loadError) return <p className="text-xs text-red-300">The notifications could not be read: {loadError}</p>;
  if (!loaded) return <p className="text-xs text-white/50">Loading notifications…</p>;

  const setTick = (id: string, which: "inApp" | "email", on: boolean) => {
    reset();
    setTicks((t) => {
      const cur = t[id] ?? { inApp: false, email: false };
      const next =
        which === "email"
          ? { inApp: on ? true : cur.inApp, email: on }
          : { inApp: on, email: on ? cur.email : false };
      return { ...t, [id]: next };
    });
  };

  const groups: Array<{ title: string; rows: NotificationPrefRow[] }> = [
    { title: "People", rows: loaded.rows.filter((r) => r.population === "people") },
    { title: "Service Users", rows: loaded.rows.filter((r) => r.population === "service_users") },
  ].filter((g) => g.rows.length > 0);

  const mine = [primaryBranchId, ...additionalBranchIds].filter((x): x is string => !!x);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const addable = branches.filter((b) => !mine.includes(b.id));

  return (
    <div className="space-y-4">
      {!loaded.emailConfigured ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Emails are not set up on this site (RESEND_API_KEY and RESEND_FROM), so the Email tick sends nothing until they are.
          Recent activity still works.
        </p>
      ) : null}

      <form onSubmit={submitKeepingTyped(formAction)} className="space-y-3">
        <input type="hidden" name="user_id" value={userId} />
        {groups.length === 0 ? (
          <p className="text-xs text-white/50">This company has no check types yet.</p>
        ) : (
          groups.map((g) => (
            <table key={g.title} className="w-full text-xs">
              <thead>
                <tr className="text-left text-white/50">
                  <th className="py-1 font-medium">{g.title}</th>
                  <th className="w-24 py-1 text-center font-medium">Recent activity</th>
                  <th className="w-16 py-1 text-center font-medium">Email</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => {
                  const t = ticks[r.definitionId] ?? { inApp: false, email: false };
                  return (
                    <tr key={r.definitionId} className="border-t border-white/5">
                      <td className="py-1.5 text-white/80">
                        <input type="hidden" name="definition_id" value={r.definitionId} />
                        {activityTitle(r.checkName)}
                      </td>
                      <td className="py-1.5 text-center">
                        <input
                          type="checkbox"
                          name="in_app"
                          value={r.definitionId}
                          checked={t.inApp}
                          onChange={(e) => setTick(r.definitionId, "inApp", e.target.checked)}
                          aria-label={`${activityTitle(r.checkName)}: Recent activity`}
                        />
                      </td>
                      <td className="py-1.5 text-center">
                        <input
                          type="checkbox"
                          name="email"
                          value={r.definitionId}
                          checked={t.email}
                          onChange={(e) => setTick(r.definitionId, "email", e.target.checked)}
                          aria-label={`${activityTitle(r.checkName)}: Email`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ))
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={saved ? "btn-saved" : "btn-primary"}>
            {pending ? "Saving…" : saved ? "Saved" : "Save notifications"}
          </button>
          {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
        </div>
      </form>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-white/70">Branches</p>
        {coversWholeCompany(role) ? (
          <p className="text-xs text-white/50">Every branch: a {roleLabel} covers the whole company.</p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-1.5">
              {mine.length === 0 ? <li className="text-xs text-white/50">No branch yet.</li> : null}
              {mine.map((id) => (
                <li key={id} className="pill-neutral">
                  {branchName.get(id) ?? "Branch"}
                  {id === primaryBranchId ? " (own branch)" : ""}
                </li>
              ))}
            </ul>
            {addable.length > 0 ? (
              <form onSubmit={submitKeepingTyped(branchAction)} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="user_id" value={userId} />
                <div className="min-w-0 flex-1">
                  <label htmlFor={`nb-${userId}`} className="form-label">
                    Add a branch
                  </label>
                  <select id={`nb-${userId}`} name="branch_id" defaultValue="">
                    <option value="">Choose a branch</option>
                    {addable.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" disabled={branchPending} className="btn-primary">
                  {branchPending ? "Adding…" : "Add"}
                </button>
              </form>
            ) : null}
            {branchState.error ? <p className="text-xs text-red-300">{branchState.error}</p> : null}
            <p className="text-xs text-white/45">
              They are told about completions in these branches only. Adding a branch also lets them open that branch&rsquo;s records.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
