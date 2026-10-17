import type { Metadata } from "next";
import Link from "next/link";
import { requireRotaOffice } from "@/lib/rota/access";
import { getRotaBranches } from "@/lib/rota/data";
import { getDayVisits } from "@/lib/rota/visits-data";
import { getDayShifts } from "@/lib/rota/timeline-data";
import { addDaysIso } from "@/lib/rota/working-time";
import { dayLabel } from "@/lib/rota/types";
import { TONE_WORDS, clockInWords, toMinutes, visitTone } from "@/lib/rota/timeline";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import RotaTabs from "@/components/rota/rota-tabs";
import CarerDay, { type DropMeta } from "@/components/rota/carer-day";
import type { TimelineBlock, TimelineRow } from "@/components/rota/timeline";

export async function generateMetadata(): Promise<Metadata> {
  await requireRotaOffice();
  return { title: "Carer day" };
}

function londonHhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}

/**
 * Carer day (Rota and Visits Stage 5b, Phil 2026-10-16; docs/decisions/rota-visits.md, Stage 5b):
 * every carer working in the branch that day, their visits and shifts across a 24 hour line, the
 * visits still needing a carer at the top, and a red line for now. Visits can be dragged to another
 * carer or a new time (components/rota/carer-day.tsx); a tap opens the visit on the Visits page.
 */
