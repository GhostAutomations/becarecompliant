import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRotaOffice } from "@/lib/rota/access";
import { writeAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import Timeline, { TONE_WORDS, type TimelineRow } from "@/components/rota/timeline";
import { getCallServiceUsers } from "@/lib/rota/visits-data";
import { getSuWeekVisits } from "@/lib/rota/timeline-data";
import { DAY_NAMES, slotLabel } from "@/lib/rota/calls";
import { dayLabel } from "@/lib/rota/types";
import { addDaysIso } from "@/lib/rota/working-time";
import { toMinutes, visitTone, weekDates } from "@/lib/rota/timeline";

export const metadata: Metadata = { title: "Week timeline" };

function londonHhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}

/**
 * A service user's week (Rota and Visits Stage 5b, Phil 2026-10-16; docs/decisions/rota-visits.md,
 * Stage 5b): their Care Schedule as a week of calls across a 24 hour line, and this week's rota
 * (who is booked into each visit, with clock in and out once done). Today is highlighted. For the
 * rota office of the branch (RLS); the view is audit logged.
 */
export default async function SuTimelinePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ week?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { profile, companyId } = await requireRotaOffice();
  const supabase = await createClient();
  const { data: su } = await supabase
    .from("service_users")
    .select("id, full_name, branch_id")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle<{ id: string; full_name: string; branch_id: string | null }>();
  if (!su) notFound();

  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const anchor = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : todayIso;
  const week = weekDates(anchor);
  const todayDow = (new Date(`${todayIso}T12:00:00Z`).getUTCDay() + 6) % 7;

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.timeline_viewed",
    entityType: "service_user",
    entityId: id,
    summary: `Viewed the week timeline of ${su.full_name}`,
    metadata: { week: week[0] },
  });

  const [callUsers, visits] = await Promise.all([
    su.branch_id ? getCallServiceUsers(su.branch_id) : Promise.resolve([]),
    getSuWeekVisits(id, week[0], week[6]),
  ]);
  const calls = callUsers.find((c) => c.id === id)?.calls ?? [];
  const untimed = calls.filter((c) => !c.startTime);

  // The Care Schedule week: one row per day, each call a block.
  const scheduleRows: TimelineRow[] = DAY_NAMES.map((name, dow) => ({
    key: `dow-${dow}`,
    label: name,
    sublabel: dow === todayDow ? "Today" : undefined,
    highlight: dow === todayDow,
    blocks: calls
      .filter((c) => c.dayOfWeek === dow && c.startTime)
      .map((c) => {
        const start = toMinutes(c.startTime as string);
        const length = c.lengthMinutes ?? c.minutes ?? 30;
        const what = [c.service, c.slotKey ? slotLabel(c.slotKey) : null, c.occurrence > 1 ? `(${c.occurrence})` : null].filter(Boolean).join(" ");
        return {
          id: `${dow}|${c.service}|${c.slotKey}|${c.occurrence}`,
          start,
          end: Math.min(1440, start + length),
          label: what,
          sublabel: c.carers > 1 ? `${c.carers} carers` : undefined,
          tone: "call" as const,
          title: `${name}: ${what}, ${c.startTime}, ${length} minutes${c.carers > 1 ? `, ${c.carers} carers` : ""}.`,
          href: su.branch_id ? `/rota/calls?branch=${su.branch_id}` : undefined,
        };
      }),
  }));

  // This week's rota: one row per date, each visit a block with its carers.
  const nowMs = Date.now();
  const londonNow = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  const rotaRows: TimelineRow[] = week.map((d) => ({
    key: d,
    label: dayLabel(d),
    sublabel: d === todayIso ? "Today" : undefined,
    highlight: d === todayIso,
    blocks: visits
      .filter((v) => v.visitDate === d)
      .map((v) => {
        const start = toMinutes(v.startTime);
        const firstIn = v.clocks.find((c) => c.kind === "in") ?? null;
        const lastOut = [...v.clocks].reverse().find((c) => c.kind === "out") ?? null;
        const allOut = v.carers.length > 0 && v.carers.every((c) => v.clocks.some((k) => k.personId === c.personId && k.kind === "out"));
        const tone = visitTone({ status: v.status, paused: false, startsAtMs: Date.parse(v.startsAt), nowMs, clockedIn: Boolean(firstIn), clockedOut: allOut });
        const names = v.carers.map((c) => c.name);
        return {
          id: v.id,
          start,
          end: Math.max(start + 5, toMinutes(v.endTime) || 1440),
          label: names.length ? names.join(", ") : "Needs a carer",
          sublabel: firstIn ? `In ${londonHhmm(firstIn.at)}${lastOut ? `, out ${londonHhmm(lastOut.at)}` : ""}` : v.timeChangedFrom ? `Moved from ${v.timeChangedFrom}` : undefined,
          tone: names.length === 0 && v.status !== "draft" && nowMs > Date.parse(v.startsAt) ? ("late" as const) : tone,
          title: `${dayLabel(d)}, ${v.startTime} to ${v.endTime}: ${names.length ? names.join(" and ") : "needs a carer"}. ${TONE_WORDS[tone]}.`,
          href: su.branch_id ? `/rota/visits?branch=${su.branch_id}&date=${d}#visit-${v.id}` : undefined,
        };
      }),
  }));

  const weekHref = (d: string) => `/service-users/${id}/timeline?week=${d}`;

  return (
    <div className="page-shell space-y-6">
      <BackLink href={`/service-users/${id}`} label="Back to record" />
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="page-title">Week timeline</h1>
          <span className="pill pill-amber">Beta</span>
        </div>
        <p className="text-sm text-white/60">{su.full_name}: the Care Schedule&apos;s calls, and who is coming this week.</p>
      </div>

      <section className="space-y-2" aria-label="Care Schedule">
        <h2 className="text-base font-semibold text-white">Care Schedule</h2>
        <Timeline rows={scheduleRows} labelHeader="Day" emptyText="No calls in the Care Schedule." legend={["call"]} />
        {calls.length === 0 ? <p className="text-sm text-white/55">No calls in the Care Schedule yet. Add them on the Care plan page.</p> : null}
        {untimed.length ? (
          <p className="text-xs text-amber-300">
            {untimed.length} call{untimed.length === 1 ? " has" : "s have"} no start time yet, so no visit is made for {untimed.length === 1 ? "it" : "them"}:{" "}
            {untimed.map((c) => `${DAY_NAMES[c.dayOfWeek]} ${c.service}${c.slotKey ? ` ${slotLabel(c.slotKey)}` : ""}`).join(", ")}.{" "}
            {su.branch_id ? (
              <Link href={`/rota/calls?branch=${su.branch_id}`} className="underline">
                Set them on Call times
              </Link>
            ) : null}
          </p>
        ) : null}
      </section>

      <section className="space-y-2" aria-label="This week's rota">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-white">Rota, week of {dayLabel(week[0])}</h2>
          <div className="flex flex-wrap gap-2">
            <Link href={weekHref(addDaysIso(week[0], -7))} className="btn-ghost px-3 py-1.5 text-xs" aria-label="Previous week">
              &lsaquo; Previous week
            </Link>
            {!week.includes(todayIso) ? (
              <Link href={weekHref(todayIso)} className="btn-outline px-3 py-1.5 text-xs">
                This week
              </Link>
            ) : null}
            <Link href={weekHref(addDaysIso(week[0], 7))} className="btn-ghost px-3 py-1.5 text-xs" aria-label="Next week">
              Next week &rsaquo;
            </Link>
          </div>
        </div>
        <Timeline
          rows={rotaRows}
          labelHeader="Day"
          emptyText="No visits this week."
          legend={["due", "in_progress", "done", "late", "draft"]}
        />
        {visits.length === 0 ? <p className="text-sm text-white/55">No visits this week. Visits are made from the Care Schedule once each call has a start time.</p> : null}
        <p className="text-xs text-white/45">Tap a visit to open it on the Visits page. {week.includes(todayIso) ? `Now: ${londonNow}.` : ""}</p>
      </section>
    </div>
  );
}
