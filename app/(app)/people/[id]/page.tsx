import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { canManageRecord } from "@/lib/auth/manage-scope";
import { callerBranchIds } from "@/lib/auth/branches";
import BackLink from "@/components/back-link";
import { checksForTitle } from "@/lib/people/check-scope";
import ActionForm from "@/components/action-form";
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
  getSupervisionCycleMode,
  listBranches,
  listSupervisoryUsers,
  listPeopleCheckDefinitions,
  listPersonEvidence,
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
  updateTracker,
} from "@/lib/people/actions";
import { appraisalSlot, formatDisplayDate, recurrenceLabel, supervisionSlots } from "@/lib/people/logic";
import { nextSupervisionNumber } from "@/lib/people/next-supervision";
import { ukDate } from "@/lib/dates";
import {
  type CheckStatus,
  RTW_LIMIT_LABELS,
  PROBATION_STATUS_LABELS,
  WORKING_STATUS_LABELS,
  type RtwLimit,
  type ProbationStatus,
  type EmploymentStatus,
} from "@/lib/people/types";
import { DEFAULT_AMBER_DAYS } from "@/lib/recurrence";

export const metadata: Metadata = { title: "Record" };

const MANAGE_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager", "platform_admin"];
const COMPLETE_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager", "supervisor", "platform_admin"];
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
  searchParams: Promise<{ completed?: string; recorded?: string; from?: string }>;
}) {
  const { profile } = await requireCompany();
  const { id } = await params;
  const { completed, recorded, from } = await searchParams;
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
  const [auditTrail, exportsEnabled] = await Promise.all([
    canManage ? getRecordAuditTrail("person", id) : Promise.resolve([]),
    featureEnabled(companyId, "reporting_exports"),
  ]);

  const supDef = definitions.find((d) => d.key === "supervision");
  const supFormId = supDef?.form_id ?? null;
  const appraisalDef = definitions.find((d) => d.key === "appraisal");
  const [supCompDates, appraisalCompDates] = await Promise.all([
    getSupervisionCompDates(id, supFormId, supDef?.id ?? null),
    getAppraisalCompDates(id, appraisalDef?.form_id ?? null, appraisalDef?.id ?? null),
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
  const aaSlot = appraisalSlot(appraisalCompDates, supCompDates, supInterval, supAmber);

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
          <h2 className="text-sm font-semibold text-white">Probation</h2>
          {probationStatusPill(tracker?.probation_status ?? null)}
        </div>
        {canManage && !supportMode ? (
          <Link href={`/people/${person.id}/tracker/probation_review/complete`} className="btn-primary text-xs">
            Complete
          </Link>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-white/10 px-3 py-2">
          <p className="text-[11px] text-white/50">End due</p>
          <p className="text-sm text-white/90">{formatDisplayDate(tracker?.probation_end_due ?? null) || "—"}</p>
        </div>
        <div className="rounded-lg border border-white/10 px-3 py-2">
          <p className="text-[11px] text-white/50">End actual</p>
          <p className="text-sm text-white/90">{formatDisplayDate(tracker?.probation_end_actual ?? null) || "—"}</p>
        </div>
        <div className="rounded-lg border border-white/10 px-3 py-2">
          <p className="text-[11px] text-white/50">Extension</p>
          <p className="text-sm text-white/90">{formatDisplayDate(tracker?.probation_extension_date ?? null) || "—"}</p>
        </div>
      </div>
    </div>
  );
  const probationTile = (
    <div className="glass-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Probation</h2>
        {canManage && !supportMode ? (
          <Link href={`/people/${person.id}/tracker/probation_review/complete`} className="btn-primary text-xs">
            Complete
          </Link>
        ) : null}
      </div>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between"><dt className="text-white/50">End due</dt><dd className="text-white/85">{formatDisplayDate(tracker?.probation_end_due ?? null) || "—"}</dd></div>
        <div className="flex justify-between"><dt className="text-white/50">End actual</dt><dd className="text-white/85">{formatDisplayDate(tracker?.probation_end_actual ?? null) || "—"}</dd></div>
        <div className="flex justify-between"><dt className="text-white/50">Extension</dt><dd className="text-white/85">{formatDisplayDate(tracker?.probation_extension_date ?? null) || "—"}</dd></div>
      </dl>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-white/50">Status</span>
        {probationStatusPill(tracker?.probation_status ?? null)}
      </div>
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
    // The appraisal's dates come from the cycle, not the stored instance.
    const derived = def.key === "appraisal" && cycleMode === "appraisal";
    const nextDue = derived ? aaSlot.nextDue : st?.due_date ?? null;
    const lastComp = derived ? aaSlot.comp : st?.last_completed_on ?? null;
    const rag = derived ? aaSlot.nextDueRag : st?.rag ?? "none";
    return (
      <div key={def.id} className="glass-card p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">{def.name}</h3>
            <p className="text-[11px] text-white/45">{recurrenceLabel(def)}</p>
          </div>
          {st ? ragPill(rag) : <span className="pill-neutral">Not applied</span>}
        </div>
        <dl className="mt-3 space-y-1 text-xs text-white/60">
          <div className="flex justify-between"><dt>Next due</dt><dd className="text-white/85">{nextDue ? formatDisplayDate(nextDue) : "—"}</dd></div>
          <div className="flex justify-between"><dt>Last completed</dt><dd className="text-white/85">{lastComp ? formatDisplayDate(lastComp) : "Never"}</dd></div>
        </dl>
        {st && def.form_id && canComplete ? (
          <Link href={`/people/${person.id}/checks/${st.instance_id}/complete`} className="btn-primary btn-tile text-xs">Complete</Link>
        ) : null}
      </div>
    );
  };

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

      {isLeaver ? (
        <div className="glass-card p-6 text-sm text-white/60">
          This person is a leaver, so their checks are excluded from the active
          register and reminders. Their evidence history is kept below.
        </div>
      ) : (
        <>
          {/* Supervision, and beside it the appraisal that closes the cycle. Four columns so
              the appraisal tile is exactly the width of one supervision slot; on a narrow
              screen it drops underneath rather than squeezing four into a phone. */}
          <div className={appraisalTileDef ? "grid items-start gap-4 lg:grid-cols-4" : ""}>
          <section className={`space-y-3 ${appraisalTileDef ? "lg:col-span-3" : ""}`}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Supervision</h2>
            <div className={`glass-card grid gap-3 p-4 ${supCount === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
              {slots.map((s) => (
                <div key={s.n} className="flex flex-col rounded-xl border border-white/10 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white/70">{s.n}</span>
                    <span className={`rag-cell ${slotPill(s.rag)}`}>
                      {s.comp ? "Done" : s.due ? formatDisplayDate(s.due) : "—"}
                    </span>
                  </div>
                  <dl className="mt-2 space-y-1 text-[11px] text-white/55">
                    <div className="flex justify-between"><dt>Due</dt><dd className="text-white/80">{formatDisplayDate(s.due) || "—"}</dd></div>
                    <div className="flex justify-between"><dt>Completed</dt><dd className="text-white/80">{formatDisplayDate(s.comp) || "Not yet"}</dd></div>
                  </dl>
                  {supStatus && supFormId && canComplete && s.n === dueSupN ? (
                    <Link
                      href={`/people/${person.id}/checks/${supStatus.instance_id}/complete?sup=${s.n}`}
                      className="btn-primary btn-tile text-xs"
                    >
                      Complete
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-white/40">
              Supervision 1 is due {supInterval} days after successful probation end, then
              {" "}{supInterval} days after {supCount === 4 ? `every ${supCount} supervisions (which restarts the cycle)` : "each Annual Appraisal (which restarts the cycle)"}.
              {" "}Each further supervision is due {supInterval} days after the previous one is completed.
            </p>
          </section>
          {appraisalTileDef ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
                Annual Appraisal
              </h2>
              {checkTile(appraisalTileDef)}
              <p className="text-[11px] text-white/40">
                Due {supInterval} days after Supervision 3. Completing it starts the next three.
              </p>
            </section>
          ) : null}
          </div>

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
            {/* ALL THE CHECKS ON ONE LINE (Phil, 2026-09-08: "narrow the tiles and put them
                all on one line keep height the same only change width"). Fixed column counts
                cannot do that: the number of checks varies by company and by job title, so
                any number picked is wrong for somebody. auto-fit with a 230px floor fits as
                many as the screen allows and shares the rest out - six checks on a wide
                monitor land in one row, and a narrow screen wraps rather than shrinking them
                to nothing. Only the width changes; the tile's own content sets its height. */}
            <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(230px,1fr))]">
              {otherDefs.map((def) => checkTile(def))}
            </div>
          </section>

          {/* Trackers: DBS, Right to Work, and Probation (only once passed; before
              that it sits above the Checks). Dates are fed by completing a form. */}
          <section className={`grid gap-3 ${probationPassed ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
            {/* DBS */}
            <div className="glass-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">DBS</h2>
                {canManage && !supportMode ? (
                  <Link href={`/people/${person.id}/tracker/dbs_renewal/complete`} className="btn-primary text-xs">
                    Complete
                  </Link>
                ) : null}
              </div>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-white/50">DBS</dt><dd className="text-white/85">{formatDisplayDate(tracker?.dbs_date ?? null) || "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-white/50">Enhanced DBS</dt><dd className="text-white/85">{formatDisplayDate(tracker?.enhanced_dbs_date ?? null) || "—"}</dd></div>
              </dl>
            </div>

            {/* Right to Work */}
            <div className="glass-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Right to Work</h2>
                {canManage && !supportMode ? (
                  <Link href={`/people/${person.id}/tracker/right_to_work/complete`} className="btn-primary text-xs">
                    Complete
                  </Link>
                ) : null}
              </div>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-white/50">Expiry</dt><dd className="text-white/85">{formatDisplayDate(tracker?.rtw_expiry_date ?? null) || "—"}</dd></div>
              </dl>
              {canManage ? (
                <div className="mt-3">
                  {/* Default gold save button: an outline base on a SAVE broke the
                      standing save-button rule (17 Aug QA). */}
                  <ActionForm
                    action={updateTracker}
                    hidden={{ person_id: person.id }}
                    inline
                  >
                    <label htmlFor="rtw_limits" className="form-label">Limits</label>
                    <select id="rtw_limits" name="rtw_limits" defaultValue={tracker?.rtw_limits ?? ""}>
                      <option value="">Not set</option>
                      {(Object.keys(RTW_LIMIT_LABELS) as RtwLimit[]).map((k) => (
                        <option key={k} value={k}>{RTW_LIMIT_LABELS[k]}</option>
                      ))}
                    </select>
                  </ActionForm>
                </div>
              ) : (
                <div className="mt-2 flex justify-between text-sm"><span className="text-white/50">Limits</span><span className="text-white/85">{tracker?.rtw_limits ? RTW_LIMIT_LABELS[tracker.rtw_limits] : "—"}</span></div>
              )}
            </div>

            {/* Probation joins this row only once passed; otherwise it renders above. */}
            {probationPassed ? probationTile : null}
          </section>
        </>
      )}

      {/* THE PERSON'S OWN ADMIN, IN ONE ROW: their login, their holiday, their absence
          (Phil, 2026-09-08: "holiday and absence can go next to Team meber login"). All three
          are about the employee rather than their compliance, they are read far more often
          than they are acted on, and each was taking a row of its own. The login tile is
          managers only, so auto-fit rather than a fixed three: a Supervisor sees two and they
          share the row between them instead of leaving a gap where the login would have been.
          The Briefings tile that used to sit here went with its query. */}
      <section className="grid items-start gap-4 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
      {canManage ? (
          <div className="glass-card p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white">
              Team Member login
            </h2>
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
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="pill-amber">Invited</span>
                  {login.invited_at ? (
                    <span className="text-sm text-white/60">
                      Sent {formatDisplayDate(String(login.invited_at).slice(0, 10))}, not
                      opened yet.
                    </span>
                  ) : null}
                </div>
                <ActionForm
                  action={invitePersonLogin}
                  hidden={{ person_id: id }}
                  label="Send it again"
                  savedLabel="Sent"
                  buttonClassName="btn-outline px-3 py-2 text-xs"
                  className=""
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="pill-neutral">No login</span>
                  <span className="text-sm text-white/60">
                    They cannot see their holidays or anything assigned to them.
                  </span>
                </div>
                <ActionForm
                  action={invitePersonLogin}
                  hidden={{ person_id: id }}
                  label="Invite them"
                  savedLabel="Invited"
                  className=""
                />
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
      <details className="glass-card section-card">
        <summary>Evidence history{evidence.length ? ` (${evidence.length})` : ""}</summary>
        {evidence.length === 0 ? (
          <div className="border-t border-white/10 p-5 text-sm text-white/60">
            No evidence yet. Completing a check stores its form here as immutable inspection evidence.
          </div>
        ) : (
          <div className="divide-y divide-white/5 border-t border-white/10">
            {evidence.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="w-24 shrink-0 text-white/85">{formatDisplayDate(e.submitted_at.slice(0, 10))}</span>
                  <span className="text-white/85">{e.form_name ?? "Evidence"}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="w-40 text-right text-white/50">{e.author_name ?? "Unknown"}</span>
                  <a href={`/evidence/${e.id}`} className="btn-outline px-2.5 py-1 text-[11px]">
                    View
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </details>

      {/* History timeline (Admins only). Oldest at top, newest at bottom. */}
      {canViewHistory ? (
        <RecordHistory recordType="person" recordId={person.id} entries={auditTrail} entitled={exportsEnabled} />
      ) : null}

      {/* Management */}
      {canManage ? (
        <details className="glass-card section-card">
          <summary>Manage record</summary>
          <div className="space-y-6 border-t border-white/10 p-5">
            <EditPersonForm person={person} users={users} />

            {/* TRANSFER ALONE. The Supervisors picker that used to sit beside it wrote to
                person_assignments, a table migration 0078 abandoned: a Supervisor sees
                their BRANCH, not an assigned caseload, and no policy, function or query
                has read that table since. It was a control that looked like it decided who
                could see a carer and decided nothing (Phil, 2026-09-08: "i dont think we
                need Supervisor caseload"). */}
            <div className="grid gap-5 sm:grid-cols-2">
              <ActionForm action={transferPerson} hidden={{ person_id: person.id }} label="Transfer" buttonClassName="btn-outline text-xs">
                <label htmlFor="transfer_branch" className="form-label">Transfer to branch</label>
                <select id="transfer_branch" name="branch_id" defaultValue={person.branch_id}>
                  {branchOptions.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                </select>
              </ActionForm>

            </div>

            <div className="flex flex-wrap items-end gap-3 border-t border-white/10 pt-4">
              <ActionForm action={setEmploymentStatus} hidden={{ person_id: person.id }} inline label="Save status">
                <label htmlFor="working_status" className="form-label">Working status</label>
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
        </details>
      ) : null}
      </section>
    </div>
  );
}
