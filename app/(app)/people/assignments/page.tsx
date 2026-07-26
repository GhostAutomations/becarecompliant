import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import ActionForm from "@/components/action-form";
import RealtimeRefresh from "@/components/realtime-refresh";
import AssignPanel from "@/components/assignments/assign-panel";
import { cancelAssignment } from "@/lib/assignments/actions";
import {
  listAssignments,
  listAssignableForms,
  listPolicies,
} from "@/lib/assignments/data";
import { listLinkablePeople } from "@/lib/public-forms/data";

/**
 * People > Assignments. What the team has been given to do, and the place to
 * give them more. Managers and above only: a Team Member sees their own list in
 * their own area instead.
 */

export const metadata: Metadata = { title: "Assignments" };

const MANAGER_PLUS = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "platform_admin",
];

function fmtDate(iso: string | null): string {
  if (!iso) return "No date";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
}

export default async function AssignmentsPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/people");
  if (profile.role === "staff") redirect("/my");
  if (!MANAGER_PLUS.includes(profile.role)) redirect("/people");

  const [assignments, forms, policies, people] = await Promise.all([
    listAssignments(profile.company_id),
    listAssignableForms(profile.company_id),
    listPolicies(profile.company_id),
    listLinkablePeople(profile.company_id),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const open = assignments.filter((a) => a.status === "assigned");
  const done = assignments.filter((a) => a.status === "completed");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <RealtimeRefresh tables={["assignments"]} channel="assignments" />
      <BackLink href="/people" label="Back to People" />
      <div>
        <h1 className="page-title">Assignments</h1>
        <p className="page-subtitle">
          Forms and policies your team has been asked to complete. They see these when they
          log in, and completing one files the Evidence against their record.
        </p>
      </div>

      <AssignPanel forms={forms} policies={policies} people={people} />

      {policies.length === 0 && (
        <p className="text-xs text-amber-300">
          You have no policies uploaded yet. Add them in Settings, Policies to assign them
          for reading.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          Outstanding ({open.length})
        </h2>
        {open.length === 0 ? (
          <div className="glass-card p-5 text-sm text-white/60">Nothing outstanding.</div>
        ) : (
          <div className="glass-card divide-y divide-white/10">
            {open.map((a) => {
              const overdue = a.due_date != null && a.due_date < today;
              return (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{a.title}</p>
                    <p className="text-xs text-white/50">
                      {a.person_name ?? "Someone"} ·{" "}
                      {a.kind === "policy" ? "To read and confirm" : "Form to complete"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={overdue ? "pill pill-red" : "pill pill-neutral"}>
                      {a.due_date ? `Due ${fmtDate(a.due_date)}` : "No date"}
                    </span>
                    <ActionForm
                      action={cancelAssignment}
                      hidden={{ assignment_id: a.id }}
                      label="Cancel"
                      savedLabel="Cancelled"
                      buttonClassName="btn-ghost px-3 py-2 text-xs"
                      className=""
                      confirm="Cancel this assignment? It disappears from their list."
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          Completed ({done.length})
        </h2>
        {done.length === 0 ? (
          <div className="glass-card p-5 text-sm text-white/60">Nothing completed yet.</div>
        ) : (
          <div className="glass-card divide-y divide-white/10">
            {done.slice(0, 50).map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{a.title}</p>
                  <p className="text-xs text-white/50">
                    {a.person_name ?? "Someone"}
                    {a.completed_at
                      ? ` · ${new Date(a.completed_at).toLocaleDateString("en-GB", { timeZone: "Europe/London" })}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="pill pill-green">Done</span>
                  {a.evidence_id ? (
                    <Link href={`/evidence/${a.evidence_id}`} className="btn-outline px-3 py-2 text-xs">
                      Evidence
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
