import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import BackLink from "@/components/back-link";
import EditServiceUserForm from "@/components/service-users/edit-service-user-form";
import PlannedReviewCell from "@/components/service-users/planned-review-cell";
import {
  getServiceUser,
  getServiceUserChecks,
  getServiceUserTracker,
  listBranches,
  listSupervisoryUsers,
  listServiceUserCheckDefinitions,
  listServiceUserAssignments,
  listServiceUserEvidence,
} from "@/lib/service-users/data";
import {
  assignServiceUserSupervisor,
  unassignServiceUserSupervisor,
  applyMissingChecks,
  setServiceStatus,
  transferServiceUser,
} from "@/lib/service-users/actions";
import { formatDisplayDate, recurrenceLabel, reviewStatus } from "@/lib/service-users/logic";
import {
  type SuCheckStatus,
  type ServiceStatus,
  SERVICE_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
} from "@/lib/service-users/types";

export const metadata: Metadata = { title: "Service User" };

const MANAGE_ROLES = ["company_admin", "manager", "platform_admin"];
const COMPLETE_ROLES = ["company_admin", "manager", "supervisor", "platform_admin"];
const RAG_RANK: Record<string, number> = { red: 0, amber: 1, green: 2, none: 3 };

function ragPill(rag: string) {
  if (rag === "red") return <span className="pill-red"><span className="pill-dot" /> Overdue</span>;
  if (rag === "amber") return <span className="pill-amber"><span className="pill-dot" /> Due soon</span>;
  if (rag === "green") return <span className="pill-green"><span className="pill-dot" /> Compliant</span>;
  return <span className="pill-neutral">Not scheduled</span>;
}

