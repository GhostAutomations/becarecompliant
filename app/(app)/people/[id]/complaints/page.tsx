import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import BackLink from "@/components/back-link";
import { getPerson } from "@/lib/people/data";
import { listComplaintsForPerson } from "@/lib/complaints/data";
import { countForPerson, describeCounts } from "@/lib/complaints/person-complaints";
import { COMPLAINT_STATUS_LABELS } from "@/lib/complaints/types";
import { ukDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Complaints" };

/** The Complaints section's own roles, not the person record's. A supervisor may manage the
 *  record and still have no business reading complaints about the person. */
const COMPLAINT_ROLES = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "on_call",
  "platform_admin",
];

/**
 * Complaints naming ONE team member.
 *
 * Phil, 2026-09-15: "it should only show their complaints not all company complaints". The
 * list is built from the complaints that name this person and nothing else; there is no
 * filter on screen to widen it, because a screen that can be widened to everything is the
 * company register wearing a person's name.
 */
export default async function PersonComplaintsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requireCompany();
  const { id } = await params;
  if (!profile.company_id) redirect("/founder");
  if (!COMPLAINT_ROLES.includes(profile.role)) redirect(`/people/${id}`);
  if (!(await featureEnabled(profile.company_id, "complaints"))) redirect(`/people/${id}`);

  const person = await getPerson(id);
  if (!person) notFound();

  const complaints = await listComplaintsForPerson(id);
  const counts = countForPerson(complaints);

  return (
    <div className="page-shell space-y-6">
      <div>
        <BackLink href={`/people/${id}`} label={`Back to ${person.full_name}`} />
        <h1 className="page-title mt-1">Complaints</h1>
        <p className="page-subtitle">
          {person.full_name} · {describeCounts(counts)}
        </p>
      </div>

      {complaints.length === 0 ? (
        <div className="glass-card p-6 text-sm text-white/60">
          No complaint names {person.full_name}.
        </div>
      ) : (
        <div className="space-y-3">
          {complaints.map((c) => (
            <Link
              key={c.id}
              href={`/complaints/${c.id}`}
              className="glass-card block p-5 hover:bg-white/5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-white">{c.subject}</p>
                  <p className="mt-1 text-sm text-white/55">
                    Raised {ukDate(c.date_raised)}
                    {c.branch_name ? ` · ${c.branch_name}` : ""}
                    {c.service_user_name ? ` · about ${c.service_user_name}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* The finding, said plainly, next to the status. An upheld complaint and a
                      dismissed one must never look the same at a glance. */}
                  {c.upheld === true ? (
                    <span className="pill pill-red">Upheld</span>
                  ) : c.upheld === false ? (
                    <span className="pill pill-green">Not upheld</span>
                  ) : (
                    <span className="pill">No finding yet</span>
                  )}
                  <span className="pill">{COMPLAINT_STATUS_LABELS[c.status]}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="form-hint">
        Only complaints naming {person.full_name} are shown. A complaint that was investigated
        and not upheld is listed so the record is complete, and is marked as not upheld.
      </p>
    </div>
  );
}