export default async function CarerDayPage({ searchParams }: { searchParams: Promise<{ branch?: string; date?: string }> }) {
  const { profile, companyId } = await requireRotaOffice();
  const sp = await searchParams;
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const branches = await getRotaBranches(companyId, !!profile.actingAsCompanyId);
  const branch = branches.find((b) => b.id === sp.branch) ?? branches[0] ?? null;
  const dateIso = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayIso;

  if (branch) {
    // The same idempotent catch up the Visits page does, so a Care Schedule change shows here too.
    const supabase = await createClient();
    await supabase.rpc("rota_refresh_visits", { p_branch: branch.id });
  }
  const [visits, shifts] = branch ? await Promise.all([getDayVisits(branch.id, dateIso), getDayShifts(branch.id, dateIso)]) : [[], []];

  const nowMs = Date.now();
  const rowsByPerson = new Map<string, TimelineRow>();
  const meta: Record<string, DropMeta> = {};
  const unassigned: TimelineBlock[] = [];
  const visitHref = (id: string) => (branch ? `/rota/visits?branch=${branch.id}&date=${dateIso}#visit-${id}` : undefined);
  const row = (personId: string, name: string) => {
    let r = rowsByPerson.get(personId);
    if (!r) {
      r = { key: personId, label: name, blocks: [], droppable: true };
      rowsByPerson.set(personId, r);
    }
    return r;
  };

  for (const v of visits) {
    const start = toMinutes(v.startTime);
    const end = Math.max(start + 5, toMinutes(v.endTime) || 1440);
    const clocks = v.clocks ?? [];
    for (const a of v.assignments) {
      const mineIn = clocks.find((c) => c.personId === a.personId && c.kind === "in") ?? null;
      const mineOut = clocks.find((c) => c.personId === a.personId && c.kind === "out") ?? null;
      const tone = visitTone({ status: v.status, paused: v.paused, startsAtMs: Date.parse(v.startsAt), nowMs, clockedIn: Boolean(mineIn), clockedOut: Boolean(mineOut) });
      const inWords = clockInWords(Date.parse(v.startsAt), mineIn ? Date.parse(mineIn.at) : null);
      const id = `${v.id}:${a.id}`;
      row(a.personId, a.name).blocks.push({
        id,
        start,
        end,
        label: v.serviceUserName,
        sublabel: mineIn ? `In ${londonHhmm(mineIn.at)}${mineOut ? `, out ${londonHhmm(mineOut.at)}` : ""}` : v.timeChangedFrom ? `Moved from ${v.timeChangedFrom}` : undefined,
        tone,
        title: `${v.serviceUserName}, ${v.startTime} to ${v.endTime}, ${a.name}. ${TONE_WORDS[tone]}${inWords ? `, clocked in ${inWords}` : ""}.${v.timeChangedFrom ? ` Time changed from ${v.timeChangedFrom}.` : ""}${v.timeSensitive ? " Time sensitive medicine due." : ""}`,
        href: visitHref(v.id),
        draggable: !mineIn && !v.paused,
        urgent: Boolean(v.timeSensitive),
      });
      meta[id] = { visitId: v.id, assignmentId: a.id, personId: a.personId, serviceUserName: v.serviceUserName, startTime: v.startTime, endTime: v.endTime };
    }
    const open = v.carersNeeded - v.assignments.length;
    for (let i = 0; i < open; i++) {
      const id = `${v.id}:open:${i}`;
      const tone = v.paused ? "paused" : v.status === "draft" ? "draft" : "late";
      unassigned.push({
        id,
        start,
        end,
        label: v.serviceUserName,
        sublabel: v.carersNeeded > 1 ? `${open} of ${v.carersNeeded} places open` : "Needs a carer",
        tone: nowMs > Date.parse(v.startsAt) || v.paused || v.status === "draft" ? tone : "due",
        title: `${v.serviceUserName}, ${v.startTime} to ${v.endTime}: needs a carer.`,
        href: visitHref(v.id),
        draggable: !v.paused,
      });
      meta[id] = { visitId: v.id, assignmentId: null, personId: null, serviceUserName: v.serviceUserName, startTime: v.startTime, endTime: v.endTime };
    }
  }
  for (const s of shifts) {
    const start = toMinutes(s.startTime);
    const end = toMinutes(s.endTime) > start ? toMinutes(s.endTime) : 1440;
    for (const p of s.people) {
      row(p.personId, p.name).blocks.push({
        id: `shift:${s.id}:${p.personId}`,
        start,
        end,
        label: s.location ? `Shift, ${s.location}` : "Shift",
        tone: "shift",
        title: `Shift ${s.startTime} to ${s.endTime}${s.location ? `, ${s.location}` : ""}, ${p.name}${s.status === "draft" ? " (not published)" : ""}.`,
        href: branch ? `/rota?branch=${branch.id}` : undefined,
      });
    }
  }

  const carerRows = [...rowsByPerson.values()].sort((a, b) => a.label.localeCompare(b.label, "en-GB"));
  const rows: TimelineRow[] = [
    ...(unassigned.length ? [{ key: "unassigned", label: "Needs a carer", sublabel: `${unassigned.length} place${unassigned.length === 1 ? "" : "s"}`, blocks: unassigned }] : []),
    ...carerRows.map((r) => ({ ...r, sublabel: `${r.blocks.length} ${r.blocks.length === 1 ? "visit or shift" : "visits and shifts"}` })),
  ];
  const londonNow = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  const href = (b: string, d: string) => `/rota/carer-day?branch=${b}&date=${d}`;

  return (
    <div className="page-shell space-y-5">
      <BackLink href={branch ? `/rota?branch=${branch.id}` : "/rota"} label="Rota" />
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="page-title">Carer day</h1>
          <span className="pill pill-amber">Beta</span>
        </div>
        <p className="text-sm text-white/60">Every carer working in the branch, with their visits and shifts across the day.</p>
      </div>
      {branch ? <RotaTabs active="carer_day" branchId={branch.id} /> : null}
      {branches.length > 1 ? (
        <nav aria-label="Branch" className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <Link key={b.id} href={href(b.id, dateIso)} className={`pill ${branch && b.id === branch.id ? "pill-amber" : "pill-neutral"}`}>
              {b.name}
            </Link>
          ))}
        </nav>
      ) : null}
      {!branch ? <p className="text-sm text-white/55">You are not linked to a branch yet.</p> : null}
      {branch ? (
        <>
          <div className="glass-card flex flex-wrap items-center gap-2 p-4">
            <Link href={href(branch.id, addDaysIso(dateIso, -1))} className="btn-ghost px-3 py-1.5 text-xs" aria-label="Previous day">
              &lsaquo; Previous
            </Link>
            <p className="text-sm font-semibold text-white/90">
              {dayLabel(dateIso)}
              {dateIso === todayIso ? <span className="ml-2 text-xs font-normal text-white/50">Today</span> : null}
            </p>
            <Link href={href(branch.id, addDaysIso(dateIso, 1))} className="btn-ghost px-3 py-1.5 text-xs" aria-label="Next day">
              Next &rsaquo;
            </Link>
            {dateIso !== todayIso ? (
              <Link href={href(branch.id, todayIso)} className="btn-outline px-3 py-1.5 text-xs">
                Today
              </Link>
            ) : null}
          </div>
          <CarerDay
            rows={rows}
            meta={meta}
            nowMinute={dateIso === todayIso ? toMinutes(londonNow) : null}
            legend={["due", "in_progress", "done", "late", "draft", "paused", "shift"]}
          />
        </>
      ) : null}
    </div>
  );
}
