import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import { getReg80Review } from "@/lib/reg80/data";
import { listReg73Signatories } from "@/lib/reg73/data";
import Reg80Form from "@/components/reg80/reg80-form";

export const metadata: Metadata = { title: "Regulation 80 review" };

const VIEW_ROLES = ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"];
const EDIT_ROLES = ["platform_admin", "company_admin", "registered_individual", "registered_manager"];

export default async function Reg80ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  if (!VIEW_ROLES.includes(profile.role)) redirect("/reports");

  const { id } = await params;
  const review = await getReg80Review(id);
  if (!review || review.company_id !== profile.company_id) redirect("/reports/reg80");

  const supabase = await createClient();
  const [{ data: branch }, signatories] = await Promise.all([
    supabase.from("branches").select("name").eq("id", review.branch_id).maybeSingle(),
    listReg73Signatories(profile.company_id),
  ]);
  const branchName = (branch?.name as string) ?? "Branch";
  const canEdit = EDIT_ROLES.includes(profile.role) && review.status === "draft";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <BackLink href="/reports/reg80" label="Back to Regulation 80 reviews" />
      <div>
        <h1 className="page-title">Quality of Care Review</h1>
        <p className="page-subtitle">{review.reference ?? branchName}</p>
      </div>
      <Reg80Form review={review} branchName={branchName} canEdit={canEdit} signatories={signatories} />
    </div>
  );
}
