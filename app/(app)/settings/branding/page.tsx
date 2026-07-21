import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import LogoUploader from "@/components/settings/logo-uploader";
import { getCompanyLogoDataUrl } from "@/lib/invoicing/logo";

export const metadata: Metadata = { title: "Branding" };

export default async function BrandingSettingsPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");
  const logoUrl = await getCompanyLogoDataUrl(profile.company_id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackLink href="/settings" label="Back to Settings" />
      <div>
        <h1 className="page-title">Branding</h1>
        <p className="page-subtitle">Your company logo, used on invoices and other documents.</p>
      </div>

      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">Company logo</h2>
        <p className="form-hint mt-1">Shown at the top of every invoice and its PDF. PNG or JPG. You can crop it before saving.</p>
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
    </div>
  );
}
