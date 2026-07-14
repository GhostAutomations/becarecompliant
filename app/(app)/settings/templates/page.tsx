import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import { ImportTemplatesPanel } from "@/components/settings/import-templates-panel";

export const metadata: Metadata = { title: "Templates" };

export default async function SettingsTemplatesPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  const supabase = await createClient();
  const [{ count: formCount }, { count: courseCount }] = await Promise.all([
    supabase
      .from("forms")
      .select("id", { count: "exact", head: true })
      .eq("company_id", profile.company_id),
    supabase
      .from("training_courses")
      .select("id", { count: "exact", head: true })
      .eq("company_id", profile.company_id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/settings" label="Back to Settings" />

      <div>
        <h1 className="page-title">Templates</h1>
        <p className="page-subtitle">
          Pull the latest forms and training courses from the Be Care Compliant
          library into your company.
        </p>
      </div>

      <section className="glass-card p-5">
        <h2 className="mb-1 text-sm font-semibold text-white/80">
          Import the latest library
        </h2>
        <p className="mb-4 text-sm text-white/60">
          Your company currently has {formCount ?? 0}{" "}
          {formCount === 1 ? "form" : "forms"} and {courseCount ?? 0} training{" "}
          {courseCount === 1 ? "course" : "courses"}. Importing adds any new
          templates from the library that you do not already have. Forms and
          courses you have edited or built yourself are never touched, and running
          it again is safe.
        </p>
        <ImportTemplatesPanel />
      </section>
    </div>
  );
}