export default async function ServiceUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ completed?: string; from?: string }>;
}) {
  const { user, profile } = await requireCompany();
  const { id } = await params;
  const { completed, from } = await searchParams;
  const backHref = from && from.startsWith("/service-users") ? from : "/service-users";

  const serviceUser = await getServiceUser(id);
  if (!serviceUser || !profile.company_id) redirect("/service-users");
  const companyId = profile.company_id;
  const canManage = MANAGE_ROLES.includes(profile.role);
  const canComplete = COMPLETE_ROLES.includes(profile.role);

  // GDPR (special-category data): audit the READ of a Service User record, not just
  // writes. Best-effort; never blocks the page.
  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.viewed",
    entityType: "service_user",
    entityId: id,
    summary: `Viewed ${serviceUser.full_name}`,
  });

  const [statuses, definitions, evidence, users, assignments, branches, tracker] = await Promise.all([
    getServiceUserChecks(id),
    listServiceUserCheckDefinitions(companyId),
    listServiceUserEvidence(id),
    canManage ? listSupervisoryUsers(companyId) : Promise.resolve([]),
    canManage ? listServiceUserAssignments(id) : Promise.resolve([]),
    canManage ? listBranches(companyId) : Promise.resolve([]),
    getServiceUserTracker(id),
  ]);

  const statusByDef = new Map<string, SuCheckStatus>(statuses.map((s) => [s.definition_id, s]));
  const reviewDef = definitions.find((d) => d.key === "care_plan_review");
  const reviewStatusCheck = statuses.find((s) => s.check_key === "care_plan_review") ?? null;
  const otherDefs = definitions.filter((d) => d.key !== "care_plan_review");

  const newReviewDue = reviewStatusCheck?.due_date ?? null;
  const plannedDate = tracker?.planned_review_date ?? null;
  const rs = reviewStatus(newReviewDue, plannedDate);

  const worstRag =
    statuses.length === 0
      ? "none"
      : statuses.reduce((worst, s) => (RAG_RANK[s.rag] < RAG_RANK[worst] ? s.rag : worst), "green" as string);
  const missingCount = definitions.filter((d) => !statusByDef.has(d.id)).length;
  const branchOptions = branches.filter((b) => b.kind === "branch" || b.kind === "team");
  const isCancelled = serviceUser.service_status === "cancelled";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <BackLink href={backHref} label="Back to Service Users" />
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="page-title">{serviceUser.full_name}</h1>
          {ragPill(worstRag)}
          {serviceUser.service_status !== "active" ? (
            <span className="pill-neutral">{SERVICE_STATUS_LABELS[serviceUser.service_status]}</span>
          ) : null}
          {serviceUser.archived_at ? <span className="pill-neutral">Archived</span> : null}
        </div>
        <p className="page-subtitle mt-1">
          {[serviceUser.ssid ? `SSID ${serviceUser.ssid}` : null, serviceUser.branch_name]
            .filter(Boolean)
            .join(" · ") || "Service user record"}
        </p>
      </div>

      {completed ? (
        <div className="glass-card border border-rag-green/20 p-4 text-sm text-rag-green-soft">
          {completed} completed. Evidence stored and the next due date scheduled.
        </div>
      ) : null}

      {isCancelled ? (
        <div className="glass-card p-6 text-sm text-white/60">
          This service user is cancelled, so their checks are excluded from the active
          register and reminders. Their evidence history is kept below.
        </div>
      ) : (
        <>
          {/* Care Plan Review workflow */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Care Plan Review</h2>
            <div className="glass-card grid gap-4 p-5 sm:grid-cols-4">
              <div>
                <p className="text-[11px] text-white/45">Most recent review</p>
                <p className="text-sm text-white/85">{formatDisplayDate(reviewStatusCheck?.last_completed_on ?? null) || "None yet"}</p>
              </div>
              <div>
                <p className="text-[11px] text-white/45">New review due</p>
                <p className="text-sm text-white/85">{formatDisplayDate(newReviewDue) || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] text-white/45">Planned review date</p>
                <div className="text-sm text-white/85">
                  <PlannedReviewCell
                    serviceUserId={serviceUser.id}
                    plannedDate={plannedDate}
                    reviewerId={tracker?.planned_reviewer_id ?? null}
                    reviewerName={tracker?.planned_reviewer_name ?? null}
                    reviewers={users}
                    editable={canManage}
                  />
                </div>
              </div>
              <div>
                <p className="text-[11px] text-white/45">Review status</p>
                <p className="mt-1">
                  <span className={rs === "overdue" ? "pill-red" : rs === "booked" ? "pill-green" : "pill-neutral"}>
                    {REVIEW_STATUS_LABELS[rs]}
                  </span>
                </p>
              </div>
            </div>
            {reviewStatusCheck && reviewDef?.form_id && canComplete ? (
              <Link
                href={`/service-users/${serviceUser.id}/checks/${reviewStatusCheck.instance_id}/complete`}
                className="btn-primary inline-flex text-xs"
              >
                Complete a review
              </Link>
            ) : null}
          </section>

          {/* Other recurring checks: risk assessment, MAR audit, consent review */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Checks</h2>
              {canManage && missingCount > 0 ? (
                <form action={applyMissingChecks}>
                  <input type="hidden" name="service_user_id" value={serviceUser.id} />
                  <button type="submit" className="btn-outline text-xs">Apply {missingCount} missing</button>
                </form>
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
                      <Link href={`/service-users/${serviceUser.id}/checks/${s.instance_id}/complete`} className="btn-primary mt-3 w-full justify-center text-xs">Complete</Link>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

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
              <div key={e.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-white/85">{formatDisplayDate(e.submitted_at.slice(0, 10))}</span>
                <span className="text-white/50">{e.author_name ?? "Unknown"}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Management */}
      {canManage ? (
        <details className="glass-card section-card">
          <summary>Manage record</summary>
          <div className="space-y-6 border-t border-white/10 p-5">
            <EditServiceUserForm serviceUser={serviceUser} />

            <div className="grid gap-5 sm:grid-cols-2">
              <form action={transferServiceUser} className="space-y-2">
                <input type="hidden" name="service_user_id" value={serviceUser.id} />
                <label htmlFor="transfer_branch" className="form-label">Transfer to branch</label>
                <select id="transfer_branch" name="branch_id" defaultValue={serviceUser.branch_id}>
                  {branchOptions.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                </select>
                <button type="submit" className="btn-outline text-xs">Transfer</button>
              </form>

              <div className="space-y-2">
                <span className="form-label">Caseload</span>
                <div className="flex flex-col gap-1">
                  {assignments.length === 0 ? (
                    <span className="text-xs text-white/50">No one assigned.</span>
                  ) : (
                    assignments.map((a) => (
                      <form key={a.id} action={unassignServiceUserSupervisor} className="flex items-center justify-between gap-2">
                        <input type="hidden" name="service_user_id" value={serviceUser.id} />
                        <input type="hidden" name="user_id" value={a.id} />
                        <span className="text-xs text-white/80">{a.full_name || a.email}</span>
                        <button type="submit" className="btn-ghost text-[11px]">Remove</button>
                      </form>
                    ))
                  )}
                </div>
                <form action={assignServiceUserSupervisor} className="flex items-end gap-2">
                  <input type="hidden" name="service_user_id" value={serviceUser.id} />
                  <select name="user_id" defaultValue="" aria-label="Assign a user">
                    <option value="" disabled>Assign a user</option>
                    {users.map((u) => (<option key={u.id} value={u.id}>{u.full_name || u.email}</option>))}
                  </select>
                  <button type="submit" className="btn-outline text-xs">Assign</button>
                </form>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3 border-t border-white/10 pt-4">
              <form action={setServiceStatus} className="flex items-end gap-2">
                <input type="hidden" name="service_user_id" value={serviceUser.id} />
                <div>
                  <label htmlFor="service_status" className="form-label">Service status</label>
                  <select id="service_status" name="status" defaultValue={serviceUser.service_status}>
                    {(Object.keys(SERVICE_STATUS_LABELS) as ServiceStatus[]).map((k) => (
                      <option key={k} value={k}>{SERVICE_STATUS_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn-outline text-xs">Save status</button>
              </form>
              {/* Archive is only offered once a Service User is Cancelled. */}
              {serviceUser.archived_at || serviceUser.service_status === "cancelled" ? (
                <form action={setServiceStatus}>
                  <input type="hidden" name="service_user_id" value={serviceUser.id} />
                  <input type="hidden" name="status" value={serviceUser.archived_at ? "cancelled" : "archive"} />
                  <button type="submit" className="btn-ghost text-xs">{serviceUser.archived_at ? "Restore" : "Archive"}</button>
                </form>
              ) : null}
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
}
