import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import ActionForm from "@/components/action-form";
import { getComplaintsConfig } from "@/lib/complaints/data";
import { updateComplaintsConfig } from "@/lib/complaints/actions";

export const metadata: Metadata = { title: "Complaints settings" };

export default async function ComplaintsSettingsPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");
  const config = await getComplaintsConfig(profile.company_id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackLink href="/settings" label="Back to Settings" />
      <div>
        <h1 className="page-title">Complaints</h1>
        <p className="page-subtitle">
          Set the response timescales used to calculate each complaint's deadlines.
          The deadlines stay editable on the individual complaint.
        </p>
      </div>

      <section className="glass-card p-5">
        <ActionForm action={updateComplaintsConfig} label="Save timescales">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="acknowledgement_days" className="form-label">Acknowledge within</label>
              <input id="acknowledgement_days" name="acknowledgement_days" type="number" min={0} defaultValue={config.acknowledgement_days} />
              <p className="form-hint">days</p>
            </div>
            <div>
              <label htmlFor="response_days" className="form-label">Respond within</label>
              <input id="response_days" name="response_days" type="number" min={0} defaultValue={config.response_days} />
              <p className="form-hint">days</p>
            </div>
            <div>
              <label htmlFor="amber_days" className="form-label">Amber window</label>
              <input id="amber_days" name="amber_days" type="number" min={0} defaultValue={config.amber_days} />
              <p className="form-hint">days before due</p>
            </div>
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" name="count_working_days" defaultChecked={config.count_working_days} />
            Count in working days (skip weekends)
          </label>
          <p className="mt-2 text-xs text-white/45">
            Cited sector defaults: acknowledge within 3 working days, respond within 25
            working days. England follows CQC Regulation 16 and the Local Government and
            Social Care Ombudsman benchmarks. Wales follows the Social Services Complaints
            Procedure (Wales) Regulations 2014. Bank holidays are not counted, so adjust a
            deadline on the complaint if needed.
          </p>
        </ActionForm>
      </section>
    </div>
  );
}
