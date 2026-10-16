import type { Metadata } from "next";
import Link from "next/link";
import { requireRotaOffice } from "@/lib/rota/access";
import { getRotaBranches } from "@/lib/rota/data";
import { getDayVisits } from "@/lib/rota/visits-data";
import { addDaysIso } from "@/lib/rota/working-time";
import { dayLabel, type RotaVisit } from "@/lib/rota/types";
import { TONE_WORDS, toMinutes, visitTone, type VisitTone } from "@/lib/rota/timeline";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import RotaTabs from "@/components/rota/rota-tabs";
import Timeline, { type TimelineRow } from "@/components/rota/timeline";

export async function generateMetadata(): Promise<Metadata> {
  await requireRotaOffice();
  return { title: "Service user day" };
}

function londonHhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}

/** One visit's look for the service user: the furthest along of its carers, or late or open. */
function overallTone(v: RotaVisit, nowMs: number): VisitTone {
  const clocks = v.clocks ?? [];
  const anyIn = clocks.some((c) => c.kind === "in");
  const allOut = v.assignments.length > 0 && v.assignments.every((a) => clocks.some((c) => c.personId === a.personId && c.kind === "out"));
  return visitTone({ status: v.status, paused: v.paused, startsAtMs: Date.parse(v.startsAt), nowMs, clockedIn: anyIn, clockedOut: allOut });
}

function rowsFor(visits: RotaVisit[], branchId: string, dateIso: string, nowMs: number): TimelineRow[] {
  const bySu = new Map<string, TimelineRow>();
  for (const v of visits) {
    let r = bySu.get(v.serviceUserId);
    if (!r) {
      r = { key: v.serviceUserId, label: v.serviceUserName, sublabel: v.postcode ?? undefined, href: `/service-users/${v.serviceUserId}/timeline`, blocks: [] };
      bySu.set(v.serviceUserId, r);
    }
    const start = toMinutes(v.startTime);
    const end = Math.max(start + 5, toMinutes(v.endTime) || 1440);
    const tone = overallTone(v, nowMs);
    const carers = v.assignments.map((a) => a.name);
    const open = v.carersNeeded - v.assignments.length;
    const firstIn = (v.clocks ?? []).find((c) => c.kind === "in");
    r.blocks.push({
      id: v.id,
      start,
      end,
      label: carers.length ? carers.join(", ") : "Needs a carer",
      sublabel: open > 0 && carers.length ? `${open} place${open === 1 ? "" : "s"} open` : firstIn ? `In ${londonHhmm(firstIn.at)}` : undefined,
      tone: carers.length === 0 && !v.paused && v.status !== "draft" && nowMs > Date.parse(v.startsAt) ? "late" : tone,
      title: `${v.serviceUserName}, ${v.startTime} to ${v.endTime}: ${carers.length ? carers.join(" and ") : "needs a carer"}. ${TONE_WORDS[tone]}.${v.timeChangedFrom ? ` Time changed from ${v.timeChangedFrom}.` : ""}`,
      href: `/rota/visits?branch=${branchId}&date=${dateIso}#visit-${v.id}`,
    });
  }
  return [...bySu.values()].sort((a, b) => a.label.localeCompare(b.label, "en-GB"));
}

/**
 * Service user day (Rota and Visits Stage 5b, Phil 2026-10-16; docs/decisions/rota-visits.md,
 * Stage 5b): every service user with visits that day, grouped by branch, the carers coming to them
 * across a 24 hour line, and a red line for now. A tap opens the visit; the name opens the service
 * user's week.
 */
export default async function ServiceUserDayPage({ searchParams }: { searchParams: Promise<{ branch?: string; date?: string }> }) {
  const { profile, companyId } = await requireRotaOffice();
  const sp = await searchParams;
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const branches = await getRotaBranches(companyId, !!profile.actingAsCompanyId);
  const all = sp.branch === "all" && branches.length > 1;
  const branch = all ? null : branches.find((b) => b.id === sp.branch) ?? branches[0] ?? null;
  const shown = all ? branches : branch ? [branch] : [];
  const dateIso = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayIso;

  if (shown.length) {
    const supabase = await createClient();
    await Promise.all(shown.map((b) => supabase.rpc("rota_refresh_visits", { p_branch: b.id })));
  }
  const perBranch = await Promise.all(shown.map(async (b) => ({ branch: b, visits: await getDayVisits(b.id, dateIso) })));
  const nowMs = Date.now();
  const londonNow = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  const nowMinute = dateIso === todayIso ? toMinutes(londonNow) : null;
  const key = all ? "all" : branch?.id ?? "";
  const href = (b: string, d: string) => `/rota/service-user-day?branch=${b}&date=${d}`;

  return (
    <div className="page-shell space-y-5">
      <BackLink href={branch ? `/rota?branch=${branch.id}` : "/rota"} label="Rota" />
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="page-title">Service user day</h1>
          <span className="pill pill-amber">Beta</span>
        </div>
        <p className="text-sm text-white/60">Every service user with visits that day, and the carers coming to them.</p>
      </div>
      {(branch ?? branches[0]) ? <RotaTabs active="su_day" branchId={(branch ?? branches[0]).id} /> : null}
      {branches.length > 1 ? (
        <nav aria-label="Branch" className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <Link key={b.id} href={href(b.id, dateIso)} className={`pill ${!all && branch && b.id === branch.id ? "pill-amber" : "pill-neutral"}`}>
              {b.name}
            </Link>
          ))}
          <Link href={href("all", dateIso)} className={`pill ${all ? "pill-amber" : "pill-neutral"}`}>
            All branches
          </Link>
        </nav>
      ) : null}
      {shown.length === 0 ? <p className="text-sm text-white/55">You are not linked to a branch yet.</p> : null}
      {shown.length ? (
        <div className="glass-card flex flex-wrap items-center gap-2 p-4">
          <Link href={href(key, addDaysIso(dateIso, -1))} className="btn-ghost px-3 py-1.5 text-xs" aria-label="Previous day">
            &lsaquo; Previous
          </Link>
          <p className="text-sm font-semibold text-white/90">
            {dayLabel(dateIso)}
            {dateIso === todayIso ? <span className="ml-2 text-xs font-normal text-white/50">Today</span> : null}
          </p>
          <Link href={href(key, addDaysIso(dateIso, 1))} className="btn-ghost px-3 py-1.5 text-xs" aria-label="Next day">
            Next &rsaquo;
          </Link>
          {dateIso !== todayIso ? (
            <Link href={href(key, todayIso)} className="btn-outline px-3 py-1.5 text-xs">
              Today
            </Link>
          ) : null}
        </div>
      ) : null}
      {perBranch.map(({ branch: b, visits }) => (
        <section key={b.id} className="space-y-2" aria-label={b.name}>
          {all ? <h2 className="text-base font-semibold text-white">{b.name}</h2> : null}
          <Timeline
            rows={rowsFor(visits, b.id, dateIso, nowMs)}
            labelHeader="Service user"
            nowMinute={nowMinute}
            emptyText="No visits in this branch on this day."
            legend={["due", "in_progress", "done", "late", "draft", "paused"]}
          />
        </section>
      ))}
      {shown.length ? <p className="text-xs text-white/45">Tap a visit to open it on the Visits page. Tap a name for that service user&apos;s week.</p> : null}
    </div>
  );
}
