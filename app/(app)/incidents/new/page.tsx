import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import CreateIncidentForm from "@/components/incidents/create-incident-form";
import {
  listAccessibleBranchTypes,
  listServiceUsersLite,
  listPeopleLite,
} from "@/lib/incidents/data";
import { todayIso } from "@/lib/incidents/logic";

export const metadata: Metadata = { title: "Record an incident" };

const MANAGE_ROLES = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "platform_admin",
];

export default async function NewIncidentPage() {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) redirect("/incidents");
  if (!MANAGE_ROLES.includes(profile.role)) redirect("/incidents");

  const [branches, serviceUsers, people] = await Promise.all([
    listAccessibleBranchTypes(profile.company_id, profile.role, user.id),
    listServiceUsersLite(profile.company_id),
    listPeopleLite(profile.company_id),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <BackLink href="/incidents" label="Back to Incidents" />
        <h1 className="page-title mt-1">Record an incident</h1>
        <p className="page-subtitle">
          Record what happened while it is fresh. Whether it is notifiable or needs a
          safeguarding referral can be ticked now and dated later — the register keeps
          asking until it is done.
        </p>
      </div>

      <div className="glass-card p-6">
        <CreateIncidentForm
          branches={branches.map((b) => ({ id: b.id, name: b.name }))}
          serviceUsers={serviceUsers}
          people={people}
          todayIso={todayIso()}
        />
      </div>
    </div>
  );
}
