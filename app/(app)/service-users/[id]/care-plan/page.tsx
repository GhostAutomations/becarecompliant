import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import CarePlanEditor from "@/components/service-users/care-plan-editor";
import CarePlanUpload from "@/components/service-users/care-plan-upload";
import { getServiceUser, getCarePlanEntries } from "@/lib/service-users/data";

export const metadata: Metadata = { title: "Care plan" };

const MANAGE_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager", "platform_admin"];

export default async function CarePlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await requireCompany();
  const su = await getServiceUser(id);
  if (!su) redirect("/service-users");
  if (!MANAGE_ROLES.includes(profile.role)) redirect(`/service-users/${id}`);
  const entries = await getCarePlanEntries(id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <BackLink href={`/service-users/${id}`} label="Back to record" />
      <div>
        <h1 className="page-title">Care plan</h1>
        <p className="page-subtitle">{su.full_name}</p>
      </div>

      <CarePlanEditor serviceUserId={id} initial={entries} />

      <CarePlanUpload serviceUserId={id} uploadedAt={su.care_plan_uploaded_at ?? null} editable />
    </div>
  );
}
