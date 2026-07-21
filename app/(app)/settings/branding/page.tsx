import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import ActionForm from "@/components/action-form";
import { getCompanyLogoDataUrl } from "@/lib/invoicing/logo";
import { saveCompanyLogo } from "@/app/(app)/settings/actions";

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
        <p className="form-hint mt-1">Shown at the top of every invoice and its PDF. PNG or JPG, under 2MB.</p>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Company logo" className="mt-3 max-h-24 w-auto object-contain rounded bg-white/90 p-2" />
        ) : null}
        <div className="mt-4">
          <ActionForm action={saveCompanyLogo} label="Upload logo">
            <input
              type="file"
              name="logo"
              accept="image/png,image/jpeg,image/webp"
              className="text-sm text-white/70 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-gold-400 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#0f1424] hover:file:bg-gold-400/90"
            />
          </ActionForm>
        </div>
      </section>
    </div>
  );
}
