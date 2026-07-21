import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import OutcomesEditor from "@/components/service-users/outcomes-editor";
import { getServiceUser, getServiceUserOutcomes } from "@/lib/service-users/data";

export const metadata: Metadata = { title: "Personal outcomes" };

const MANAGE_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager", "platform_admin"];

export default async function ServiceUserOutcomesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await requireCompany();
  const su = await getServiceUser(id);
  if (!su) redirect("/service-users");
  if (!MANAGE_ROLES.includes(profile.role)) redirect(`/service-users/${id}`);
  const outcomes = await getServiceUserOutcomes(id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href={`/service-users/${id}`} label="Back to record" />
      <div>
        <h1 className="page-title">Personal outcomes</h1>
        <p className="page-subtitle">{su.full_name}</p>
      </div>
      <p className="text-sm text-white/55">
        What matters to this person, and how they are progressing. These feed the well-being outcomes in your PQS return.
      </p>

      <OutcomesEditor serviceUserId={id} initial={outcomes} />
    </div>
  );
}
