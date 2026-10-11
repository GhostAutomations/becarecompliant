import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import { getReg73Visit, listReg73Signatories } from "@/lib/reg73/data";
import Reg73Form from "@/components/reg73/reg73-form";
import { getBranchTerms } from "@/lib/branches/company-word";
import { writeAudit } from "@/lib/audit";
import { canEditRegReport, canViewRegReport } from "@/lib/reg73/roles";

export const metadata: Metadata = { title: "Regulation 73 visit" };

export default async function Reg73VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  const bw = await getBranchTerms(profile.company_id);
  if (!canViewRegReport(profile.role)) redirect("/reports");

  const { id } = await params;
  const visit = await getReg73Visit(id);
  if (!visit || visit.company_id !== profile.company_id) redirect("/reports/reg73");

  const supabase = await createClient();
  const [{ data: branch }, signatories] = await Promise.all([
    supabase.from("branches").select("name").eq("id", visit.branch_id).maybeSingle(),
    listReg73Signatories(profile.company_id),
  ]);
  const branchName = (branch?.name as string) ?? bw.one;
  const canEdit = canEditRegReport(profile.role) && visit.status === "draft";

  /* GDPR: opening a report is audited, not just exporting it (Phil, 11 Oct 2026, audit F16), the
     same as service_user.viewed. The visit holds the RI's signature and named records. Best
     effort; never blocks the page. */
  await writeAudit({
    companyId: profile.company_id,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "reg73.viewed",
    entityType: "reg73_visit",
    entityId: visit.id,
    summary: `Viewed the Regulation 73 visit for ${branchName}`,
  });

  return (
    <div className="page-shell space-y-5">
      <BackLink href="/reports/reg73" label="Back to Regulation 73 visits" />
      <div>
        <h1 className="page-title">Responsible Individual {bw.one} Visit</h1>
        <p className="page-subtitle">{visit.reference ?? branchName}</p>
      </div>
      <Reg73Form visit={visit} branchName={branchName} canEdit={canEdit} signatories={signatories} />
    </div>
  );
}
