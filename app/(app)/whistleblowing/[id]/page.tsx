import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import EditDisclosureForm from "@/components/whistleblowing/edit-disclosure-form";
import DisclosureStatusControl from "@/components/whistleblowing/disclosure-status-control";
import { getDisclosure, listCompanyBranches } from "@/lib/whistleblowing/data";
import { DISCLOSURE_STATUS_LABELS } from "@/lib/whistleblowing/types";
import { formatUkDate, todayIso } from "@/lib/whistleblowing/logic";

export const metadata: Metadata = { title: "Disclosure" };

const MANAGE_ROLES = ["company_admin", "registered_individual", "platform_admin"];

export default async function DisclosurePage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/dashboard");
  if (!MANAGE_ROLES.includes(profile.role)) redirect("/dashboard");

  const { id } = await params;
  // RLS decides this. A disclosure this user may not read comes back null and is a 404 —
  // indistinguishable from one that does not exist, which is the point.
  const record = await getDisclosure(id);
  if (!record) notFound();

  const branches = await listCompanyBranches(profile.company_id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <BackLink href="/whistleblowing" label="Back to Whistleblowing" />
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="page-title">{record.category}</h1>
          <span className="text-sm text-white/50">
            Received {formatUkDate(record.received_on)}
          </span>
        </div>
        <p className="page-subtitle">
          {record.branch_name ?? "Company wide"} —{" "}
          {record.anonymous ? "Anonymous" : record.discloser_name || "Named"} —{" "}
          {DISCLOSURE_STATUS_LABELS[record.status]}
          {record.closed_on ? ` on ${formatUkDate(record.closed_on)}` : ""}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="glass-card p-6">
          <EditDisclosureForm record={record} branches={branches} todayIso={todayIso()} />
        </div>

        <div className="space-y-6">
          <div className="glass-card p-5">
            <DisclosureStatusControl
              disclosureId={record.id}
              status={record.status}
              closedOn={record.closed_on}
              todayIso={todayIso()}
            />
          </div>
          <div className="glass-card p-5 text-xs text-white/50">
            <p className="mb-1 font-medium text-white/70">Who can read this</p>
            <p>
              The Admin and the Responsible Individual. Enforced in the database, so it holds
              whatever any screen in the product does next.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
