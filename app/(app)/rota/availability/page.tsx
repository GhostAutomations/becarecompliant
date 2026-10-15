import type { Metadata } from "next";
import Link from "next/link";
import { requireRotaOffice } from "@/lib/rota/access";
import { getAvailability, getRotaBranches } from "@/lib/rota/data";
import ActionForm from "@/components/rota/rota-action";
import BackLink from "@/components/back-link";
import RotaTabs from "@/components/rota/rota-tabs";
import { addPatternAction, addUnavailableAction, removePatternAction, removeUnavailableAction, setOptOutAction } from "@/lib/rota/actions";
import { WEEKDAY_LABELS, dayLabel } from "@/lib/rota/types";

export async function generateMetadata(): Promise<Metadata> {
  await requireRotaOffice();
  return { title: "Rota availability" };
}

/**
 * When each person can work, recorded by the office only (Phil, 2026-10-15): a weekly pattern,
 * dates they cannot work, and the 48 hour opt out ticked once when they sign it. Approved holiday,
 * absence, parental leave and long term sick count as unavailable on their own; nothing to enter.
 */
export default async function RotaAvailabilityPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const { profile, companyId } = await requireRotaOffice();
  const sp = await searchParams;
  const branches = await getRotaBranches(companyId, !!profile.actingAsCompanyId);
  const branch = branches.find((b) => b.id === sp.branch) ?? branches[0] ?? null;
  const people = branch ? await getAvailability(branch.id) : [];

  return (
    <div className="page-shell space-y-5">
      <BackLink href={branch ? `/rota?branch=${branch.id}` : "/rota"} label="Rota" />
      <div className="space-y-1">
        <h1 className="page-title">Availability</h1>
        <p className="text-sm text-white/60">
          When each person can work. Holiday, absence, parental leave and long term sick are already counted, so there is no need to enter them here.
          With no weekly pattern, a person can be put on at any time.
        </p>
      </div>
      {branch ? <RotaTabs active="availability" branchId={branch.id} /> : null}
      {branches.length > 1 ? (
        <nav aria-label="Branch" className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <Link key={b.id} href={`/rota/availability?branch=${b.id}`} className={`pill ${branch && b.id === branch.id ? "pill-amber" : "pill-neutral"}`}>
              {b.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {!branch ? <p className="text-sm text-white/55">You are not linked to a branch yet.</p> : null}
      {branch && people.length === 0 ? <p className="text-sm text-white/55">Nobody in this branch yet.</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {people.map((p) => (
          <section key={p.id} aria-label={p.name} className="glass-card space-y-3 p-4">
            <div>
              <h2 className="text-sm font-semibold text-white/90">{p.name}</h2>
              {p.jobTitle ? <p className="text-xs text-white/50">{p.jobTitle}</p> : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2">
              <span className="text-sm text-white/80">
                48 hour opt out {p.optedOut ? <span className="pill pill-green">Signed</span> : <span className="pill pill-neutral">Not signed</span>}
              </span>
              <ActionForm
                action={setOptOutAction}
                hidden={{ person_id: p.id, on: p.optedOut ? "no" : "yes" }}
                label={p.optedOut ? "They withdrew it" : "Mark as signed"}
                buttonClassName="btn-ghost px-2 py-1 text-xs"
                className=""
                confirm={p.optedOut ? `Record that ${p.name} has withdrawn the 48 hour opt out? The weekly hours warning comes back.` : undefined}
              />
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">Weekly pattern</h3>
              {p.pattern.length === 0 ? <p className="text-xs text-white/45">None: available any time.</p> : null}
              <ul className="space-y-1">
                {p.pattern.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-2 text-sm text-white/80">
                    <span>
                      {WEEKDAY_LABELS[w.weekday - 1]}, {w.start} to {w.end}
                    </span>
                    <ActionForm action={removePatternAction} hidden={{ id: w.id }} label="Remove" savingLabel="Removing…" savedLabel="Removed" buttonClassName="btn-ghost px-2 py-1 text-xs" className="" />
                  </li>
                ))}
              </ul>
              <ActionForm action={addPatternAction} hidden={{ person_id: p.id }} label="Add" className="grid grid-cols-3 items-end gap-2">
                <label className="block">
                  <span className="form-label">Day</span>
                  <select name="weekday" defaultValue="1">
                    {WEEKDAY_LABELS.map((d, i) => (
                      <option key={d} value={i + 1}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="form-label">From</span>
                  <input type="time" name="start_time" defaultValue="08:00" required />
                </label>
                <label className="block">
                  <span className="form-label">To</span>
                  <input type="time" name="end_time" defaultValue="18:00" required />
                </label>
              </ActionForm>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">Dates they cannot work</h3>
              {p.dates.length === 0 ? <p className="text-xs text-white/45">None coming up.</p> : null}
              <ul className="space-y-1">
                {p.dates.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-sm text-white/80">
                    <span>
                      {dayLabel(d.start)}
                      {d.end !== d.start ? ` to ${dayLabel(d.end)}` : ""}
                      {d.reason ? `: ${d.reason}` : ""}
                    </span>
                    <ActionForm action={removeUnavailableAction} hidden={{ id: d.id }} label="Remove" savingLabel="Removing…" savedLabel="Removed" buttonClassName="btn-ghost px-2 py-1 text-xs" className="" />
                  </li>
                ))}
              </ul>
              <ActionForm action={addUnavailableAction} hidden={{ person_id: p.id }} label="Add dates" className="grid grid-cols-2 items-end gap-2">
                <label className="block">
                  <span className="form-label">First day</span>
                  <input type="date" name="start_date" required />
                </label>
                <label className="block">
                  <span className="form-label">Last day</span>
                  <input type="date" name="end_date" />
                </label>
                <label className="col-span-2 block">
                  <span className="form-label">Reason (optional)</span>
                  <input type="text" name="reason" maxLength={200} placeholder="e.g. College course" />
                </label>
              </ActionForm>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
