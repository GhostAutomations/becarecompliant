/**
 * Be Care Compliant — the week's calls, on the record.
 *
 * Phil, 2026-09-09: "i dont like that you cant see it as a rota when it is set up and i dont
 * like that you have to go into history to see it."
 *
 * He was right, and it was the whole point of asking at the setup visit. The package was
 * captured, written to the Care Plan and then only readable by opening a completed form or a
 * second screen. What a manager wants on a service user's record is the week: who comes, when,
 * for how long, and how many of them.
 *
 * Seven columns, Monday to Sunday, in the order the calls actually happen. Days with nothing on
 * them are shown rather than hidden, because an empty Thursday is information — it is how you
 * see a package has a gap in it.
 *
 * Server component: it draws what is stored and links to the editor rather than editing.
 */

import Link from "next/link";
import { CARE_PLAN_DAYS, carersLabel, type CarePlanEntry } from "@/lib/service-users/care-plan-consts";
import { CALL_SLOTS } from "@/lib/service-users/care-package";

/** "Morning", "Lunch"… or "Any time" for a row written before the slot was asked for. */
function slotLabel(slot: string | null): string {
  return CALL_SLOTS.find((s) => s.value === slot)?.label ?? "Any time";
}

/** How Phil reads a call out loud: "Care - 15m - Double Handed". */
function callLine(e: CarePlanEntry): string {
  const parts = [e.service, e.unit, carersLabel(e.carers)];
  return e.quantity > 1 ? `${parts.join(" - ")} ×${e.quantity}` : parts.join(" - ");
}

export default function CareScheduleTile({
  serviceUserId,
  entries,
  canManage,
}: {
  serviceUserId: string;
  entries: CarePlanEntry[];
  canManage: boolean;
}) {
  const byDay = CARE_PLAN_DAYS.map((_, day) => entries.filter((e) => e.day_of_week === day));
  const callsPerWeek = entries.length;

  return (
    <section className="glass-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Care schedule</h2>
          <p className="page-subtitle mt-0.5">
            {callsPerWeek === 0
              ? "No calls scheduled yet."
              : `${callsPerWeek} ${callsPerWeek === 1 ? "call" : "calls"} a week. Invoices are built from this.`}
          </p>
        </div>
        <Link href={`/service-users/${serviceUserId}/care-plan`} className="btn-outline text-xs">
          {canManage && callsPerWeek === 0 ? "Add the schedule" : "Open the care plan"}
        </Link>
      </div>

      {callsPerWeek === 0 ? (
        <p className="mt-4 text-sm text-white/50">
          The schedule is written when the Setup Visit is completed with a care package. You can
          also build it by hand on the care plan.
        </p>
      ) : (
        <div className="mt-4 grid gap-2 grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
          {CARE_PLAN_DAYS.map((day, i) => (
            <div key={day} className="rounded-xl border border-white/10 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">
                {day}
              </p>
              {byDay[i].length === 0 ? (
                <p className="mt-2 text-[12px] text-white/30">No calls</p>
              ) : (
                /* The slot names the call and the detail sits under it, which is how the
                   rota is read: "Morning:" then "Care - 15m - Double Handed". */
                <ul className="mt-2 space-y-2.5">
                  {byDay[i].map((e) => (
                    <li key={e.id} className="text-[12px] leading-tight">
                      <p className="font-semibold text-white/85">{slotLabel(e.slot)}:</p>
                      <p className="mt-0.5 text-white/55">{callLine(e)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
