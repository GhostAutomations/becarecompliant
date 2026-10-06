import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import LogoUploader from "@/components/settings/logo-uploader";
import { getCompanyLogoDataUrl } from "@/lib/invoicing/logo";
import DocumentColours from "@/components/settings/document-colours";
import { createServiceClient } from "@/lib/supabase/admin";
import { documentColours } from "@/lib/policies/cover";

export const metadata: Metadata = { title: "Branding" };

export default async function BrandingSettingsPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");
  const logoUrl = await getCompanyLogoDataUrl(profile.company_id);
  const { data: co } = await createServiceClient()
    .from("companies")
    .select("name, brand_primary, brand_secondary")
    .eq("id", profile.company_id)
    .maybeSingle<{ name: string; brand_primary: string | null; brand_secondary: string | null }>();
  const colours = documentColours(co?.brand_primary, co?.brand_secondary);

  return (
    <div className="page-form space-y-6">
      <BackLink href="/settings" label="Back to Settings" />
      <div>
        <h1 className="page-title">Branding</h1>
        <p className="page-subtitle">Your company logo and colours, used on invoices, policies and other documents.</p>
      </div>

      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">Company logo</h2>
        <p className="form-hint mt-1">Shown at the top of every invoice, and on the cover of every policy written here. PNG or JPG. You can crop it before saving.</p>
        {logoUrl ? (
          <div>
            <p className="mt-3 text-xs uppercase tracking-wide text-white/45">Current logo</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="Company logo" className="mt-1 max-h-24 w-auto object-contain rounded bg-white/90 p-2" />
          </div>
        ) : null}
        <div className="mt-4">
          <LogoUploader />
        </div>
      </section>

      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">Document colours</h2>
        <p className="form-hint mt-1 mb-4">Used on the cover of every policy written here.</p>
        <DocumentColours
          key={`${colours.primary}${colours.secondary}`}
          primary={colours.primary}
          secondary={colours.secondary}
          isDefault={!co?.brand_primary && !co?.brand_secondary}
          companyName={co?.name ?? "Your company"}
        />
      </section>
    </div>
  );
}
