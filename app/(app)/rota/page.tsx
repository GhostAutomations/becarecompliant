import type { Metadata } from "next";
import Link from "next/link";
import { requireRotaOffice } from "@/lib/rota/access";
import { getRotaSettings } from "@/lib/rota/settings";
import { getPendingRequests, getRotaBranches, getRotaTemplates, getRotaWeek } from "@/lib/rota/data";
import { countDraftVisits } from "@/lib/rota/visits-data";
import { addDaysIso, mondayOfIso } from "@/lib/rota/working-time";
import { dayLabel } from "@/lib/rota/types";
import ActionForm from "@/components/rota/rota-action";
import RotaWeek from "@/components/rota/rota-week";
import RotaTabs from "@/components/rota/rota-tabs";
import RotaBetaNotice from "@/components/rota/rota-beta-notice";
import { copyWeekAction, decideRequestAction, publishWeekAction } from "@/lib/rota/actions";

/* The title is only given once the guard passes: a fixed title would name the module in the
   browser tab even on the Not Found page of a company that does not have it. */
export async function generateMetadata(): Promise<Metadata> {
  await requireRotaOffice();
  return { title: "Rota" };
}

/**
 * Be Care Compliant: the Rota (Rota and Visits beta, Stage 1, Phil 2026-10-15). One branch, one
 * week: build it in draft, Publish it to the carers, then change it with texts going out. Not
 * Found for every company without the module, and for every role outside the office roles.
 */
export default async function RotaPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; week?: string }>;
}) {
  const { profile, companyId } = await requireRotaOffice();
  const sp = await searchParams;
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const branches = await getRotaBranches(companyId, profile.role === "company_admin" && !!profile.actingAsCompanyId);
  const branch = branches.find((b) => b.id === sp.branch) ?? branches[0] ?? null;
  const monday = mondayOfIso(sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : todayIso);
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i));

  if (!branch) {
    return (
      <div className="page-shell space-y-6">
        <Header />
        <section className="glass-card p-6 text-center">
          <p className="text-base font-medium text-white/85">No branches to show</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-white/55">You are not linked to a branch yet. Ask your Admin to add you to one.</p>
        </section>
      </div>
    );
  }

  const { clockOpensMin } = await getRotaSettings(companyId);
  const [shifts, templates, requests, draftVisits] = await Promise.all([
    getRotaWeek(branch.id, monday),
    getRotaTemplates(branch.id),
    getPendingRequests(branch.id),
    countDraftVisits(branch.id, monday, addDaysIso(monday, 6)),
  ]);
  const draftShifts = shifts.filter((s) => s.status === "draft").length;
  const drafts = draftShifts + draftVisits;
  const href = (b: string, w: string) => `/rota?branch=${b}&week=${w}`;

  return (
    <div className="page-shell space-y-5">
      <Header />
      <RotaTabs active="week" branchId={branch.id} />

      {branches.length > 1 ? (
        <nav aria-label="Branch" className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <Link key={b.id} href={href(b.id, monday)} className={`pill ${b.id === branch.id ? "pill-amber" : "pill-neutral"}`}>
              {b.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="glass-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          <Link href={href(branch.id, addDaysIso(monday, -7))} className="btn-ghost px-3 py-1.5 text-xs" aria-label="Previous week">
            &lsaquo; Previous
          </Link>
          <p className="text-sm font-semibold text-white/90">
            Week of {dayLabel(monday)}
            {monday === mondayOfIso(todayIso) ? <span className="ml-2 text-xs font-normal text-white/50">This week</span> : null}
          </p>
          <Link href={href(branch.id, addDaysIso(monday, 7))} className="btn-ghost px-3 py-1.5 text-xs" aria-label="Next week">
            Next &rsaquo;
          </Link>
          <a href={`/api/rota/rota-pdf?branch=${branch.id}&week=${monday}`} className="text-xs text-amber-300 underline">
            Print the visits (PDF)
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ActionForm
            action={copyWeekAction}
            hidden={{ branch_id: branch.id, monday }}
            label="Copy last week"
            savingLabel="Copying…"
            savedLabel="Copied"
            buttonClassName="btn-outline px-3 py-1.5 text-xs"
            className=""
            showOk
          />
          <ActionForm
            action={publishWeekAction}
            hidden={{ branch_id: branch.id, monday }}
            label={drafts ? `Publish ${drafts} draft${drafts === 1 ? "" : "s"}` : "Nothing to publish"}
            savingLabel="Publishing…"
            savedLabel="Published"
            buttonClassName="btn-primary px-3 py-1.5 text-xs"
            className=""
            disabled={drafts === 0}
            showOk
            confirm={`Publish ${draftShifts} draft shift${draftShifts === 1 ? "" : "s"} and ${draftVisits} draft visit${draftVisits === 1 ? "" : "s"} for the week of ${dayLabel(monday)}? Each carer on them gets one text.`}
          />
        </div>
      </div>

      {requests.length ? (
        <section aria-label="Open shift requests" className="glass-card space-y-2 p-4">
          <h2 className="text-sm font-semibold text-white/90">Asking for open shifts ({requests.length})</h2>
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2">
                <span className="text-sm text-white/85">
                  {r.name}: {dayLabel(r.shiftDate)}, {r.startTime} to {r.endTime}
                </span>
                <span className="flex gap-2">
                  <ActionForm action={decideRequestAction} hidden={{ request_id: r.id, approve: "yes" }} label="Approve" savingLabel="Approving…" savedLabel="Approved" buttonClassName="btn-primary px-3 py-1.5 text-xs" className="" showOk />
                  <ActionForm action={decideRequestAction} hidden={{ request_id: r.id, approve: "no" }} label="Decline" savingLabel="Declining…" savedLabel="Declined" buttonClassName="btn-ghost px-3 py-1.5 text-xs" className="" confirm={`Decline ${r.name}'s request?`} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {shifts.length === 0 ? (
        <p className="text-sm text-white/55">
          Nothing on the rota for this week yet. Add shifts day by day, or copy last week.
        </p>
      ) : null}

      <RotaWeek branchId={branch.id} days={days} shifts={shifts} templates={templates} opensMin={clockOpensMin} />
    </div>
  );
}

function Header() {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="page-title">Rota</h1>
          <span className="pill pill-amber">Beta</span>
        </div>
        <p className="text-sm text-white/60">Shifts for your branches: build the week, publish it, and carers see it in their app.</p>
      </div>
      <RotaBetaNotice />
    </div>
  );
}
