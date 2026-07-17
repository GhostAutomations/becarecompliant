import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import ActionForm from "@/components/action-form";
import RecordHistory from "@/components/reports/record-history";
import EditPersonForm from "@/components/people/edit-person-form";
import { featureEnabled } from "@/lib/billing/tier";
import { getRecordAuditTrail } from "@/lib/audit-log/data";
import {
  getPerson,
  getPersonChecks,
  getPersonTracker,
  getSupervisionComps,
  listBranches,
  listSupervisoryUsers,
  listPeopleCheckDefinitions,
  listPersonAssignments,
  listPersonEvidence,
} from "@/lib/people/data";
import { listPersonHolidays } from "@/lib/holidays/data";
import { listPersonAbsences, listPersonMeetings } from "@/lib/absence/data";
import {
  applyMissingChecks,
  assignSupervisor,
  setArchived,
  setEmploymentStatus,
  transferPerson,
  unassignSupervisor,
  updateTracker,
} from "@/lib/people/actions";
import { formatDisplayDate, recurrenceLabel, supervisionSlots } from "@/lib/people/logic";
import {
  type CheckStatus,
  RTW_LIMIT_LABELS,
  PROBATION_STATUS_LABELS,
  WORKING_STATUS_LABELS,
  type RtwLimit,
  type ProbationStatus,
  type EmploymentStatus,
} from "@/lib/people/types";

export const metadata: Metadata = { title: "Record" };

const MANAGE_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager", "platform_admin"];
const COMPLETE_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager", "supervisor", "platform_admin"];
const RAG_RANK: Record<string, number> = { red: 0, amber: 1, green: 2, none: 3 };

function ragPill(rag: string) {
  if (rag === "red") return <span className="pill-red"><span className="pill-dot" /> Overdue</span>;
  if (rag === "amber") return <span className="pill-amber"><span className="pill-dot" /> Due soon</span>;
  if (rag === "green") return <span className="pill-green"><span className="pill-dot" /> Compliant</span>;
  return <span className="pill-neutral">Not scheduled</span>;
}

