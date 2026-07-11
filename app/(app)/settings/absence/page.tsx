import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import { getAbsenceConfig, getAbsenceConfigRow } from "@/lib/absence/data";
import AbsenceSettings from "@/components/settings/absence-settings";

export const metadata: Metadata = { title: "Absence settings" };

export default async function AbsenceSettingsPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  const [config, row] = await Promise.all([
    getAbsenceConfig(profile.company_id),
    getAbsenceConfigRow(profile.company_id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <BackLink href="/settings" label="Back to Settings" />
        <h1 className="page-title mt-1">Absence</h1>
        <p className="page-subtitle">
          Choose how absence is tracked, set the thresholds, and upload your policy so
          AI can suggest the right settings.
        </p>
      </div>

      <AbsenceSettings
        initialMethod={config.method}
        initialWindow={config.rollingWindowDays}
        initialThresholds={config.thresholds}
        policyUploadedAt={row?.policy_uploaded_at ?? null}
        policyAiSummary={row?.policy_ai_summary ?? null}
      />
    </div>
  );
}
