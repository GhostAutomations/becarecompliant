import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { canManageRecord } from "@/lib/auth/manage-scope";
import { callerBranchIds } from "@/lib/auth/branches";
import BackLink from "@/components/back-link";
import { listComplaintsForPerson } from "@/lib/complaints/data";
import { countForPerson, describeCounts, ragForCounts } from "@/lib/complaints/person-complaints";
import PanelDialog from "@/components/panel-dialog";
import EvidenceHistory from "@/components/people/evidence-history";
import { checksForTitle } from "@/lib/people/check-scope";
import ActionForm from "@/components/action-form";
import CycleBox from "@/components/records/cycle-box";
import RecordHistory from "@/components/reports/record-history";
import EditPersonForm from "@/components/people/edit-person-form";
import RecordBookTask from "@/components/planner/record-book-task";
import { featureEnabled } from "@/lib/billing/tier";
import { getRecordAuditTrail } from "@/lib/audit-log/data";
import {
  getPerson,
  getPersonChecks,
  getPersonTracker,
  getSupervisionCompDates,
  getAppraisalCompDates,
  getHealthCheckDates,
  getSupervisionCycleMode,
  listBranches,
  listSupervisoryUsers,
  listPeopleCheckDefinitions,
  listPersonEvidence,
  listJobTitles,
} from "@/lib/people/data";
import { listPersonHolidays } from "@/lib/holidays/data";
import { getPersonLoginStatus } from "@/lib/staff/data";
import { invitePersonLogin } from "@/lib/staff/actions";
import { listPersonAbsences, listPersonMeetings } from "@/lib/absence/data";
import {
  applyMissingChecks,
  setArchived,
  setEmploymentStatus,
  setRetentionHold,
  transferPerson,
} from "@/lib/people/actions";
import { appraisalSlot, formatDisplayDate, recurrenceLabel, supervisionSlots } from "@/lib/people/logic";
import { nextSupervisionNumber } from "@/lib/people/next-supervision";
import { ukDate } from "@/lib/dates";
import {
  type CheckStatus,
  RTW_LIMIT_LABELS,
  PROBATION_STATUS_LABELS,
  WORKING_STATUS_LABELS,
  type ProbationStatus,
  type EmploymentStatus,
} from "@/lib/people/types";
import { DEFAULT_AMBER_DAYS } from "@/lib/recurrence";
import { REGISTER_ROLES as MANAGE_ROLES } from "@/lib/auth/module-roles";

export const metadata: Metadata = { title: "Record" };


/* Exactly who can open the Complaints section. Kept the same on purpose: two lists that can
   drift is how a tile ends up showing HR sensitive detail to somebody the section itself
   would turn away. */
const COMPLAINT_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager", "on_call", "platform_admin"];
const COMPLETE_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager", "supervisor", "recruiter", "platform_admin"];
const RAG_RANK: Record<string, number> = { red: 0, amber: 1, green: 2, none: 3 };

function ragPill(rag: string, size = "") {
  if (rag === "red") return <span className={`pill-red ${size}`}><span className="pill-dot" /> Overdue</span>;
  if (rag === "amber") return <span className={`pill-amber ${size}`}><span className="pill-dot" /> Due soon</span>;
  if (rag === "green") return <span className={`pill-green ${size}`}><span className="pill-dot" /> Compliant</span>;
  return <span className={`pill-neutral ${size}`}>Not scheduled</span>;
}

/* The record header only (Phil, 2026-09-08: "make the persons name, job title and branch
   bigger, made the pill next to their name bigger"). A record IS a person, and their name
   was the same 24px as the word "Settings" on a settings page. The pill beside it carries
   the one thing a manager opens the record to learn -- whether this person is compliant --
   at the size of a footnote. Scoped here rather than in .page-title and .pill, which are
   used on every screen in the app. */
const NAME_SIZE = "text-4xl sm:text-5xl";
const PILL_SIZE = "px-4 py-2 text-base";

function slotPill(rag: string) {
  const cls =
    rag === "red" ? "rag-cell-red" : rag === "amber" ? "rag-cell-amber" : rag === "green" ? "rag-cell-green" : "rag-cell-none";
  return cls;
}

