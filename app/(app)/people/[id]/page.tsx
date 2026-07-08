import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import EditPersonForm from "@/components/people/edit-person-form";
import {
  getPerson,
  getPersonChecks,
  listBranches,
  listCompanyUsers,
  listPeopleCheckDefinitions,
  listPersonAssignments,
  listPersonEvidence,
} from "@/lib/people/data";
import {
  applyMissingChecks,
  assignSupervisor,
  setArchived,
  setEmploymentStatus,
  transferPerson,
  unassignSupervisor,
} from "@/lib/people/actions";
import { formatDisplayDate, recurrenceLabel } from "@/lib/people/logic";
import type { CheckStatus } from "@/lib/people/types";

export const metadata: Metadata = { title: "Record" };

const MANAGE_ROLES = ["company_admin", "manager", "platform_admin"];
const COMPLETE_ROLES = ["company_admin", "manager", "supervisor", "platform_admin"];
const RAG_RANK: Record<string, number> = { red: 0, amber: 1, green: 2, none: 3 };

function ragPill(rag: string) {
  if (rag === "red") return <span className="pill-red"><span className="pill-dot" /> Overdue</span>;
  if (rag === "amber") return <span className="pill-amber"><span className="pill-dot" /> Due soon</span>;
  if (rag === "green") return <span className="pill-green"><span className="pill-dot" /> Compliant</span>;
  return <span className="pill-neutral">Not scheduled</span>;
}

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ completed?: string }>;
}) {
  const { profile } = await requireCompany();
  const { id } = await params;
  const { completed } = await searchParams;

  const person = await getPerson(id);
  if (!person || !profile.company_id) redirect("/people");
  const companyId = profile.company_id;
  const canManage = MANAGE_ROLES.includes(profile.role);
  const canComplete = COMPLETE_ROLES.includes(profile.role);

  const [statuses, definitions, evidence, users, assignments, branches] = await Promise.all([
    getPersonChecks(id),
    listPeopleCheckDefinitions(companyId),
    listPersonEvidence(id),
    canManage ? listCompanyUsers(companyId) : Promise.resolve([]),
    canManage ? listPersonAssignments(id) : Promise.resolve([]),
    canManage ? listBranches(companyId) : Promise.resolve([]),
  ]);

  const statusByDef = new Map<string, CheckStatus>(statuses.map((s) => [s.definition_id, s]));
  const worstRag =
    statuses.length === 0
      ? "none"
      : statuses.reduce(
          (worst, s) => (RAG_RANK[s.rag] < RAG_RANK[worst] ? s.rag : worst),
          "green" as string,
        );
  const missingCount = definitions.filter((d) => !statusByDef.has(d.id)).length;
  const branchOptions = branches.filter((b) => b.kind === "branch" || b.kind === "team");
  const isLeaver = person.employment_status === "leaver";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/people" className="text-xs text-white/50 hover:text-white/80">
          People
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="page-title">{person.full_name}</h1>
          {ragPill(worstRag)}
          {isLeaver ? <span className="pill-neutral">Leaver</span> : null}
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

      {/* Checks */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Checks</h2>
          {canManage && missingCount > 0 ? (
            <form action={applyMissingChecks}>
              <input type="hidden" name="person_id" value={person.id} />
              <button type="submit" className="btn-outline text-xs">
                Apply {missingCount} missing {missingCount === 1 ? "check" : "checks"}
              </button>
            </form>
          ) : null}
        </div>

        {definitions.length === 0 ? (
          <div className="glass-card p-6 text-sm text-white/60">
            No checks are configured for this company yet.
          </div>
        ) : isLeaver ? (
          <div className="glass-card p-6 text-sm text-white/60">
            This person is a leaver, so their checks are excluded from the active
            register and reminders. Their evidence history is kept below.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {definitions.map((def) => {
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
                    <div className="flex justify-between">
                      <dt>Next due</dt>
                      <dd className="text-white/85">
                        {s?.due_date
                          ? formatDisplayDate(s.due_date)
                          : def.anchor === "expiry"
                            ? "On record"
                            : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Last completed</dt>
                      <dd className="text-white/85">
                        {s?.last_completed_on ? formatDisplayDate(s.last_completed_on) : "Never"}
                      </dd>
                    </div>
                  </dl>
                  {s && def.form_id && canComplete ? (
                    <Link
                      href={`/people/${person.id}/checks/${s.instance_id}/complete`}
                      className="btn-primary mt-3 w-full justify-center text-xs"
                    >
                      Complete
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Evidence history */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          Evidence history
        </h2>
        {evidence.length === 0 ? (
          <div className="glass-card p-6 text-sm text-white/60">
            No evidence yet. Completing a check stores its form here as immutable
            inspection evidence.
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
            <EditPersonForm person={person} users={users} />

            <div className="grid gap-5 sm:grid-cols-2">
              {/* Transfer */}
              <form action={transferPerson} className="space-y-2">
                <input type="hidden" name="person_id" value={person.id} />
                <label htmlFor="transfer_branch" className="form-label">Transfer to branch</label>
                <select id="transfer_branch" name="branch_id" defaultValue={person.branch_id}>
                  {branchOptions.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <button type="submit" className="btn-outline text-xs">Transfer</button>
              </form>

              {/* Caseload */}
              <div className="space-y-2">
                <span className="form-label">Supervisor caseload</span>
                <div className="flex flex-col gap-1">
                  {assignments.length === 0 ? (
                    <span className="text-xs text-white/50">No one assigned.</span>
                  ) : (
                    assignments.map((a) => (
                      <form key={a.id} action={unassignSupervisor} className="flex items-center justify-between gap-2">
                        <input type="hidden" name="person_id" value={person.id} />
                        <input type="hidden" name="user_id" value={a.id} />
                        <span className="text-xs text-white/80">{a.full_name || a.email}</span>
                        <button type="submit" className="btn-ghost text-[11px]">Remove</button>
                      </form>
                    ))
                  )}
                </div>
                <form action={assignSupervisor} className="flex items-end gap-2">
                  <input type="hidden" name="person_id" value={person.id} />
                  <select name="user_id" defaultValue="" aria-label="Assign a supervisor">
                    <option value="" disabled>Assign a user</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                    ))}
                  </select>
                  <button type="submit" className="btn-outline text-xs">Assign</button>
                </form>
              </div>
            </div>

            {/* Lifecycle */}
            <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
              <form action={setEmploymentStatus}>
                <input type="hidden" name="person_id" value={person.id} />
                <input type="hidden" name="status" value={isLeaver ? "active" : "leaver"} />
                <button type="submit" className="btn-outline text-xs">
                  {isLeaver ? "Reactivate" : "Mark as leaver"}
                </button>
              </form>
              <form action={setArchived}>
                <input type="hidden" name="person_id" value={person.id} />
                <input type="hidden" name="archive" value={person.archived_at ? "false" : "true"} />
                <button type="submit" className="btn-ghost text-xs">
                  {person.archived_at ? "Restore" : "Archive"}
                </button>
              </form>
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
}
