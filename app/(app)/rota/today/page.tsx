import type { Metadata } from "next";
import Link from "next/link";
import dynamic from "next/dynamic";
import { requireRotaOffice } from "@/lib/rota/access";
import { getRotaBranches } from "@/lib/rota/data";
import { getDayVisits } from "@/lib/rota/visits-data";
import { getRotaSettings } from "@/lib/rota/settings";
import { createClient } from "@/lib/supabase/server";
import RotaTabs from "@/components/rota/rota-tabs";
import RealtimeRefresh from "@/components/realtime-refresh";
import AutoRefresh from "@/components/rota/auto-refresh";
import { TODAY_STATUS_WORDS, arrivalWords, todayStatus, todayTone, type TodayStatus } from "@/lib/rota/alerts";
import type { MapHome, MapTap } from "@/components/rota/today-map";

const TodayMap = dynamic(() => import("@/components/rota/today-map"));

export async function generateMetadata(): Promise<Metadata> {
  await requireRotaOffice();
  return { title: "Today" };
}

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}

/**
 * Today (Rota and Visits Stage 7, Phil's popups 2026-10-17; docs/decisions/rota-visits.md, Stage 7):
 * one branch's published visits today, live. Counts at the top (late, missed, overrunning, not done),
 * each visit with its status and carers, and a map of today's clock taps beside the homes. Updates
 * by itself when anything is recorded, and every minute as visits turn late. Office roles only (RLS).
 */