// Read-only probation status pill. Status is only ever set by completing the
// Probation Review form (never inline), which then feeds the register (Phil, 2026-07-18).
function probationStatusPill(status: ProbationStatus | null) {
  if (!status) return <span className="pill-neutral">Not set</span>;
  const cls =
    status === "passed" ? "pill-green" : status === "failed" ? "pill-red" : status === "extended" ? "pill-amber" : "pill-neutral";
  return <span className={cls}>{PROBATION_STATUS_LABELS[status]}</span>;
}

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    completed?: string;
    recorded?: string;
    from?: string;
    /** "failed" when their Team Member login could not be created as they were added. */
    login?: string;
  }>;
}) {
  const { profile } = await requireCompany();
  const { id } = await params;
  const { completed, recorded, from, login: loginBanner } = await searchParams;
  // Back returns to the view the record was opened from (Main, Leavers, Archive, ...);
  // only accept in-app /people paths to avoid an open redirect.
  const backHref = from && from.startsWith("/people") ? from : "/people";

  const person = await getPerson(id);
  if (!person || !profile.company_id) redirect("/people");
  const companyId = profile.company_id;
  /*
   * PER RECORD, NOT PER ROLE (Phil, 2026-08-14). This used to be
   * `MANAGE_ROLES.includes(profile.role)`, which is a role check where RLS does a role check AND
   * a branch check. Migration 0183 opened the gap for real: a booked conductor can now SEE a
   * carer outside their branches, and every Manage control on that record is a write the
   * database will refuse. lib/auth/manage-scope.ts is a transcription of the policy.
   */
  const canManage =
    MANAGE_ROLES.includes(profile.role) &&
    canManageRecord({
      role: profile.role,
      branchIds: await callerBranchIds(profile.id),
      recordBranchId: person.branch_id,
    });
  /* SUPPORT MODE CANNOT COMPLETE A CHECK, so it must not offer to. Completing writes signed
     compliance evidence, and evidence signed by the founder impersonating a manager is worse
     than no evidence. Until 2026-08-19 the buttons rendered, the form filled in, and the save
     was refused at the very end with "Not a member of this company" — after the work. */
  const supportMode = Boolean(profile.actingAsCompanyId);
  const canComplete = COMPLETE_ROLES.includes(profile.role) && !supportMode;
  // The audit History timeline is Admins only (Founder + Company Admin).
  const canViewHistory = profile.role === "platform_admin" || profile.role === "company_admin";

  const [
    statuses,
    definitions,
    evidence,
    users,
    branches,
    tracker,
    holidays,
    absences,
    meetings,
  ] = await Promise.all([
    getPersonChecks(id),
    listPeopleCheckDefinitions(companyId),
    listPersonEvidence(id),
    canManage ? listSupervisoryUsers(companyId) : Promise.resolve([]),
    canManage ? listBranches(companyId, profile) : Promise.resolve([]),
    getPersonTracker(id),
    listPersonHolidays(id),
    listPersonAbsences(id),
    listPersonMeetings(id),
  ]);

  // Their own login. Manager-and-above information, so it is only fetched for someone who
  // can manage the record. The briefings that were fetched alongside it went with the tile.
  const login = canManage ? await getPersonLoginStatus(id) : null;

  // The history timeline uses the record_audit_trail RPC (guarded by
  // can_manage_person), so only fetch it for managers/admins. Exports are Pro+.
  const [auditTrail, exportsEnabled, jobTitles] = await Promise.all([
    canManage ? getRecordAuditTrail("person", id) : Promise.resolve([]),
    featureEnabled(companyId, "reporting_exports"),
    // The same list Add a person offers, so a job title is chosen the same way whether it
    // is being set for the first time or corrected afterwards.
    canManage ? listJobTitles(companyId) : Promise.resolve([]),
  ]);

  /* COMPLAINTS ABOUT THIS PERSON. The role list is the Complaints section's own, not this
     page's: a supervisor may manage the record and still have no business seeing complaints
     about the person. RLS refuses them anyway; this stops the tile being drawn at all so
     there is nothing to wonder about. */
  const canSeeComplaints =
    COMPLAINT_ROLES.includes(profile.role) && (await featureEnabled(companyId, "complaints"));
  const personComplaints = canSeeComplaints ? await listComplaintsForPerson(id) : [];

  const supDef = definitions.find((d) => d.key === "supervision");
  const supFormId = supDef?.form_id ?? null;
  const appraisalDef = definitions.find((d) => d.key === "appraisal");
  const healthDef = definitions.find((d) => d.key === "health_check");
  const [supCompDates, appraisalCompDates, healthDates] = await Promise.all([
    getSupervisionCompDates(id, supFormId, supDef?.id ?? null),
    getAppraisalCompDates(id, appraisalDef?.form_id ?? null, appraisalDef?.id ?? null),
    getHealthCheckDates(id, healthDef?.form_id ?? null),
  ]);
  const supInterval = supDef?.interval ?? 90;
  const supAmber = supDef?.amber_days ?? DEFAULT_AMBER_DAYS;
  const cycleMode = await getSupervisionCycleMode(companyId);
  const supCount = cycleMode === "four_supervisions" ? 4 : 3;
  // Sup 1 due anchors on the later of the last Annual Appraisal completion and the
  // successful probation end; each completed appraisal restarts the cycle by count
  // (see supervisionSlots), matching the Service User reviews. In four-supervisions
  // mode there is no appraisal and every fourth supervision restarts the cycle.
  const slots = supervisionSlots(
    supInterval,
    supCompDates,
    supAmber,
    appraisalCompDates,
    tracker?.probation_end_actual ?? null,
    undefined,
    supCount,
    cycleMode,
  );
  // Sequential: only the next-due supervision (the first one not yet completed)
  // offers a Complete button, mirroring the Service User reviews. The rule is shared with
  // the completion page, which has to reach the same answer when it is opened from the
  // planner with no supervision number in the URL.
  const dueSupN = nextSupervisionNumber(slots);

  /* THE ANNUAL APPRAISAL IS DERIVED, NOT READ (Phil, 2026-09-08: "on the compliance
     matrix the annual appraisal due shows the date of 29/11/26 but on the name card for
     annual appraisal next due is blank... the name card should match the matrix").

     In appraisal mode the appraisal falls due a supervision interval after the third
     supervision of the cycle. The register works that out live from the completions; this
     page was reading check_instances.due_date, which is only written at the moment Sup 3
     is completed AND only if the appraisal was already set to "after supervision 3". Turn
     that setting on afterwards -- exactly what happened here -- and the stored date stays
     empty forever while the register shows the real one. Two screens, two answers, one of
     them wrong.

     Both now derive it the same way, from the same function and the same inputs, so they
     cannot disagree. Untouched in four-supervisions mode, where there is no appraisal. */
  const aaSlot = appraisalSlot(appraisalCompDates, supCompDates, supInterval, supAmber, undefined, slots[2]?.comp ?? null);

  const statusByDef = new Map<string, CheckStatus>(statuses.map((s) => [s.definition_id, s]));
  const supStatus = statuses.find((s) => s.check_key === "supervision") ?? null;
  // Checks grid order: Spot Check first, then Annual Appraisal, then the rest
  // (Phil, 2026-07-18). Unlisted checks keep their natural order after these.
  const CHECK_ORDER: Record<string, number> = { spot_check: 0, appraisal: 1 };
  /* A check restricted to job titles is not shown on anybody else's record at all --
     not as a tile saying "Not applied", which reads as something missing when it is
     simply not theirs (Phil, 2026-09-08: Lead the Leader "will only sit on the name card
     of supervisor and above"). The instance is already refused in the database; this is
     the same rule on the screen. */
  const applicableDefs = checksForTitle(definitions, person.job_title);
  /* THE APPRAISAL STANDS WITH THE SUPERVISIONS, NOT AMONG THE CHECKS (Phil, 2026-09-08:
     "move the annual appraisal from checks and put it to the right of supervisions so it is
     its own tile with the title above the tile like supervision"). On a three-supervisions
     company the appraisal is not another annual check that happens to fall in the same year:
     it is the fourth meeting of the cycle, it is what Supervision 3 leads to, and completing
     it is what starts the next three. Sat in the Checks grid between Manual Handling and
     Medication Competency, nothing on the screen said so. In four-supervisions mode there is
     no appraisal in the cycle at all, so it stays an ordinary check. */
  const appraisalTileDef =
    cycleMode === "appraisal"
      ? applicableDefs.find((d) => d.key === "appraisal") ?? null
      : null;
  const otherDefs = applicableDefs
    .filter((d) => d.key !== "supervision" && d.id !== appraisalTileDef?.id)
    .sort((a, b) => (CHECK_ORDER[a.key] ?? 99) - (CHECK_ORDER[b.key] ?? 99));

  // Probation tile sits ABOVE the Checks until the employee passes probation, then
  // drops into the DBS / Right to Work tracker row (Phil, 2026-07-18). Above Checks
  // it is full width with the three dates and the status control on one row (shallow).
  const probationPassed = tracker?.probation_status === "passed";
  const probationWide = (
    <div className="glass-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[15px] font-semibold text-white">Probation</h2>
          {probationStatusPill(tracker?.probation_status ?? null)}
        </div>
        {canManage && !supportMode ? (
          <Link href={`/people/${person.id}/tracker/probation_review/complete`} className="btn-primary btn-tracker">
            Complete
          </Link>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-white/10 px-3 py-2">
          <p className="text-[12px] text-white/50">End due</p>
          <p className="text-[15px] text-white/90">{formatDisplayDate(tracker?.probation_end_due ?? null) || "—"}</p>
        </div>
        <div className="rounded-lg border border-white/10 px-3 py-2">
          <p className="text-[12px] text-white/50">End actual</p>
          <p className="text-[15px] text-white/90">{formatDisplayDate(tracker?.probation_end_actual ?? null) || "—"}</p>
        </div>
        <div className="rounded-lg border border-white/10 px-3 py-2">
          <p className="text-[12px] text-white/50">Extension</p>
          <p className="text-[15px] text-white/90">{formatDisplayDate(tracker?.probation_extension_date ?? null) || "—"}</p>
        </div>
      </div>
    </div>
  );
  /*
   * THE DOCUMENTS SIT WITH THE CHECKS (Phil, 2026-09-18: "put DBS Right to work and
   * prbation to the right of health check and make the tiles to came size as health
   * check"). They were a row of three wide cards below, in a different size and a
   * different type scale, for no reason other than that they were added separately. They
   * are the same thing to the person reading the record -- something with a date on it
   * that has to be kept up -- so they are the same tile, in the same grid, and the row
   * runs on from Health Check instead of starting again underneath.
   */
  const trackerTile = (
    title: string,
    sub: string,
    rows: Array<{ label: string; value: string }>,
    href: string | null,
    extra?: React.ReactNode,
    badge?: React.ReactNode,
  ) => (
    <div key={title} className="glass-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-semibold text-white">{title}</h3>
          <p className="text-[12px] text-white/45">{sub}</p>
        </div>
        {badge}
      </div>
      <dl className="mt-3 space-y-1 text-[13px] text-white/60">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between">
            <dt>{r.label}</dt>
            <dd className="text-white/85">{r.value}</dd>
          </div>
        ))}
      </dl>
      {extra}
      {href ? (
        <Link href={href} className="btn-primary btn-tile text-[13px]">Complete</Link>
      ) : null}
    </div>
  );

  const probationTile = trackerTile(
    "Probation",
    "Document",
    [
      { label: "End due", value: formatDisplayDate(tracker?.probation_end_due ?? null) || "—" },
      { label: "End actual", value: formatDisplayDate(tracker?.probation_end_actual ?? null) || "—" },
      { label: "Extension", value: formatDisplayDate(tracker?.probation_extension_date ?? null) || "—" },
    ],
    /* NO WAY IN ONCE IT IS PASSED (Phil, 2026-09-18). This tile only renders at all once
       probation has been passed, so the button on it was offering to hold a probation review
       for somebody whose probation is over. The dates and the status stay, and so does every
       review already filed; only the button goes. While probation is still running the WIDE
       tile above the Checks carries the button, which is where it belongs. */
    null,
    undefined,
    probationStatusPill(tracker?.probation_status ?? null),
  );

  const dbsTile = trackerTile(
    "DBS",
    "Document",
    [
      { label: "DBS", value: formatDisplayDate(tracker?.dbs_date ?? null) || "—" },
      { label: "Enhanced DBS", value: formatDisplayDate(tracker?.enhanced_dbs_date ?? null) || "—" },
    ],
    canManage && !supportMode ? `/people/${person.id}/tracker/dbs_renewal/complete` : null,
  );

  /* LIMITS IS READ HERE AND ANSWERED ON THE FORM (Phil, 2026-09-18). It was a dropdown and a
     Save button on this tile, which made it the only value on the record that could be changed
     without any Evidence saying who changed it or why. The right to work check establishes it,
     so the check asks it (0300) and it prints here like every other value. */
  const rtwTile = trackerTile(
    "Right to Work",
    "Document",
    [
      { label: "Expiry", value: formatDisplayDate(tracker?.rtw_expiry_date ?? null) || "—" },
      { label: "Limits", value: tracker?.rtw_limits ? RTW_LIMIT_LABELS[tracker.rtw_limits] : "—" },
    ],
    canManage && !supportMode ? `/people/${person.id}/tracker/right_to_work/complete` : null,
  );

  /* Complaints naming this person. The RAG is driven by UPHELD complaints only: being
     complained about is not the same as having done something wrong, and a tile that goes
     red on an accusation would say it was. */
  const complaintCounts = countForPerson(personComplaints);
  const complaintRag = ragForCounts(complaintCounts);
  const complaintsTile = (
    <div className="glass-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-white">Complaints</h2>
        {complaintCounts.total > 0 ? (
          <Link href={`/people/${person.id}/complaints`} className="btn-outline btn-tracker">
            View
          </Link>
        ) : null}
      </div>
      <p
        className={`text-2xl font-semibold ${
          complaintRag === "red"
            ? "text-rag-red"
            : complaintRag === "amber"
              ? "text-rag-amber"
              : "text-white/85"
        }`}
      >
        {complaintCounts.total}
      </p>
      <p className="mt-1 text-sm text-white/55">{describeCounts(complaintCounts)}</p>
    </div>
  );

  const worstRag =
    statuses.length === 0
      ? "none"
      : statuses.reduce((worst, s) => (RAG_RANK[s.rag] < RAG_RANK[worst] ? s.rag : worst), "green" as string);
  /* Counted over the checks that are actually this person's, so the button never offers to
     apply something the database would refuse and then report nothing happened. */
  const missingCount = applicableDefs.filter((d) => !statusByDef.has(d.id)).length;
  const branchOptions = branches.filter((b) => b.kind === "branch" || b.kind === "team");
  const isLeaver = person.employment_status === "leaver";

  /* ONE TILE, ONE PLACE. The appraisal renders beside the supervisions and every other check
     renders in the grid, and both go through this, so the two can never drift into showing a
     due date two different ways. */
  const checkTile = (def: (typeof definitions)[number]) => {
    const st = statusByDef.get(def.id);
    /* No appraisal special case here any more: in appraisal mode it is the fourth box of the
       supervision card (appraisalBox), and in four-supervisions mode there is no appraisal in
       the cycle at all, so it is an ordinary check and reads its own stored instance. */
    const nextDue = st?.due_date ?? null;
    const lastComp = st?.last_completed_on ?? null;
    const rag = st?.rag ?? "none";
    /* A ONE-OFF THAT HAS BEEN DONE IS FINISHED, and does not go on offering itself. Its due
       date stayed where it was and has meant nothing since the day it was done -- the same
       rule the daily report now follows. */
    const settledOneOff = !def.recurring && !!lastComp;
    /*
     * THE PROBATION HEALTH CHECK IS TWO CONVERSATIONS, NOT ONE (Phil, 2026-09-18). It is
     * completed at week 4 and again at week 8, so "Last completed" answers the wrong
     * question: what a manager wants is which of the two is still owed. And the way IN
     * closes when probation is passed, while everything already recorded stays put -- the
     * Evidence is filed for good and both dates keep showing.
     */
    if (def.key === "health_check") {
      const rowClass = "flex justify-between";
      return (
        <div key={def.id} className="glass-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-[15px] font-semibold text-white">{def.name}</h3>
              <p className="text-[12px] text-white/45">During probation</p>
            </div>
          </div>
          <dl className="mt-3 space-y-1 text-[13px] text-white/60">
            <div className={rowClass}>
              <dt>Week 4</dt>
              <dd className="text-white/85">{healthDates.week4 ? formatDisplayDate(healthDates.week4) : "—"}</dd>
            </div>
            <div className={rowClass}>
              <dt>Week 8</dt>
              <dd className="text-white/85">{healthDates.week8 ? formatDisplayDate(healthDates.week8) : "—"}</dd>
            </div>
          </dl>
          {st && def.form_id && canComplete && !probationPassed ? (
            <Link href={`/people/${person.id}/checks/${st.instance_id}/complete`} className="btn-primary btn-tile text-[13px]">Complete</Link>
          ) : null}
        </div>
      );
    }
    return (
      <div key={def.id} className="glass-card p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-semibold text-white">{def.name}</h3>
            <p className="text-[12px] text-white/45">{recurrenceLabel(def)}</p>
          </div>
          {st ? ragPill(rag) : <span className="pill-neutral">Not applied</span>}
        </div>
        <dl className="mt-3 space-y-1 text-[13px] text-white/60">
          {/* A finished one-off has no next due, so the row goes rather than printing a dash
              at it (Phil, 2026-09-18). */}
          {settledOneOff ? null : (
            <div className="flex justify-between"><dt>Next due</dt><dd className="text-white/85">{nextDue ? formatDisplayDate(nextDue) : "—"}</dd></div>
          )}
          <div className="flex justify-between"><dt>Last completed</dt><dd className="text-white/85">{lastComp ? formatDisplayDate(lastComp) : "Never"}</dd></div>
        </dl>
        {st && def.form_id && canComplete && !settledOneOff ? (
          <Link href={`/people/${person.id}/checks/${st.instance_id}/complete`} className="btn-primary btn-tile text-[13px]">Complete</Link>
        ) : null}
      </div>
    );
  };

  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const appraisalStatus = appraisalTileDef ? statusByDef.get(appraisalTileDef.id) : undefined;
  const appraisalReady = aaSlot.nextDue != null;
  const appraisalBox = appraisalTileDef ? (
    <CycleBox
      title="Annual Appraisal"
      due={aaSlot.nextDue}
      comp={aaSlot.comp}
      ragClass={slotPill(aaSlot.nextDueRag)}
      href={
        appraisalStatus && appraisalTileDef.form_id && canComplete && appraisalReady && !aaSlot.comp
          ? `/people/${person.id}/checks/${appraisalStatus.instance_id}/complete`
          : null
      }
      todayIso={todayIso}
    />
  ) : null;

  return (
    <div className="page-shell space-y-6">
      {/* The record's actions live in the corner, not in a card of their own further down,
          and LEVEL WITH THE NAME rather than up by the Back link (Phil, 2026-09-08). Book a
          task renders nothing off the Planner tier, and the name row simply closes up. */}
      <div>
        <BackLink href={backHref} label="Back to People" />
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className={`page-title ${NAME_SIZE}`}>{person.full_name}</h1>
            {ragPill(worstRag, PILL_SIZE)}
            {person.employment_status !== "active" ? (
              <span className="pill-neutral">{WORKING_STATUS_LABELS[person.employment_status]}</span>
            ) : null}
            {person.archived_at ? <span className="pill-neutral">Archived</span> : null}
          </div>
          <RecordBookTask
            companyId={companyId}
            population="people"
            recordId={person.id}
            recordName={person.full_name}
            branchId={person.branch_id}
          />
        </div>
        <p className="page-subtitle mt-1.5 text-lg">
          {[person.job_title, person.branch_name, person.team].filter(Boolean).join(" · ") || "Staff record"}
        </p>
      </div>

      {completed ? (
        <div className="glass-card border border-rag-green/20 p-4 text-sm text-rag-green-soft">
          {completed} completed. Evidence stored and the next due date scheduled.
        </div>
      ) : null}

      {/* It could not be done, so nothing was credited. Saying so is the whole point:
          the green banner above would be a lie about a check that is still due. */}
      {recorded ? (
        <div className="glass-card border border-rag-amber/25 p-4 text-sm text-rag-amber-soft">
          {recorded} recorded as not completed. Evidence stored with the reason, and the
          check is still due.
        </div>
      ) : null}

      {/* THE LOGIN THAT DID NOT GET MADE (2026-09-21). It used to go into the audit log and
          nowhere else, so the only sign was a carer who never heard anything. The record was
          created either way — this is one thing left to do, not a failure of the add. */}
      {loginBanner === "failed" ? (
        <div className="glass-card border border-rag-amber/25 p-4 text-sm text-rag-amber-soft">
          {person.full_name} has been added, but their Team Member login could not be created.
          Nothing has been emailed to them. Press Invite them on this record to try again — and
          if it refuses a second time, tell us rather than adding them again.
        </div>
      ) : null}

      {isLeaver ? (
        <div className="glass-card p-6 text-sm text-white/60">
          This person is a leaver, so their checks are excluded from the active
          register and reminders. Their evidence history is kept below.
        </div>
      ) : (
        <>
          {/* ONE CARD, ONE CYCLE (Phil, 2026-09-18: "supervision is a tile with 3 inner boxes
              and then annual appraisal next to it join them together"). They were two cards
              with two headings and two footnotes, side by side, describing one thing: three
              supervisions and the appraisal that closes them. The appraisal is now the fourth
              box in the same card, so the cycle reads left to right in the order it happens. */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
              {appraisalTileDef ? "Supervision and Annual Appraisal" : "Supervision"}
            </h2>
            <div className={`glass-card grid gap-3 p-4 ${supCount === 4 || appraisalTileDef ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
              {slots.map((s) => (
                <CycleBox
                  key={s.n}
                  /* Named, not numbered. A bare "3" in a box needs the heading above the card
                     to mean anything, and the card is now headed "Supervision and Annual
                     Appraisal", so the number on its own read as a count of nothing. */
                  title={`Supervision ${s.n}`}
                  due={s.due}
                  comp={s.comp}
                  ragClass={slotPill(s.rag)}
                  href={
                    supStatus && supFormId && canComplete && s.n === dueSupN
                      ? `/people/${person.id}/checks/${supStatus.instance_id}/complete?sup=${s.n}`
                      : null
                  }
                  todayIso={todayIso}
                />
              ))}
              {appraisalTileDef ? appraisalBox : null}
            </div>
            <p className="text-[11px] text-white/40">
              Supervision 1 is due {supInterval} days after successful probation end, then
              {" "}{supInterval} days after {supCount === 4 ? `every ${supCount} supervisions (which restarts the cycle)` : "each Annual Appraisal (which restarts the cycle)"}.
              {" "}Each further supervision is due {supInterval} days after the previous one is completed.
              {appraisalTileDef
                ? ` The Annual Appraisal is due ${supInterval} days after Supervision ${supCount}, and cannot be completed until that supervision has been. Completing it starts the next ${supCount}.`
                : ""}
            </p>
          </section>

          {/* Probation shows here (above Checks) until the employee passes, full
              width to match the Supervision card above (Phil, 2026-07-18). */}
          {!probationPassed ? probationWide : null}

          {/* Other recurring checks */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Checks</h2>
              {canManage && missingCount > 0 ? (
                <ActionForm
                  action={applyMissingChecks}
                  hidden={{ person_id: person.id }}
                  label={`Apply ${missingCount} missing`}
                  buttonClassName="btn-outline text-xs"
                  className=""
                />
              ) : null}
            </div>
            {/* FIVE IN A ROW (Phil, 2026-09-18). It was auto-fit with a 230px floor, which put
                as many as would go on one line: fine at six, and by the time One to One and
                Health Check joined it was seven narrow slivers with the names wrapping. Five
                is a width a check tile reads at, and the rest wrap onto a second row rather
                than squeezing the first. It steps down on narrower screens; the tile's own
                content still sets its height. */}
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {otherDefs.map((def) => checkTile(def))}
              {/* Straight on from Health Check, in the order Phil asked for. Probation only
                  joins them once it is passed; before that it keeps its wide tile above the
                  Checks, where somebody still on probation needs to see it. */}
              {dbsTile}
              {rtwTile}
              {probationPassed ? probationTile : null}
            </div>
          </section>

          {/* WHAT IS LEFT OF THE TRACKER ROW. DBS, Right to Work and Probation moved up into
              the Checks grid (2026-09-18); complaints about this person were never a tracker
              and simply stayed behind.

              Shown only to people who can already open the Complaints section: complaints
              about staff are HR sensitive, and a supervisor who can see this record cannot see
              the section, so must not see this either. Never a bare count -- the outcome is in
              the same sentence. */}
          {canSeeComplaints ? (
            <section className="grid gap-3 lg:grid-cols-3">{complaintsTile}</section>
          ) : null}
        </>
      )}

      {/* THE PERSON'S OWN ADMIN, IN ONE ROW: their login, their holiday, their absence
          (Phil, 2026-09-08: "holiday and absence can go next to Team meber login"). All three
          are about the employee rather than their compliance, they are read far more often
          than they are acted on, and each was taking a row of its own. The login tile is
          managers only, so auto-fit rather than a fixed three: a Supervisor sees two and they
          share the row between them instead of leaving a gap where the login would have been.
          The Briefings tile that used to sit here went with its query. */}
      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
      {canManage ? (
          <div className="glass-card p-5">
            {/* The invite sits in the corner beside the heading, where a tile's action lives
                (Phil, 2026-09-08). Its WORD changes with the state -- Invite them when there
                is no login, Send it again when one was sent and never opened -- because they
                are the same act and a person should not have to read two paragraphs to work
                out which button they are looking at. Nothing at all when there is no email to
                send to, or when the login is already active. */}
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white">
                Team Member login
              </h2>
              {login?.has_email && !(login.has_login && login.login_status === "active") ? (
                <ActionForm
                  action={invitePersonLogin}
                  hidden={{ person_id: id }}
                  label={
                    /* THREE STATES, NOT TWO. "Send it again" is a lie about an invite whose
                       email was held and never went: there is no again. Settings > Users has
                       said "Send invite" against a held invite and "Resend" against a sent one
                       since it was built; this screen now agrees with it. */
                    login.email_sent_at
                      ? "Send it again"
                      : login.invite_status === "pending" || login.login_status === "invited"
                        ? "Send invite"
                        : "Invite them"
                  }
                  savedLabel="Sent"
                  /* NOT btn-tracker: that is a fixed 6rem, sized for the word Complete, and
                     "Send it again" does not fit in it. Same look, its own width. */
                  buttonClassName="btn-primary text-xs"
                  className=""
                />
              ) : null}
            </div>
            {!login?.has_email ? (
              <p className="text-sm text-white/50">
                No personal email on this record, so they cannot be given a login. Add one
                above and the invite goes out automatically.
              </p>
            ) : login.has_login && login.login_status === "active" ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="pill-green">Active</span>
                <span className="text-sm text-white/60">
                  They can sign in and see their own area.
                </span>
              </div>
            ) : login.invite_status === "pending" || login.login_status === "invited" ? (
              <div className="flex flex-wrap items-center gap-2">
                {/* HELD IS NOT SENT, AND INVITED IS NOT WRITTEN TO. The bulk import can create
                    the login and deliberately hold the email; this screen used to read the
                    invite's created_at and announce it as sent, so an administrator who held
                    thirteen invites was told all thirteen had reached real carers.
                    email_sent_at is the only thing that means sent, and the pill says which
                    of the two states this is, exactly as Settings > Users does. */}
                {login.email_sent_at ? (
                  <>
                    <span className="pill-amber">Invited</span>
                    <span className="text-sm text-white/60">
                      Sent {formatDisplayDate(String(login.email_sent_at).slice(0, 10))}, not
                      opened yet.
                    </span>
                  </>
                ) : (
                  <>
                    <span className="pill pill-neutral">Not sent yet</span>
                    <span className="text-sm text-white/60">
                      Their login is ready, but nobody has emailed it to them. Send it from
                      here, or send them together from Settings, Users.
                    </span>
                  </>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="pill-neutral">No login</span>
                <span className="text-sm text-white/60">
                  They cannot see their holidays or anything assigned to them.
                </span>
              </div>
            )}
          </div>
      ) : null}

        <div className="glass-card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white">Holiday</h2>
          {holidays.length === 0 ? (
            <p className="text-sm text-white/50">No holiday requests.</p>
          ) : (
            <ul className="space-y-2">
              {holidays.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-white/80">
                    {formatDisplayDate(h.start_date)} to {formatDisplayDate(h.end_date)}
                  </span>
                  <span
                    className={
                      h.status === "approved"
                        ? "pill pill-green"
                        : h.status === "declined"
                          ? "pill pill-red"
                          : "pill pill-amber"
                    }
                  >
                    {h.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass-card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white">Absence</h2>
          {absences.length === 0 && meetings.length === 0 ? (
            <p className="text-sm text-white/50">No absences recorded.</p>
          ) : (
            <>
              <ul className="space-y-1.5 text-sm">
                {absences.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <span className="text-white/80">{formatDisplayDate(a.start_date)}</span>
                    <span className="truncate text-xs text-white/50">{a.reason ?? ""}</span>
                  </li>
                ))}
              </ul>
              {meetings.length > 0 && (
                <div className="mt-3 border-t border-white/10 pt-3">
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-white/40">Meetings</p>
                  <ul className="space-y-1 text-sm">
                    {meetings.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2">
                        <span className="text-white/80">{formatDisplayDate(m.meeting_date) || "—"}</span>
                        <span className="pill pill-neutral">
                          {m.stage ? `Stage ${m.stage}` : "Meeting"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* THE THREE FOLDED SECTIONS SIT IN ONE ROW (Phil, 2026-09-08: "Evidence history,
          history and manage record all be one third of the size and sit on one row"). Closed,
          which is how they spend nearly all their time, three summaries stacked took three
          full rows of a record to say nothing. auto-fit rather than grid-cols-3 because two
          of the three are permission dependent -- History is Admins only and Manage record is
          managers only -- so a fixed three columns would leave a hole on the records of the
          people who see fewer of them. items-start so opening one does not stretch the others
          to match it. */}
      <section className="grid items-start gap-4 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
      <PanelDialog title="Evidence history" count={evidence.length}>
        <EvidenceHistory rows={evidence} />
      </PanelDialog>

      {/* History timeline (Admins only). Oldest at top, newest at bottom. */}
      {canViewHistory ? (
        <RecordHistory recordType="person" recordId={person.id} entries={auditTrail} entitled={exportsEnabled} />
      ) : null}

      {/* Management */}
      {canManage ? (
        <PanelDialog title="Manage record">
          {/*
           * THREE FORMS, SAID OUT LOUD (Phil, 2026-09-16). This panel holds three independent
           * actions with three save buttons, and nothing on screen said so. Changing the job
           * title at the top and then pressing the save at the bottom saves the WORKING STATUS
           * and silently discards the job title: four times in a row the audit log recorded
           * "Set working status to active" for somebody who was trying to change a job title
           * and reported that nothing was happening.
           *
           * Each one now says what its button saves and is fenced off from the next, so the
           * button belonging to what you just edited is the one beside it.
           */}
          <div className="space-y-6 border-t border-white/10 p-5">
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">
                Details
              </h3>
              <EditPersonForm person={person} users={users} jobTitles={jobTitles} />
            </section>

            {/* TRANSFER ALONE. The Supervisors picker that used to sit beside it wrote to
                person_assignments, a table migration 0078 abandoned: a Supervisor sees
                their BRANCH, not an assigned caseload, and no policy, function or query
                has read that table since. It was a control that looked like it decided who
                could see a carer and decided nothing (Phil, 2026-09-08: "i dont think we
                need Supervisor caseload"). */}
            <div className="grid gap-5 border-t border-white/10 pt-4 sm:grid-cols-2">
              <ActionForm action={transferPerson} hidden={{ person_id: person.id }} label="Transfer" buttonClassName="btn-outline text-xs">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">
                  Branch
                </h3>
                <label htmlFor="transfer_branch" className="form-label">Transfer to branch</label>
                <select id="transfer_branch" name="branch_id" defaultValue={person.branch_id}>
                  {branchOptions.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                </select>
              </ActionForm>

            </div>

            <div className="flex flex-wrap items-end gap-3 border-t border-white/10 pt-4">
              <ActionForm action={setEmploymentStatus} hidden={{ person_id: person.id }} inline label="Save status">
                <label htmlFor="working_status" className="form-label">
                  Working status
                  <span className="ml-2 font-normal text-white/40">
                    (this button saves the status only)
                  </span>
                </label>
                <select id="working_status" name="status" defaultValue={person.employment_status}>
                  {(Object.keys(WORKING_STATUS_LABELS) as EmploymentStatus[]).map((k) => (
                    <option key={k} value={k}>{WORKING_STATUS_LABELS[k]}</option>
                  ))}
                </select>
              </ActionForm>
              {/* Archive is only offered once a person is a Leaver; Restore shows for
                  an archived record. Active/LTS/Mat Leave staff cannot be archived. */}
              {person.archived_at || person.employment_status === "leaver" ? (
                <ActionForm
                  action={setArchived}
                  hidden={{ person_id: person.id, archive: person.archived_at ? "false" : "true" }}
                  label={person.archived_at ? "Restore" : "Archive"}
                  buttonClassName="btn-ghost text-xs"
                  className=""
                />
              ) : null}
            </div>

            {/* RETENTION HOLD (item 18). Offered once a person is a Leaver, because that is
                when the eight year clock starts and their records become destructible, and
                also whenever a hold is already on so it can always be lifted. A reason is
                required: "why are these still here" is the question asked years later. */}
            {person.employment_status === "leaver" || person.retention_hold ? (
              <div className="border-t border-white/10 pt-4">
                <h3 className="text-sm font-semibold text-white/80">Records retention</h3>
                {person.retention_hold ? (
                  <>
                    <p className="mt-1 text-sm text-amber-200">
                      On hold: these records will not be anonymised when their retention date
                      passes.
                    </p>
                    <p className="mt-1 text-xs text-white/60">
                      Reason: {person.retention_hold_reason || "Not recorded"}
                      {person.retention_hold_set_at ? ` · held ${ukDate(person.retention_hold_set_at.slice(0, 10))}` : ""}
                    </p>
                    <div className="mt-3">
                      <ActionForm
                        action={setRetentionHold}
                        hidden={{ person_id: person.id, hold: "false" }}
                        label="Lift the hold"
                        buttonClassName="btn-ghost text-xs"
                        className=""
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-sm text-white/60">
                      Evidence for a leaver is kept for eight years from their leaving date and
                      is then anonymised automatically. Hold it if these records must be kept
                      longer, for example an ongoing tribunal or investigation.
                    </p>
                    <ActionForm
                      action={setRetentionHold}
                      hidden={{ person_id: person.id, hold: "true" }}
                      inline
                      label="Hold these records"
                      buttonClassName="btn-outline text-xs"
                    >
                      <label htmlFor="retention_reason" className="form-label">Reason</label>
                      <input
                        id="retention_reason"
                        name="reason"
                        type="text"
                        maxLength={500}
                        placeholder="Why these records must be kept"
                        required
                      />
                    </ActionForm>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </PanelDialog>
      ) : null}
      </section>
    </div>
  );
}
