import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import { getReg80Review } from "@/lib/reg80/data";
import { listReg73Signatories } from "@/lib/reg73/data";
import Reg80Form from "@/components/reg80/reg80-form";
import { getBranchTerms } from "@/lib/branches/company-word";
import { writeAudit } from "@/lib/audit";
import { canEditRegReport, canViewRegReport } from "@/lib/reg73/roles";

export const metadata: Metadata = { title: "Regulation 80 review" };

export default async function Reg80ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  const bw = await getBranchTerms(profile.company_id);
  if (!canViewRegReport(profile.role)) redirect("/reports");

  const { id } = await params;
  const review = await getReg80Review(id);
  if (!review || review.company_id !== profile.company_id) redirect("/reports/reg80");

  const supabase = await createClient();
  const [{ data: branch }, signatories] = await Promise.all([
    supabase.from("branches").select("name").eq("id", review.branch_id).maybeSingle(),
    listReg73Signatories(profile.company_id),
  ]);
  const branchName = (branch?.name as string) ?? bw.one;
  const canEdit = canEditRegReport(profile.role) && review.status === "draft";

  /* GDPR: opening a review is audited, not just exporting it (Phil, 11 Oct 2026, audit F16), the
     same as service_user.viewed. The review holds safeguarding figures and named records. Best
     effort; never blocks the page. */
  await writeAudit({
    companyId: profile.company_id,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "reg80.viewed",
    entityType: "reg80_review",
    entityId: review.id,
    summary: `Viewed the Regulation 80 review for ${branchName}`,
  });

  return (
    <div className="page-shell space-y-5">
      <BackLink href="/reports/reg80" label="Back to Regulation 80 reviews" />
      <div>
        <h1 className="page-title">Quality of Care Review</h1>
        <p className="page-subtitle">{review.reference ?? branchName}</p>
      </div>
      <Reg80Form review={review} branchName={branchName} canEdit={canEdit} signatories={signatories} />
    </div>
  );
}
