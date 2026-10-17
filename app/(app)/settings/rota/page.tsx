import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { getCompanyRow } from "@/lib/companies/row";
import { moduleOnInRow } from "@/lib/modules/switch";
import { getRotaSettings } from "@/lib/rota/settings";
import BackLink from "@/components/back-link";
import RotaSettingsForm from "@/components/rota/rota-settings-form";
import CancellationSettings from "@/components/rota/cancellation-settings";
import { getCancelSettings } from "@/lib/rota/cancellations-data";

export const metadata: Metadata = { title: "Rota settings" };

/**
 * Settings, Rota (Rota and Visits Stage 7b, Phil's popups 2026-10-17; docs/decisions/rota-visits.md,
 * Stage 7b decisions 5, 6, 9, 14 and 16): the rota timings each company can change, and the
 * cancellation reasons and rules. Company Admins, and only
 * while the company has Rota and Visits on (Not Found otherwise, as the Rota pages do).
 */
export default async function RotaSettingsPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");
  if (!moduleOnInRow(await getCompanyRow(profile.company_id), "rota_visits")) notFound();
  const [settings, cancel] = await Promise.all([getRotaSettings(profile.company_id), getCancelSettings(profile.company_id)]);

  return (
    <div className="page-shell space-y-6">
      <div>
        <BackLink href="/settings" label="Back to Settings" />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="page-title">Rota settings</h1>
          <span className="pill pill-amber">Beta</span>
        </div>
        <p className="page-subtitle">The timings your rota, alerts and carers&apos; phones work to. Changes apply from the next minute.</p>
      </div>
      <section className="glass-card p-5">
        <RotaSettingsForm settings={settings} />
      </section>
      <h2 className="pt-2 text-lg font-semibold text-white">Cancellations</h2>
      <CancellationSettings reasons={cancel.reasons} branches={cancel.branches} funders={cancel.funders} error={cancel.error} />
    </div>
  );
}
