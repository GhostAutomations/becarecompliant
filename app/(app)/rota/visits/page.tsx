import type { Metadata } from "next";
import Link from "next/link";
import { requireRotaOffice } from "@/lib/rota/access";
import { getRotaBranches } from "@/lib/rota/data";
import { countDraftShifts, countDraftVisits, getDayVisits, getRotaPeople } from "@/lib/rota/visits-data";
import { addDaysIso, mondayOfIso } from "@/lib/rota/working-time";
import { dayLabel } from "@/lib/rota/types";
import { createClient } from "@/lib/supabase/server";
import ActionForm from "@/components/rota/rota-action";
import BackLink from "@/components/back-link";
import RotaTabs from "@/components/rota/rota-tabs";
import VisitsDay from "@/components/rota/visits-day";
import { publishWeekAction } from "@/lib/rota/actions";

export async function generateMetadata(): Promise<Metadata> {
  await requireRotaOffice();
  return { title: "Visits" };
}

/**
 * Visits (Rota and Visits Stage 2, Phil 2026-10-15): one branch, one day, as runs. Opening the page
 * brings the next four weeks of visits in line with the Care Schedule first (the same idempotent
 * work as the nightly job), so a schedule changed on the service user's record shows straight away.
 */
export default async function RotaVisitsPage({ searchParams }: { searchParams: Promise<{ branch?: string; date?: string }> }) {
  const { profile, companyId } = await requireRotaOffice();
  const sp = await searchParams;
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const branches = await getRotaBranches(companyId, !!profile.actingAsCompanyId);
  const branch = branches.find((b) => b.id === sp.branch) ?? branches[0] ?? null;
  const dateIso = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayIso;
  const monday = mondayOfIso(dateIso);

  if (branch) {
    const supabase = await createClient();
    await supabase.rpc("rota_refresh_visits", { p_branch: branch.id });
  }
  const [visits, people, draftVisits, draftShifts] = branch
    ? await Promise.all([
        getDayVisits(branch.id, dateIso),
        getRotaPeople(branches.map((b) => b.id)),
        countDraftVisits(branch.id, monday, addDaysIso(monday, 6)),
        countDraftShifts(branch.id, monday, addDaysIso(monday, 6)),
      ])
    : [[], [], 0, 0];
  const drafts = draftVisits + draftShifts;
  const href = (b: string, d: string) => `/rota/visits?branch=${b}&date=${d}`;

  return (
    <div className="page-shell space-y-5">
      <BackLink href={branch ? `/rota?branch=${branch.id}` : "/rota"} label="Rota" />
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="page-title">Visits</h1>
          <span className="pill pill-amber">Beta</span>
        </div>
        <p className="text-sm text-white/60">Each carer&apos;s run for the day, and the visits still needing a carer. Made from the Care Schedule and the call times.</p>
      </div>
      {branch ? <RotaTabs active="visits" branchId={branch.id} /> : null}
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
          <div className="glass-card flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-2">
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
            </div>
            <ActionForm
              action={publishWeekAction}
              hidden={{ branch_id: branch.id, monday }}
              label={drafts ? `Publish the week (${drafts} draft${drafts === 1 ? "" : "s"})` : "Nothing to publish this week"}
              savingLabel="Publishing…"
              savedLabel="Published"
              buttonClassName="btn-primary px-3 py-1.5 text-xs"
              className=""
              disabled={drafts === 0}
              showOk
              confirm={`Publish every draft shift and visit for the week of ${dayLabel(monday)}? Each carer on them gets one text.`}
            />
          </div>
          {visits.length === 0 ? (
            <p className="text-sm text-white/55">
              No visits on this day. Visits are made from each service user&apos;s Care Schedule once its calls have times under Call times.
            </p>
          ) : (
            <VisitsDay branchId={branch.id} dateIso={dateIso} visits={visits} people={people} />
          )}
        </>
      ) : null}
    </div>
  );
}