export default async function RotaTodayPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const { profile, companyId } = await requireRotaOffice();
  const sp = await searchParams;
  const branches = await getRotaBranches(companyId, !!profile.actingAsCompanyId);
  const branch = branches.find((b) => b.id === sp.branch) ?? branches[0] ?? null;
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const nowMs = Date.now();

  if (!branch) {
    return (
      <div className="page-shell space-y-5">
        <h1 className="page-title">Today</h1>
        <section className="glass-card p-6 text-center text-sm text-white/60">You are not linked to a branch yet.</section>
      </div>
    );
  }

  const [allVisits, timings] = await Promise.all([getDayVisits(branch.id, todayIso), getRotaSettings(companyId)]);
  const visits = allVisits.filter((v) => v.status === "published" && !v.paused);
  const supabase = await createClient();
  const suIds = [...new Set(visits.map((v) => v.serviceUserId))];
  const [{ data: places }, { data: taps }] = await Promise.all([
    suIds.length
      ? supabase.from("rota_places").select("service_user_id, lat, lng, radius_m").in("service_user_id", suIds).eq("for_branch", false).not("lat", "is", null)
      : Promise.resolve({ data: [] }),
    visits.length
      ? supabase.from("rota_clock_events").select("visit_id, person_id, kind, happened_at, lat, lng").in("visit_id", visits.map((v) => v.id)).not("lat", "is", null).order("happened_at")
      : Promise.resolve({ data: [] }),
  ]);

  type Row = { v: (typeof visits)[number]; status: TodayStatus; tasksNotDone: boolean; dosesNotDone: boolean; arrival: string | null };
  const rows: Row[] = visits.map((v) => {
    const clocks = (v.clocks ?? []).map((c) => ({ personId: c.personId, kind: c.kind }));
    const status = todayStatus({
      startsAtMs: Date.parse(v.startsAt),
      endsAtMs: Date.parse(v.endsAt),
      nowMs,
      carers: v.assignments.map((a) => a.personId),
      clocks,
    }, timings);
    const firstIn = (v.clocks ?? []).filter((c) => c.kind === "in").sort((a, b) => a.at.localeCompare(b.at))[0];
    const outPeople = new Set((v.clocks ?? []).filter((c) => c.kind === "out").map((c) => c.personId));
    // Not done: someone has clocked out and a key task, or a due dose, has nothing recorded.
    const keyTasks = (v.tasks?.list ?? []).filter((t) => t.key);
    const tasksNotDone = [...outPeople].some((pid) => keyTasks.some((t) => !v.tasks?.byPerson?.[pid]?.[t.uid]));
    const dosesNotDone = outPeople.size > 0 && (v.doses ?? []).some((d) => !d.prn && d.outcome == null);
    return { v, status, tasksNotDone, dosesNotDone, arrival: arrivalWords(Date.parse(v.startsAt), firstIn ? Date.parse(firstIn.at) : null, timings.lateAfterMin) };
  });
  const order: TodayStatus[] = ["missed", "late", "overrunning", "in_progress", "not_started", "done"];
  rows.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.v.startsAt.localeCompare(b.v.startsAt));
  const count = (s: TodayStatus) => rows.filter((r) => r.status === s).length;
  const notDone = rows.filter((r) => r.tasksNotDone || r.dosesNotDone).length;

  const nameOfSu = new Map(visits.map((v) => [v.serviceUserId, v.serviceUserName]));
  const homes: MapHome[] = ((places as { service_user_id: string; lat: number; lng: number; radius_m: number }[] | null) ?? []).map((p) => ({
    id: p.service_user_id,
    name: nameOfSu.get(p.service_user_id) ?? "Home",
    lat: p.lat,
    lng: p.lng,
    radius: p.radius_m,
  }));
  const carerName = new Map(visits.flatMap((v) => v.assignments.map((a) => [a.personId, a.name] as const)));
  const lastTap = new Map<string, { visit_id: string; person_id: string; kind: string; happened_at: string; lat: number; lng: number }>();
  for (const t of (taps as { visit_id: string; person_id: string; kind: string; happened_at: string; lat: number; lng: number }[] | null) ?? []) {
    lastTap.set(t.person_id, t);
  }
  const mapTaps: MapTap[] = [...lastTap.values()].map((t) => ({
    id: `${t.person_id}`,
    name: carerName.get(t.person_id) ?? "Carer",
    label: `${t.kind === "in" ? "Clock in" : "Clock out"} ${hhmm(t.happened_at)}, ${nameOfSu.get(visits.find((v) => v.id === t.visit_id)?.serviceUserId ?? "") ?? ""}`,
    lat: t.lat,
    lng: t.lng,
  }));

  const tiles = [
    { label: "Missed", n: count("missed"), tone: "text-red-300" },
    { label: "Late", n: count("late"), tone: "text-red-300" },
    { label: "Overrunning", n: count("overrunning"), tone: "text-amber-300" },
    { label: "Not done", n: notDone, tone: "text-amber-300" },
    { label: "In progress", n: count("in_progress"), tone: "text-white" },
    { label: "Done", n: count("done"), tone: "text-emerald-300" },
  ];

  return (
    <div className="page-shell space-y-5">
      <RealtimeRefresh tables={["rota_clock_events", "rota_visits", "rota_visit_assignments", "rota_mar_doses", "rota_task_outcomes", "rota_visit_alerts"]} channel="rota-today" />
      <AutoRefresh />
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="page-title">Today</h1>
          <span className="pill pill-amber">Beta</span>
        </div>
        <p className="text-sm text-white/60">Every published visit today, as it happens. Late is {timings.lateAfterMin} minutes after the start with no clock in; missed is {timings.missedAfterEndMin} minutes after the end; overrunning is {timings.overrunAfterEndMin} minutes after the end.</p>
      </div>
      <RotaTabs active="today" branchId={branch.id} />
      {branches.length > 1 ? (
        <nav aria-label="Branch" className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <Link key={b.id} href={`/rota/today?branch=${b.id}`} className={`pill ${b.id === branch.id ? "pill-amber" : "pill-neutral"}`}>
              {b.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <section aria-label="Counts" className="grid grid-cols-3 gap-2 md:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="glass-card p-3 text-center">
            <p className={`text-2xl font-semibold ${t.tone}`}>{t.n}</p>
            <p className="text-xs text-white/60">{t.label}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <section aria-label="Visits today" className="glass-card space-y-2 p-4 lg:col-span-3">
          <h2 className="text-base font-semibold text-white">Visits ({rows.length})</h2>
          {rows.length === 0 ? (
            <p className="text-sm text-white/55">No published visits today for {branch.name}.</p>
          ) : (
            <ul className="divide-y divide-white/10">
              {rows.map(({ v, status, tasksNotDone, dosesNotDone, arrival }) => (
                <li key={v.id}>
                  <Link href={`/rota/visits?branch=${branch.id}&date=${todayIso}#visit-${v.id}`} className="flex flex-wrap items-start justify-between gap-2 py-2.5 hover:bg-white/5">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-white">
                        {v.startTime} to {v.endTime} · {v.serviceUserName}
                      </span>
                      <span className="block text-xs text-white/60">
                        {v.assignments.length ? v.assignments.map((a) => a.name).join(", ") : "No carer"}
                        {arrival ? ` · ${arrival}` : ""}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-1">
                      <span className={`pill ${todayTone(status)}`}>{TODAY_STATUS_WORDS[status]}</span>
                      {v.timeSensitive ? <span className="pill pill-red">Time sensitive medicine</span> : null}
                      {tasksNotDone ? <span className="pill pill-amber">Tasks not done</span> : null}
                      {dosesNotDone ? <span className="pill pill-amber">Doses not recorded</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="Map" className="glass-card space-y-2 p-4 lg:col-span-2">
          <h2 className="text-base font-semibold text-white">Where</h2>
          <p className="text-xs text-white/55">Homes (H) and each carer&apos;s last clock in or out today (C). Office only; today only.</p>
          <TodayMap homes={homes} taps={mapTaps} />
        </section>
      </div>
    </div>
  );
}
