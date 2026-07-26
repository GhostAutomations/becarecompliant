import type { Metadata } from "next";
import { publicFormDef } from "@/lib/public-forms/config";
import { resolvePublicForm } from "@/lib/public-forms/data";
import PublicForm from "@/components/public-forms/public-form";

/**
 * PUBLIC page: a team member fills in one of their company's published forms
 * with no account and no login (in middleware PUBLIC_PATHS).
 *
 * The page is WRITE ONLY. It renders the company's name and the form itself and
 * nothing else: no staff list, no records, no previous submissions. An unknown
 * slug, a form that was never published, or a link switched off all show the
 * same neutral message.
 */

export const metadata: Metadata = { title: "Form" };
export const dynamic = "force-dynamic";

export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ slug: string; formKey: string }>;
}) {
  const { slug, formKey } = await params;
  const def = publicFormDef(formKey);
  const resolved = def ? await resolvePublicForm(slug, formKey) : null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-navy-950 via-navy-900 to-navy-800 p-4">
      <div className="mx-auto w-full max-w-2xl py-8">
        <p className="text-sm font-bold text-white">
          Be Care <span className="text-gold-400">Compliant</span>
        </p>

        {!resolved || !def ? (
          <div className="glass-card mt-6 p-6">
            <h1 className="text-lg font-semibold text-white">This form is not available</h1>
            <p className="mt-2 text-sm text-white/70">
              The link may have been withdrawn or copied incorrectly. Please check with your
              manager.
            </p>
          </div>
        ) : (
          <>
            <h1 className="mt-6 text-2xl font-semibold text-white">{def.publicTitle}</h1>
            <p className="mt-1 text-sm text-white/60">{resolved.companyName}</p>
            <div className="mt-6">
              <PublicForm
                companySlug={slug}
                formKey={formKey}
                schema={resolved.schema}
                intro={def.publicIntro}
              />
            </div>
          </>
        )}

        <p className="mt-8 text-xs text-white/35">
          Your answers are sent to your employer and stored as part of their compliance
          records.
        </p>
      </div>
    </main>
  );
}
