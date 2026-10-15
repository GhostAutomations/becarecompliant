import type { Metadata } from "next";
import Link from "next/link";
import { requireRotaOffice } from "@/lib/rota/access";
import { getRotaBranches } from "@/lib/rota/data";
import { getCallServiceUsers, getRotaPeople } from "@/lib/rota/visits-data";
import ActionForm from "@/components/rota/rota-action";
import BackLink from "@/components/back-link";
import RotaTabs from "@/components/rota/rota-tabs";
import { addPrefAction, refreshVisitsAction, removePrefAction, saveCallTimeAction } from "@/lib/rota/visit-actions";
import { DAY_NAMES, slotLabel } from "@/lib/rota/calls";

export async function generateMetadata(): Promise<Metadata> {
  await requireRotaOffice();
  return { title: "Call times" };
}

/**
 * Call times (Rota and Visits Stage 2, Phil 2026-10-15). Each call in a service user's Care
 * Schedule (the schedule Invoicing bills from) gets a start time here; visits are made from it
 * four weeks ahead. The Care Schedule itself is changed on the service user's record, as before.
 * Also the service user's preferred carers and carers not to send.
 */
export default async function RotaCallsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const { profile, companyId } = await requireRotaOffice();
  const sp = await searchParams;
  const branches = await getRotaBranches(companyId, !!profile.actingAsCompanyId);
  const branch = branches.find((b) => b.id === sp.branch) ?? branches[0] ?? null;
  const [sus, people] = branch
    ? await Promise.all([getCallServiceUsers(branch.id), getRotaPeople(branches.map((b) => b.id))])
    : [[], []];
  const missing = sus.reduce((n, s) => n + s.calls.filter((c) => !c.startTime || (c.minutes == null && !c.lengthMinutes)).length, 0);

  return (
    <div className="page-shell space-y-5">
      <BackLink href={branch ? `/rota?branch=${branch.id}` : "/rota"} label="Rota" />
      <div className="space-y-1">
        <h1 className="page-title">Call times</h1>
        <p className="text-sm text-white/60">
          Give each call in the Care Schedule a start time, and visits are made from it four weeks ahead. To add or
          change calls, edit the Care Schedule on the service user&apos;s record.
        </p>
      </div>
      {branch ? <RotaTabs active="calls" branchId={branch.id} /> : null}
      {branches.length > 1 ? (
        <nav aria-label="Branch" className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <Link key={b.id} href={`/rota/calls?branch=${b.id}`} className={`pill ${branch && b.id === branch.id ? "pill-amber" : "pill-neutral"}`}>
              {b.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {!branch ? <p className="text-sm text-white/55">You are not linked to a branch yet.</p> : null}
      {branch ? (
        <div className="glass-card flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-white/75">
            {missing ? `${missing} call${missing === 1 ? "" : "s"} still need${missing === 1 ? "s" : ""} a time, so no visits are made for ${missing === 1 ? "it" : "them"} yet.` : "Every call has a time."}
          </p>
          <ActionForm action={refreshVisitsAction} hidden={{ branch_id: branch.id }} label="Bring visits up to date" savingLabel="Updating…" savedLabel="Updated" buttonClassName="btn-outline px-3 py-1.5 text-xs" className="" showOk />
        </div>
      ) : null}
      {branch && sus.length === 0 ? <p className="text-sm text-white/55">No service users in this branch.</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {sus.map((su) => (
          <section key={su.id} aria-label={su.name} className="glass-card space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-white/90">{su.name}</h2>
                <p className="text-xs text-white/50">{su.postcode ?? "No postcode on the record"}</p>
              </div>
              {su.away ? <span className="pill pill-amber">Visits paused</span> : null}
            </div>

            {su.calls.length === 0 ? (
              <p className="text-xs text-white/45">No Care Schedule yet. Add it on the service user&apos;s record.</p>
            ) : (
              <ul className="space-y-1.5">
                {su.calls.map((c) => (
                  <li key={`${c.dayOfWeek}-${c.service}-${c.slotKey}-${c.occurrence}`} className="rounded-lg bg-white/5 px-3 py-2">
                    <ActionForm
                      action={saveCallTimeAction}
                      hidden={{ service_user_id: su.id, day_of_week: String(c.dayOfWeek), service: c.service, slot_key: c.slotKey, occurrence: String(c.occurrence) }}
                      label="Save"
                      className="flex flex-wrap items-end gap-2"
                      buttonClassName="btn-primary px-3 py-1.5 text-xs"
                      showOk
                    >
                      <span className="min-w-[10rem] flex-1 text-sm text-white/85">
                        {DAY_NAMES[c.dayOfWeek]} · {c.service}
                        {c.slotKey ? ` · ${slotLabel(c.slotKey)}` : ""}
                        {c.occurrence > 1 ? ` (${c.occurrence})` : ""}
                        <span className="block text-xs text-white/50">
                          {c.minutes ? `${c.minutes} minutes` : "Fixed price: set the length"}
                          {c.carers > 1 ? ` · ${c.carers} carers` : ""}
                        </span>
                      </span>
                      <label className="w-28">
                        <span className="sr-only">Start time</span>
                        <input type="time" name="start_time" defaultValue={c.startTime ?? ""} aria-label={`Start time, ${DAY_NAMES[c.dayOfWeek]} ${c.service}`} />
                      </label>
                      {c.minutes == null ? (
                        <label className="w-28">
                          <span className="sr-only">Length in minutes</span>
                          <input type="number" name="length_minutes" min={5} max={1440} placeholder="Minutes" defaultValue={c.lengthMinutes ?? ""} />
                        </label>
                      ) : null}
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {(["preferred", "not_to_send"] as const).map((kind) => {
                const list = kind === "preferred" ? su.preferred : su.notToSend;
                return (
                  <div key={kind} className="space-y-1.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">{kind === "preferred" ? "Preferred carers" : "Not to send"}</h3>
                    {list.length === 0 ? <p className="text-xs text-white/40">None.</p> : null}
                    <ul className="space-y-1">
                      {list.map((p) => (
                        <li key={p.personId} className="flex items-center justify-between gap-2 text-sm text-white/80">
                          <span>{p.name}</span>
                          <ActionForm action={removePrefAction} hidden={{ service_user_id: su.id, person_id: p.personId }} label="Remove" savingLabel="Removing…" savedLabel="Removed" buttonClassName="btn-ghost px-2 py-1 text-xs" className="" />
                        </li>
                      ))}
                    </ul>
                    <ActionForm action={addPrefAction} hidden={{ service_user_id: su.id, kind }} label="Add" className="flex items-end gap-2" buttonClassName="btn-outline px-3 py-1.5 text-xs">
                      <select name="person_id" aria-label={kind === "preferred" ? "Add a preferred carer" : "Add to not to send"} defaultValue="" required>
                        <option value="" disabled>
                          Choose a carer
                        </option>
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </ActionForm>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