function slotPill(rag: string) {
  const cls =
    rag === "red" ? "rag-cell-red" : rag === "amber" ? "rag-cell-amber" : rag === "green" ? "rag-cell-green" : "rag-cell-none";
  return cls;
}

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ completed?: string; from?: string }>;
}) {
  const { profile } = await requireCompany();
  const { id } = await params;
  const { completed, from } = await searchParams;
  // Back returns to the view the record was opened from (Main, Leavers, Archive, ...);
  // only accept in-app /people paths to avoid an open redirect.
  const backHref = from && from.startsWith("/people") ? from : "/people";

  const person = await getPerson(id);
  if (!person || !profile.company_id) redirect("/people");
  const companyId = profile.company_id;
  const canManage = MANAGE_ROLES.includes(profile.role);
  const canComplete = COMPLETE_ROLES.includes(profile.role);
  // The audit History timeline is Admins only (Founder + Company Admin).
  const canViewHistory = profile.role === "platform_admin" || profile.role === "company_admin";

  const [
    statuses,
    definitions,
    evidence,
    users,
    assignments,
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
    canManage ? listPersonAssignments(id) : Promise.resolve([]),
    canManage ? listBranches(companyId) : Promise.resolve([]),
    getPersonTracker(id),
    listPersonHolidays(id),
    listPersonAbsences(id),
    listPersonMeetings(id),
  ]);

  // The history timeline uses the record_audit_trail RPC (guarded by
  // can_manage_person), so only fetch it for managers/admins. Exports are Pro+.
  const [auditTrail, exportsEnabled] = await Promise.all([
    canManage ? getRecordAuditTrail("person", id) : Promise.resolve([]),
    featureEnabled(companyId, "reporting_exports"),
  ]);

  const supDef = definitions.find((d) => d.key === "supervision");
  const supFormId = supDef?.form_id ?? null;
  const supComps = await getSupervisionComps(id, supFormId);
  const supInterval = supDef?.interval ?? 90;
  const supAmber = supDef?.amber_days ?? 30;
  // Sup 1 due anchors on the later of the last Annual Appraisal completion and the
  // successful probation end; only an appraisal restarts the cycle (see supervisionSlots).
  const appraisalCompletedOn = statuses.find((s) => s.check_key === "appraisal")?.last_completed_on ?? null;
  const slots = supervisionSlots(
    supInterval,
    supComps,
    supAmber,
    appraisalCompletedOn,
    tracker?.probation_end_actual ?? null,
  );

  const statusByDef = new Map<string, CheckStatus>(statuses.map((s) => [s.definition_id, s]));
  const supStatus = statuses.find((s) => s.check_key === "supervision") ?? null;
  const otherDefs = definitions.filter((d) => d.key !== "supervision");

  const worstRag =
    statuses.length === 0
      ? "none"
      : statuses.reduce((worst, s) => (RAG_RANK[s.rag] < RAG_RANK[worst] ? s.rag : worst), "green" as string);
  const missingCount = definitions.filter((d) => !statusByDef.has(d.id)).length;
  const branchOptions = branches.filter((b) => b.kind === "branch" || b.kind === "team");
  const isLeaver = person.employment_status === "leaver";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <BackLink href={backHref} label="Back to People" />
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="page-title">{person.full_name}</h1>
          {ragPill(worstRag)}
          {person.employment_status !== "active" ? (
            <span className="pill-neutral">{WORKING_STATUS_LABELS[person.employment_status]}</span>
          ) : null}
          {person.archived_at ? <span className="pill-neutral">Archived</span> : null}
        </div>
        <p className="page-subtitle mt-1">
          {[person.job_title, person.branch_name, person.team].filter(Boolean).join(" · ") || "Staff record"}
        </p>
      </div>

      {completed ? (
        <div className="glass-card border border-rag-green/20 p-4 text-sm text-rag-green-soft">
          {completed} completed. Evidence stored and the next due date scheduled.
        </div>
      ) : null}

      {isLeaver ? (
        <div className="glass-card p-6 text-sm text-white/60">
          This person is a leaver, so their checks are excluded from the active
          register and reminders. Their evidence history is kept below.
        </div>
      ) : (
        <>
          {/* Supervision (Sup 1/2/3) */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Supervision</h2>
            <div className="glass-card grid gap-3 p-4 sm:grid-cols-3">
              {slots.map((s) => (
                <div key={s.n} className="flex flex-col rounded-xl border border-white/10 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white/70">Sup {s.n}</span>
                    <span className={`rag-cell ${slotPill(s.rag)}`}>
                      {s.comp ? "Done" : s.due ? formatDisplayDate(s.due) : "—"}
                    </span>
                  </div>
                  <dl className="mt-2 space-y-1 text-[11px] text-white/55">
                    <div className="flex justify-between"><dt>Due</dt><dd className="text-white/80">{formatDisplayDate(s.due) || "—"}</dd></div>
                    <div className="flex justify-between"><dt>Completed</dt><dd className="text-white/80">{formatDisplayDate(s.comp) || "Not yet"}</dd></div>
                  </dl>
                  {supStatus && supFormId && canComplete ? (
                    <Link
                      href={`/people/${person.id}/checks/${supStatus.instance_id}/complete?sup=${s.n}`}
                      className="btn-primary mt-3 w-full justify-center text-xs"
                    >
                      Complete
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-white/40">
              Supervision 1 is due {supInterval} days after successful probation end, then
              {" "}{supInterval} days after each Annual Appraisal (which restarts the cycle).
              {" "}Each further supervision is due {supInterval} days after the previous one is completed.
            </p>
          </section>

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
            <div className="grid gap-3 sm:grid-cols-2">
              {otherDefs.map((def) => {
                const s = statusByDef.get(def.id);
                return (
                  <div key={def.id} className="glass-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-white">{def.name}</h3>
                        <p className="text-[11px] text-white/45">{recurrenceLabel(def)}</p>
                      </div>
                      {s ? ragPill(s.rag) : <span className="pill-neutral">Not applied</span>}
                    </div>
                    <dl className="mt-3 space-y-1 text-xs text-white/60">
                      <div className="flex justify-between"><dt>Next due</dt><dd className="text-white/85">{s?.due_date ? formatDisplayDate(s.due_date) : "—"}</dd></div>
                      <div className="flex justify-between"><dt>Last completed</dt><dd className="text-white/85">{s?.last_completed_on ? formatDisplayDate(s.last_completed_on) : "Never"}</dd></div>
                    </dl>
                    {s && def.form_id && canComplete ? (
                      <Link href={`/people/${person.id}/checks/${s.instance_id}/complete`} className="btn-primary mt-3 w-full justify-center text-xs">Complete</Link>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Trackers: DBS, Right to Work, Probation. Dates are fed by completing a
              form (Record button); statuses/limits are quick-edit dropdowns. */}
          <section className="grid gap-3 lg:grid-cols-3">
            {/* DBS */}
            <div className="glass-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">DBS</h2>
                {canManage ? (
                  <Link href={`/people/${person.id}/tracker/dbs_renewal/complete`} className="btn-outline text-xs">
                    Record
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
                {canManage ? (
                  <Link href={`/people/${person.id}/tracker/right_to_work/complete`} className="btn-outline text-xs">
                    Record
                  </Link>
                ) : null}
              </div>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-white/50">Expiry</dt><dd className="text-white/85">{formatDisplayDate(tracker?.rtw_expiry_date ?? null) || "—"}</dd></div>
              </dl>
              {canManage ? (
                <div className="mt-3">
                  <ActionForm
                    action={updateTracker}
                    hidden={{ person_id: person.id }}
                    inline
                    buttonClassName="btn-outline text-xs"
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

            {/* Probation */}
            <div className="glass-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Probation</h2>
                {canManage ? (
                  <Link href={`/people/${person.id}/tracker/probation_review/complete`} className="btn-outline text-xs">
                    Record
                  </Link>
                ) : null}
              </div>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-white/50">End due</dt><dd className="text-white/85">{formatDisplayDate(tracker?.probation_end_due ?? null) || "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-white/50">End actual</dt><dd className="text-white/85">{formatDisplayDate(tracker?.probation_end_actual ?? null) || "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-white/50">Extension</dt><dd className="text-white/85">{formatDisplayDate(tracker?.probation_extension_date ?? null) || "—"}</dd></div>
              </dl>
              {canManage ? (
                <div className="mt-3">
                  <ActionForm
                    action={updateTracker}
                    hidden={{ person_id: person.id }}
                    inline
                    buttonClassName="btn-outline text-xs"
                  >
                    <label htmlFor="probation_status" className="form-label">Status</label>
                    <select id="probation_status" name="probation_status" defaultValue={tracker?.probation_status ?? ""}>
                      <option value="">Not set</option>
                      {(Object.keys(PROBATION_STATUS_LABELS) as ProbationStatus[]).map((k) => (
                        <option key={k} value={k}>{PROBATION_STATUS_LABELS[k]}</option>
                      ))}
                    </select>
                  </ActionForm>
                </div>
              ) : (
                <div className="mt-2 flex justify-between text-sm"><span className="text-white/50">Status</span><span className="text-white/85">{tracker?.probation_status ? PROBATION_STATUS_LABELS[tracker.probation_status] : "—"}</span></div>
              )}
            </div>
          </section>
        </>
      )}

      {/* Holiday & Absence history */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="glass-card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/60">Holiday</h2>
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
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/60">Absence</h2>
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

      {/* Evidence history */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Evidence history</h2>
        {evidence.length === 0 ? (
          <div className="glass-card p-6 text-sm text-white/60">
            No evidence yet. Completing a check stores its form here as immutable inspection evidence.
          </div>
        ) : (
          <div className="glass-card divide-y divide-white/5">
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
      </section>

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

            <div className="grid gap-5 sm:grid-cols-2">
              <ActionForm action={transferPerson} hidden={{ person_id: person.id }} label="Transfer" buttonClassName="btn-outline text-xs">
                <label htmlFor="transfer_branch" className="form-label">Transfer to branch</label>
                <select id="transfer_branch" name="branch_id" defaultValue={person.branch_id}>
                  {branchOptions.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                </select>
              </ActionForm>

              <div className="space-y-2">
                <span className="form-label">Supervisor caseload</span>
                <div className="flex flex-col gap-1">
                  {assignments.length === 0 ? (
                    <span className="text-xs text-white/50">No one assigned.</span>
                  ) : (
                    assignments.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-white/80">{a.full_name || a.email}</span>
                        <ActionForm
                          action={unassignSupervisor}
                          hidden={{ person_id: person.id, user_id: a.id }}
                          label="Remove"
                          buttonClassName="btn-ghost text-[11px]"
                          className=""
                        />
                      </div>
                    ))
                  )}
                </div>
                <ActionForm action={assignSupervisor} hidden={{ person_id: person.id }} inline label="Assign" buttonClassName="btn-outline text-xs">
                  <select name="user_id" defaultValue="" aria-label="Assign a supervisor">
                    <option value="" disabled>Assign a user</option>
                    {users.map((u) => (<option key={u.id} value={u.id}>{u.full_name || u.email}</option>))}
                  </select>
                </ActionForm>
              </div>
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
          </div>
        </details>
      ) : null}
    </div>
  );
}
