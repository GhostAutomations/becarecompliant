import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRotaOffice } from "@/lib/rota/access";
import { writeAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import NoteLines from "@/components/rota/note-lines";
import { getClockRecords } from "@/lib/rota/clock-data";
import { getVisitNotes, getVisitTasks } from "@/lib/rota/visits-data";
import { OUTCOME_WORDS, taskReasonLabel, taskSummary } from "@/lib/rota/tasks";
import { flagWords } from "@/lib/rota/clock";
import { dayLabel, hhmm } from "@/lib/rota/types";

export const metadata: Metadata = { title: "Care notes" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
function londonHhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * A service user's care notes (Rota and Visits Stage 5, Phil 2026-10-16; docs/decisions/
 * rota-visits.md, Stage 5 decision 10): each visit's Visit record, newest first, with a date
 * filter and the PDF. For the rota office of the branch (RLS); every view is audit logged.
 */
export default async function CareNotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { profile, companyId } = await requireRotaOffice();
  const supabase = await createClient();
  const { data: su } = await supabase
    .from("service_users")
    .select("id, full_name, company_id")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle<{ id: string; full_name: string; company_id: string }>();
  if (!su) notFound();

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const to = sp.to && ISO.test(sp.to) ? sp.to : today;
  const from = sp.from && ISO.test(sp.from) && sp.from <= to ? sp.from : addDays(to, -13);

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.care_notes_viewed",
    entityType: "service_user",
    entityId: id,
    summary: `Viewed the care notes of ${su.full_name}`,
    metadata: { from, to },
  });

  const { data: visitRows } = await supabase
    .from("rota_visits")
    .select("id, service_user_id, visit_date, start_time, end_time, service, generated_key, rota_visit_assignments(person_id, status, people(full_name))")
    .eq("service_user_id", id)
    .eq("status", "published")
    .gte("visit_date", from)
    .lte("visit_date", to)
    .order("visit_date", { ascending: false })
    .order("start_time", { ascending: false })
    .limit(200);
  type V = {
    id: string;
    service_user_id: string;
    visit_date: string;
    start_time: string;
    end_time: string;
    service: string;
    generated_key: string | null;
    rota_visit_assignments: { person_id: string; status: string; people: { full_name: string | null } | null }[];
  };
  const visits = (visitRows as unknown as V[] | null) ?? [];
  const ids = visits.map((v) => v.id);
  const [clocks, notes, tasks, { data: versionRows }] = await Promise.all([
    getClockRecords("visit", ids),
    getVisitNotes(ids),
    getVisitTasks(visits),
    ids.length
      ? supabase.from("rota_visit_record_versions").select("visit_id, version, made_at").in("visit_id", ids).order("version")
      : Promise.resolve({ data: [] as { visit_id: string; version: number; made_at: string }[] }),
  ]);
  const versions = new Map<string, { version: number; made_at: string }[]>();
  for (const v of (versionRows ?? []) as { visit_id: string; version: number; made_at: string }[]) {
    versions.set(v.visit_id, [...(versions.get(v.visit_id) ?? []), v]);
  }
  // Only visits where something was recorded, so the list is the record, not the rota.
  const recorded = visits.filter((v) => (clocks.get(v.id)?.length ?? 0) + (notes.notes.get(v.id)?.length ?? 0) + (notes.concerns.get(v.id)?.length ?? 0) > 0);

  return (
    <div className="page-shell space-y-5">
      <BackLink href={`/service-users/${id}`} label="Back to record" />
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="page-title">Care notes</h1>
          <span className="pill pill-amber">Beta</span>
        </div>
        <p className="text-sm text-white/60">
          {su.full_name}: every visit&apos;s record, newest first. Notes are never edited; a correction is a new note.
        </p>
      </div>

      <form className="glass-card flex flex-wrap items-end gap-3 p-4" method="get">
        <label className="space-y-1">
          <span className="block text-xs text-white/60">From</span>
          <input type="date" name="from" defaultValue={from} max={today} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-white/60">To</span>
          <input type="date" name="to" defaultValue={to} max={today} />
        </label>
        <button type="submit" className="btn-outline px-3 py-1.5 text-xs">
          Show
        </button>
      </form>

      {recorded.length === 0 ? (
        <div className="glass-card p-5 text-sm text-white/60">
          Nothing recorded at a visit between {dayLabel(from)} and {dayLabel(to)}. Visit records appear here once a carer clocks in.
        </div>
      ) : (
        <div className="space-y-3">
          {recorded.map((v) => {
            const cl = clocks.get(v.id) ?? [];
            const people = new Map<string, string>();
            for (const a of v.rota_visit_assignments) {
              if (a.status === "active" || cl.some((c) => c.personId === a.person_id)) people.set(a.person_id, a.people?.full_name ?? "Carer");
            }
            for (const n of notes.notes.get(v.id) ?? []) if (!people.has(n.personId)) people.set(n.personId, n.author);
            const t = tasks.get(v.id) ?? null;
            const vs = versions.get(v.id) ?? [];
            return (
              <section key={v.id} className="glass-card space-y-3 p-4" aria-label={`Visit ${v.visit_date} ${hhmm(v.start_time)}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {dayLabel(v.visit_date)}, {hhmm(v.start_time)} to {hhmm(v.end_time)}
                    </p>
                    <p className="text-xs text-white/55">{v.service}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {vs.length === 0 ? (
                      <a href={`/api/rota/visit-record/${v.id}`} className="text-amber-300 underline">
                        Visit record so far (PDF)
                      </a>
                    ) : (
                      vs.map((x) => (
                        <a key={x.version} href={`/api/rota/visit-record/${v.id}?v=${x.version}`} className="text-amber-300 underline">
                          {x.version === 1 ? "Visit record (PDF)" : `Updated ${londonHhmm(x.made_at)} (PDF)`}
                        </a>
                      ))
                    )}
                  </div>
                </div>
                {[...people.entries()].map(([pid, name]) => {
                  const mine = cl.filter((c) => c.personId === pid);
                  const outcomes = t?.byPerson[pid] ?? {};
                  return (
                    <div key={pid} className="space-y-1 rounded-xl border border-white/10 bg-white/5 p-3">
                      <p className="text-sm font-semibold text-white/90">{name}</p>
                      {mine.length ? (
                        <ul className="space-y-0.5">
                          {mine.map((c) => (
                            <li key={c.id} className={`text-xs ${c.location === "outside" || c.location === "unclear" ? "text-amber-300" : "text-white/70"}`}>
                              {c.kind === "in" ? "Clocked in" : "Clocked out"} {londonHhmm(c.at)} · {c.words}
                              {c.flags.length ? ` · ${c.flags.map(flagWords).join(", ")}` : ""}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-white/45">Not clocked in</p>
                      )}
                      {t && t.list.length ? (
                        <details>
                          <summary className="cursor-pointer text-xs text-white/60">Tasks: {taskSummary(t.list, outcomes).text}</summary>
                          <ul className="mt-1 space-y-0.5 pl-3">
                            {t.list.map((task) => {
                              const o = outcomes[task.uid];
                              return (
                                <li key={task.uid} className={`text-xs ${!o ? "text-white/50" : o.outcome === "done" ? "text-white/70" : "text-amber-300"}`}>
                                  {task.name}
                                  {task.key ? " (key)" : ""}: {o ? `${OUTCOME_WORDS[o.outcome]}${o.reason_code ? `, ${taskReasonLabel(o.reason_code, o.reason_text)}` : ""}` : "not recorded"}
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      ) : null}
                      <NoteLines notes={notes.notes.get(v.id) ?? []} concerns={notes.concerns.get(v.id) ?? []} personId={pid} clockedOut={mine.some((c) => c.kind === "out")} />
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
      <p className="text-xs text-white/40">
        Showing visits from {dayLabel(from)} to {dayLabel(to)}. <Link href={`/service-users/${id}/care-notes`} className="underline">Last 14 days</Link>
      </p>
    </div>
  );
}
