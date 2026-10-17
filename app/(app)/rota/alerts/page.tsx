import type { Metadata } from "next";
import Link from "next/link";
import { requireRotaOffice } from "@/lib/rota/access";
import { getRotaBranches } from "@/lib/rota/data";
import { createClient } from "@/lib/supabase/server";
import RotaTabs from "@/components/rota/rota-tabs";
import RealtimeRefresh from "@/components/realtime-refresh";
import AlertClearForm from "@/components/rota/alert-clear-form";
import { ALERT_KIND_WORDS, clearReasonLabel, type AlertKind } from "@/lib/rota/alerts";
import { dayLabel } from "@/lib/rota/types";

export async function generateMetadata(): Promise<Metadata> {
  await requireRotaOffice();
  return { title: "Alerts" };
}

function londonWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}

/**
 * Alerts (Rota and Visits Stage 7, Phil 2026-10-17; docs/decisions/rota-visits.md, Stage 7 decision
 * 10): every late, missed and dose not recorded alert for the branch, open ones first, with how
 * many people were told and when. A Supervisor or above clears each down with a reason; the reason,
 * who and when stay as the record. Office roles only (RLS); updates by itself.
 */
export default async function RotaAlertsPage({ searchParams }: { searchParams: Promise<{ branch?: string; show?: string }> }) {
  const { profile, companyId } = await requireRotaOffice();
  const sp = await searchParams;
  const branches = await getRotaBranches(companyId, !!profile.actingAsCompanyId);
  const branch = branches.find((b) => b.id === sp.branch) ?? branches[0] ?? null;
  const showAll = sp.show === "all";

  type A = {
    id: string;
    kind: AlertKind;
    urgent: boolean;
    detail: { not_clocked_in?: string[]; medicines?: string[] } | null;
    notified: number;
    raised_at: string;
    cleared_at: string | null;
    clear_reason: string | null;
    clear_text: string | null;
    rota_visits: { id: string; visit_date: string; start_time: string; end_time: string } | null;
    service_users: { full_name: string } | null;
    clearer: { full_name: string | null } | null;
  };
  let alerts: A[] = [];
  if (branch) {
    const supabase = await createClient();
    let q = supabase
      .from("rota_visit_alerts")
      .select("id, kind, urgent, detail, notified, raised_at, cleared_at, clear_reason, clear_text, rota_visits(id, visit_date, start_time, end_time), service_users(full_name), clearer:profiles!rota_visit_alerts_cleared_by_fkey(full_name)")
      .eq("branch_id", branch.id)
      .order("raised_at", { ascending: false })
      .limit(200);
    if (!showAll) q = q.or(`cleared_at.is.null,raised_at.gte.${new Date(Date.now() - 7 * 86400_000).toISOString()}`);
    const { data } = await q;
    alerts = (data as unknown as A[] | null) ?? [];
    alerts.sort((a, b) => Number(!a.cleared_at) === Number(!b.cleared_at) ? Date.parse(b.raised_at) - Date.parse(a.raised_at) : Number(!b.cleared_at) - Number(!a.cleared_at));
  }
  const open = alerts.filter((a) => !a.cleared_at).length;

  return (
    <div className="page-shell space-y-5">
      <RealtimeRefresh tables={["rota_visit_alerts"]} channel="rota-alerts" />
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="page-title">Alerts</h1>
          <span className="pill pill-amber">Beta</span>
        </div>
        <p className="text-sm text-white/60">Late, missed and dose not recorded alerts. Each one is cleared down by a Supervisor or above, with a reason.</p>
      </div>
      {branch ? <RotaTabs active="alerts" branchId={branch.id} /> : null}
      {branches.length > 1 && branch ? (
        <nav aria-label="Branch" className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <Link key={b.id} href={`/rota/alerts?branch=${b.id}`} className={`pill ${b.id === branch.id ? "pill-amber" : "pill-neutral"}`}>
              {b.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {!branch ? (
        <section className="glass-card p-6 text-center text-sm text-white/60">You are not linked to a branch yet.</section>
      ) : (
        <section aria-label="Alerts" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-white">Open ({open})</h2>
            <Link href={`/rota/alerts?branch=${branch.id}${showAll ? "" : "&show=all"}`} className="text-xs text-amber-300 underline">
              {showAll ? "Show open and the last 7 days" : "Show every alert"}
            </Link>
          </div>
          {alerts.length === 0 ? (
            <div className="glass-card p-6 text-center text-sm text-white/60">No alerts. Late, missed and dose not recorded alerts appear here as they happen.</div>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {alerts.map((a) => {
                const v = a.rota_visits;
                const people = a.detail?.not_clocked_in ?? [];
                const meds = a.detail?.medicines ?? [];
                return (
                  <li
                    key={a.id}
                    className={`flex flex-col gap-2 rounded-xl border p-3 ${a.cleared_at ? "border-white/10 bg-white/5 opacity-80" : a.urgent ? "border-red-500/70 bg-red-500/10" : "border-amber-400/60 bg-amber-400/10"}`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`pill ${a.cleared_at ? "pill-neutral" : "pill-red"}`}>{ALERT_KIND_WORDS[a.kind]}</span>
                      {a.urgent ? <span className="pill pill-red">Urgent: time sensitive medicine</span> : null}
                      {a.cleared_at ? <span className="pill pill-green">Cleared</span> : null}
                    </div>
                    <p className="text-sm font-semibold text-white">{a.service_users?.full_name ?? "Service user"}</p>
                    {v ? (
                      <p className="text-xs text-white/70">
                        {dayLabel(v.visit_date)}, {v.start_time.slice(0, 5)} to {v.end_time.slice(0, 5)}
                      </p>
                    ) : null}
                    {a.kind !== "dose_not_recorded" && people.length ? <p className="text-xs text-white/70">Not clocked in: {people.join(", ")}</p> : null}
                    {a.kind === "late" && !people.length ? <p className="text-xs text-white/70">No carer on this visit.</p> : null}
                    {meds.length ? <p className="text-xs text-white/70">{a.kind === "dose_not_recorded" ? "Not recorded" : "Medicines due"}: {meds.join(", ")}</p> : null}
                    <p className="text-xs text-white/50">
                      Raised {londonWhen(a.raised_at)} · {a.notified} {a.notified === 1 ? "person" : "people"} told
                    </p>
                    {v ? (
                      <Link href={`/rota/visits?branch=${branch.id}&date=${v.visit_date}#visit-${v.id}`} className="text-xs text-amber-300 underline">
                        Open the visit
                      </Link>
                    ) : null}
                    <div className="mt-auto">
                      {a.cleared_at ? (
                        <p className="text-xs text-white/70">
                          Cleared by {a.clearer?.full_name ?? "the office"} {londonWhen(a.cleared_at)}: {clearReasonLabel(a.clear_reason, a.clear_text)}
                        </p>
                      ) : (
                        <AlertClearForm alertId={a.id} kind={a.kind} />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
