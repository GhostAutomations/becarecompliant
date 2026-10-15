import { createClient } from "@/lib/supabase/server";
import ActionForm from "@/components/rota/rota-action";
import { requestOpenShiftAction, withdrawOpenRequestAction } from "@/lib/rota/actions";
import { addDaysIso } from "@/lib/rota/working-time";
import { dayLabel, hhmm } from "@/lib/rota/types";

/**
 * Be Care Compliant: a carer's own rota in their portal (Rota and Visits Stage 1, Phil 2026-10-15).
 *
 * Rendered by /my ONLY when the company has the module on, so it is the only place its queries
 * run. Their own published shifts for the next four weeks, and the open shifts in their branch
 * they could work, to ask for. They never see colleagues' shifts (Phil's popup, 2026-10-15).
 * Everything is read under their own RLS.
 */
export default async function MyRota({ personId }: { personId: string }) {
  const supabase = await createClient();
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const [{ data: mine }, { data: open }, { data: requests }, { data: visitRows }] = await Promise.all([
    supabase
      .from("rota_assignments")
      .select("id, rota_shifts!inner(id, shift_date, start_time, end_time, break_minutes, location, notes, status)")
      .eq("person_id", personId)
      .eq("status", "active")
      .gte("rota_shifts.shift_date", todayIso)
      .lte("rota_shifts.shift_date", addDaysIso(todayIso, 27))
      .eq("rota_shifts.status", "published"),
    supabase.rpc("rota_my_open_shifts"),
    supabase.from("rota_open_requests").select("id, shift_id").eq("person_id", personId).eq("status", "pending"),
    // Their own published visits: name, address and time only (Phil's popup, 2026-10-15).
    supabase.rpc("rota_my_visits"),
  ]);
  type MV = { visit_id: string; visit_date: string; start_time: string; end_time: string; service_user_name: string; address: { line1?: string | null; line2?: string | null; city?: string | null; postcode?: string | null } | null; paused: boolean; colleagues: number };
  const visits = (visitRows as MV[] | null) ?? [];
  type M = { id: string; rota_shifts: { id: string; shift_date: string; start_time: string; end_time: string; break_minutes: number; location: string | null; notes: string | null } };
  type O = { shift_id: string; shift_date: string; start_time: string; end_time: string; location: string | null; branch_name: string; requested: boolean };
  const shifts = ((mine as unknown as M[] | null) ?? [])
    .map((m) => m.rota_shifts)
    .sort((a, b) => (a.shift_date + a.start_time).localeCompare(b.shift_date + b.start_time));
  const openShifts = (open as O[] | null) ?? [];
  const requestFor = new Map(((requests as { id: string; shift_id: string }[] | null) ?? []).map((r) => [r.shift_id, r.id]));

  return (
    <>
      <section className="space-y-3" aria-label="My shifts">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">My shifts</h2>
        {shifts.length === 0 ? (
          <div className="glass-card p-4 text-sm text-white/60">No shifts published for you in the next four weeks.</div>
        ) : (
          <div className="glass-card divide-y divide-white/10">
            {shifts.map((s) => (
              <div key={s.id} className="p-4">
                <p className="text-sm font-semibold text-white">
                  {dayLabel(s.shift_date)}, {hhmm(s.start_time)} to {hhmm(s.end_time)}
                </p>
                <p className="text-xs text-white/55">
                  {[s.location, s.break_minutes ? `${s.break_minutes} minute break` : null].filter(Boolean).join(" · ")}
                </p>
                {s.notes ? <p className="mt-1 text-xs text-white/60">{s.notes}</p> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {visits.length ? (
        <section className="space-y-3" aria-label="My visits">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">My visits</h2>
          <div className="glass-card divide-y divide-white/10">
            {visits.map((v) => (
              <div key={v.visit_id} className={`p-4 ${v.paused ? "opacity-70" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white">
                    {dayLabel(v.visit_date)}, {hhmm(v.start_time)} to {hhmm(v.end_time)}
                  </p>
                  {v.paused ? <span className="pill pill-amber">Paused: do not go</span> : null}
                </div>
                <p className="text-sm text-white/80">{v.service_user_name}</p>
                <p className="text-xs text-white/55">
                  {[v.address?.line1, v.address?.line2, v.address?.city, v.address?.postcode].filter(Boolean).join(", ") || "No address on file: ask the office"}
                </p>
                {v.colleagues > 0 ? <p className="text-xs text-white/45">Double up: {v.colleagues + 1} carers</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {openShifts.length ? (
        <section className="space-y-3" aria-label="Open shifts">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Open shifts you can ask for</h2>
          <div className="glass-card divide-y divide-white/10">
            {openShifts.map((o) => {
              const requestId = requestFor.get(o.shift_id);
              return (
                <div key={o.shift_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {dayLabel(o.shift_date)}, {hhmm(o.start_time)} to {hhmm(o.end_time)}
                    </p>
                    <p className="text-xs text-white/55">{[o.location, o.branch_name].filter(Boolean).join(" · ")}</p>
                  </div>
                  {requestId ? (
                    <div className="flex items-center gap-2">
                      <span className="pill pill-amber">Asked</span>
                      <ActionForm action={withdrawOpenRequestAction} hidden={{ request_id: requestId }} label="Withdraw" savingLabel="Withdrawing…" savedLabel="Withdrawn" buttonClassName="btn-ghost px-3 py-1.5 text-xs" className="" />
                    </div>
                  ) : (
                    <ActionForm action={requestOpenShiftAction} hidden={{ shift_id: o.shift_id }} label="Ask for this shift" savingLabel="Asking…" savedLabel="Asked" buttonClassName="btn-primary px-3 py-1.5 text-xs" className="" showOk />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );
}
