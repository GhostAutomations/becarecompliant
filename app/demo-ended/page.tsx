import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getCompanyDemo } from "@/lib/demo/data";

/**
 * THE END OF A DEMO (0356). Outside the (app) group, like /trial-ended, so no navigation bounces
 * back here. requireProfile, not requireCompany: requireCompany is what sent them here.
 * Offers the survey if it has not been answered.
 */
export const metadata: Metadata = { title: "Demo ended" };

export default async function DemoEndedPage() {
  const { profile } = await requireProfile();
  if (profile.role === "platform_admin") redirect("/founder");
  const demo = await getCompanyDemo(profile.company_id);
  if (!demo || (demo.phase !== "ended" && demo.phase !== "purge_due")) redirect("/dashboard");

  const supabase = await createClient();
  const { data: token } = await supabase.rpc("demo_feedback_token");
  let answered = false;
  if (typeof token === "string") {
    const { data: status } = await supabase.rpc("demo_feedback_status", { p_token: token });
    answered = Boolean((status as { submitted?: boolean } | null)?.submitted);
  }
  const contact = process.env.CONTACT_EMAIL || "hello@becarecompliant.com";

  return (
    <main className="app-bg flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="glass-card w-full max-w-lg p-8">
        <h1 className="text-xl font-semibold text-white">Your demo has ended</h1>
        <p className="mt-3 text-sm text-white/70">
          Thank you for trying Be Care Compliant. The demo company was made up for you, so none of
          it carries over, and it will be deleted shortly. When you are ready for your own
          account, or you would like a little longer, get in touch at{" "}
          <a href={`mailto:${contact}`} className="text-gold-200 underline">{contact}</a>.
        </p>
        {typeof token === "string" && !answered ? (
          <div className="mt-6 space-y-2">
            <Link href={`/demo-feedback/${token}?from=app`} className="btn-primary inline-block">
              Tell us what you thought
            </Link>
            <p className="text-xs text-white/50">About two minutes: seven scores and three short questions.</p>
          </div>
        ) : null}
        <div className="mt-8 border-t border-white/10 pt-4">
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn-ghost px-3 py-2 text-xs">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
